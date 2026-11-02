# Nuxt Integration Example

Embed `<ReportViewer>` and `<ReportBuilder>` from `@reports-web/vue` in a Nuxt 3 app with SSR.

## Install

```bash
npm install @reports-web/vue @reports-web/core
```

## Files in this example

- `app.vue` — SSR shell; wraps the demo in `<ClientOnly>`
- `demo.vue` — client-only Viewer + Builder (Web Components need the browser)
- `nuxt.config.ts` — Vite/Nitro tweaks for the workspace packages
- `public/fonts/` — copied from `@reports-web/core/assets/fonts` at build time

## Run

From the monorepo root:

```bash
pnpm build
pnpm --dir examples/nuxt install
pnpm --dir examples/nuxt run dev
```

Production smoke (same path CI uses):

```bash
pnpm --dir examples/nuxt run build
PORT=4303 pnpm --dir examples/nuxt run start:ci
```

## Notes

- Reports Web registers Lit custom elements in the browser. Keep imports of `@reports-web/vue` behind `<ClientOnly>` (or a `.client.vue` component) so they never run during SSR.
- Bundlers move the core module URL, so copy fonts into `public/fonts/` and pass `fonts-base-url="/fonts/"` (see root README).
- Mark `reports-*` tags as custom elements in `nuxt.config.ts` if you use the raw tags in templates.
