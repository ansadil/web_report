# @reports-web/convex

Optional [Convex](https://convex.dev) backend for reports-web:

- **Versioned template storage**: Convex tables plus function factories (`@reports-web/convex/server`) and a
  `ConvexTemplateStore` client that implements the core `TemplateStore` interface.
- **`createConvexDataAdapter`**: a core `DataAdapter` that loads report rows from a Convex query or HTTP action.

`convex` is a peer dependency (`>=1.17 <2`). Nothing here changes the UI or the exporters.

## Template model

| Table | Fields | Indexes |
|---|---|---|
| `reportTemplates` (head) | `templateId`, `name`, `currentVersion`, `updatedAt`, `ownerId?`, `orgId?` | `by_template_id`, `by_updated`, `by_owner`, `by_org` |
| `reportTemplateVersions` | `templateId`, `version`, `schemaJson`, `createdAt`, `createdBy?` | `by_template_version` (`templateId`, `version`) |

- Versions are immutable and numbered 1, 2, 3, ... per template. `save` always appends one.
- `save` runs as a single Convex mutation, which is a serializable transaction. It reads the head, checks
  `expectedVersion`, inserts the version, and patches the head. Two editors racing from the same version
  cannot both win: one of them gets `TemplateVersionConflictError`.
- `expectedVersion` is optional. `0` means "must not exist yet". Leaving it out appends unconditionally
  (last writer wins).
- `save(null, ...)` creates a template whose id is the head document's `_id`.
- The schema is stored as a JSON string (`schemaJson`). This keeps report schemas clear of Convex field-name
  rules.
- Schemas are validated against ReportSchemaV1 on the client before saving, again on the server inside
  `save`, and once more on load. Errors are typed (`InvalidTemplateSchemaError` with `phase: 'save' | 'load'`).

### Permissions are the host's job

The functions allow everything by default. Pass `authorize(ctx, action, templateId?)` to restrict them.
`action` is one of `list`, `read`, `listVersions`, `create`, `save` or `delete`. Returning `false` or
throwing gives `TEMPLATE_ACCESS_DENIED`, which the client surfaces as `TemplateAccessDeniedError`. A
`ConvexError` you throw yourself is passed through unchanged.

Note that `list` gets no `templateId`. Scope it with the `orgId` / `ownerId` arguments, and check those
arguments in `authorize` or in your own wrapper query.

## Server

```ts
// convex/schema.ts
import { defineSchema } from 'convex/server';
import { reportTemplateTables } from '@reports-web/convex/server';

export default defineSchema({ ...reportTemplateTables /*, ...your tables */ });
```

```ts
// convex/reportTemplates.ts
import { defineTemplateFunctions } from '@reports-web/convex/server';

export const { list, get, save, listVersions, remove } = defineTemplateFunctions({
  authorize: async (ctx, action) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return false;
    return action === 'list' || action === 'read' || action === 'listVersions' || user.tokenIdentifier.endsWith('|admin');
  },
});
```

`createTemplateHandlers(opts)` exposes the bare handlers if you prefer to wrap them yourself, for example as
`internalQuery` or with extra arguments.

## Client

```ts
import { ConvexHttpClient } from 'convex/browser'; // or ConvexClient / ConvexReactClient / convex-vue
import { ConvexTemplateStore } from '@reports-web/convex';
import { TemplateVersionConflictError } from '@reports-web/core';
import { api } from '../convex/_generated/api';

const store = new ConvexTemplateStore({ client: new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL), api: api.reportTemplates });

const { id, version } = await store.save(null, schema, { meta: { orgId: 'acme' } });
const latest = await store.get(id);          // StoredTemplate | null
const v1 = await store.get(id, 1);
try {
  await store.save(id, edited, { expectedVersion: latest!.currentVersion });
} catch (e) {
  if (e instanceof TemplateVersionConflictError) { /* reload and merge */ }
}
```

`TemplateVersionConflictError`, `InvalidTemplateSchemaError` and `TemplateAccessDeniedError` come from
`@reports-web/core` (or `@reports-web/core/adapters/storage/template-store`).

## Data adapter

```ts
import { createConvexDataAdapter } from '@reports-web/convex';

// A query taking { source: string, params: any }, returning rows (or { rows }).
const data = createConvexDataAdapter({ client, query: api.reports.rows });
// ...or an HTTP action that receives a JSON POST { source, params }
const http = createConvexDataAdapter({ httpUrl: 'https://<deployment>.convex.site/reports/data', headers: async () => ({ authorization: `Bearer ${await getToken()}` }) });
```

The adapter sends the report's resolved parameters. `Date`s become ISO strings and `undefined` values are
dropped. Failures come back as `Error('Convex data source "<source>" failed: …')`, with the original error
as `cause`. An aborted `AbortSignal` rejects right away. A Convex one-shot query cannot be cancelled, so its
result is simply ignored. `describe` (a static object or an async function) is optional.

## Example: Nuxt 3 + Convex (Madar)

> **Example only.** This sketch shows how a Nuxt 3 app such as
> [Madar](https://github.com/ansadil/Madar) could wire things up. It is not taken from Madar's code, and
> Madar is not changed by this package. File names, the env var and the plugin are assumptions. The actual
> wiring belongs in a separate Madar PR.

```ts
// plugins/reports.client.ts
import { ConvexClient } from 'convex/browser';
import { ConvexTemplateStore, createConvexDataAdapter } from '@reports-web/convex';
import { api } from '~/convex/_generated/api';

export default defineNuxtPlugin(() => {
  const convex = new ConvexClient(useRuntimeConfig().public.convexUrl);
  // Madar's auth would call convex.setAuth(fetchToken) here.
  return {
    provide: {
      reportTemplates: new ConvexTemplateStore({ client: convex, api: api.reportTemplates }),
      reportData: createConvexDataAdapter({ client: convex, query: api.reports.rows }),
    },
  };
});
```

```vue
<!-- pages/reports/[id].vue -->
<script setup lang="ts">
import { ReportBuilder } from '@reports-web/vue';
const { $reportTemplates, $reportData } = useNuxtApp();
const route = useRoute();
const tpl = ref(await $reportTemplates.get(String(route.params.id)));

async function onSave(schema) {
  const r = await $reportTemplates.save(tpl.value?.id ?? null, schema, { expectedVersion: tpl.value?.currentVersion ?? 0 });
  tpl.value = await $reportTemplates.get(r.id);
}
</script>

<template>
  <ClientOnly><ReportBuilder :schema="tpl?.schema" :data-adapter="$reportData" @save="onSave" /></ClientOnly>
</template>
```

`@reports-web/vue`'s `ReportBuilder` takes `schema` / `dataAdapter` props and emits `save` with the edited schema.

## Testing your own store

`@reports-web/core/adapters/storage/template-store-contract` exports `defineTemplateStoreContract`. It is a
runner-agnostic conformance suite. This package runs it against `ConvexTemplateStore` on top of
[`convex-test`](https://www.npmjs.com/package/convex-test), and core runs it against `InMemoryTemplateStore`.
