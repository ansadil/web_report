# Reports Web

> Embeddable reporting tool for web projects (Laravel, Next.js, or any JS host).

Packages are **0.1.0** (pre-1.0). The license is **proprietary** — see `LICENSE`. This is not open-source software.

## Highlights

- **Two products**: `Viewer` (renders reports from JSON schema) and `Builder` (WYSIWYG with drag & drop).
- **Framework-agnostic core**: Web Components (Lit) + thin React & Vue wrappers.
- **Banded layout**: ReportHeader / PageHeader / GroupHeader / Detail / GroupFooter / PageFooter / ReportFooter.
- **Content elements**: text, fields, images, charts, aggregates, lines, boxes.
- **Built-in aggregates**: `sum`, `count`, `avg`, `min`, `max`, `if`, plus a safe expression evaluator.
- **5 data adapters**: REST, GraphQL, SQL-Proxy, Static, Custom.
- **Exporters**: PDF, Excel, PNG, Print.
- **i18n**: Arabic / English with full RTL support.
- **Zero-impact async logging**.

## Packages

| Package | Role |
|---|---|
| `@reports-web/shared` | Cross-package types and small utilities |
| `@reports-web/core` | Web Components, report engine, adapters, and exporters |
| `@reports-web/react` | Thin React 18+ wrapper |
| `@reports-web/vue` | Thin Vue 3 wrapper |

The designer is part of `@reports-web/core` (`<reports-builder>`). There is no separate builder package.

## Custom elements

`@reports-web/core` registers two Lit custom elements (also available from the `./viewer` and `./builder` entry points):

- `<reports-viewer>` — renders a report from a JSON schema
- `<reports-builder>` — WYSIWYG designer (drag and drop, properties, save/load)

Importing `@reports-web/core` registers both tags. The React and Vue wrappers register the same tags when they are not already defined.

## Quick start (Vanilla HTML)

```html
<script type="module" src="/path/to/@reports-web/core/dist/index.js"></script>

<reports-viewer
  id="r1"
  locale="ar"
  dir="rtl"
></reports-viewer>

<script type="module">
  const v = document.getElementById('r1');
  v.schema = mySchema;       // ReportSchemaV1
  v.dataAdapter = { fetch: async () => myRows };
</script>
```

`<reports-builder>` is used the same way: import the core package (or `@reports-web/core/builder`) and place the element in the page.

## Quick start (React)

```tsx
import { ReportViewer } from '@reports-web/react';

<ReportViewer
  schema={mySchema}
  dataAdapter={{ fetch: async () => myRows }}
  locale="ar"
  dir="rtl"
  onExport={(blob, kind) => downloadBlob(blob, `report.${kind}`)}
/>
```

`ReportBuilder` is exported from the same package.

## Fonts in bundled apps (offline)

Fonts (`fonts.json`, WOFF2 for the UI, TTF for PDF) ship in `@reports-web/core/assets/fonts/`. The default `fontsBaseUrl` is resolved from the core module's URL, which is right in Node and when the package is served unbundled, but a bundler (Vite, webpack, …) moves that module. If your app bundles the library:

1. Copy `node_modules/@reports-web/core/assets/fonts/` into your build output (e.g. `public/assets/fonts/` or a copy step), so it is served from your own origin.
2. Pass that folder explicitly to `<reports-viewer>` and `<reports-builder>` (the viewer passes it on to PDF export; call `exportPdf({ …, fontsBaseUrl })` yourself if you use it directly):

```ts
const fontsBaseUrl = new URL('assets/fonts/', document.baseURI).href;
viewer.fontsBaseUrl = fontsBaseUrl; // or the fonts-base-url attribute
builder.fontsBaseUrl = fontsBaseUrl;
```

`apps/playground/vite.config.ts` shows a small Vite plugin that does the copy (and serves the folder in dev).

## Develop

```bash
pnpm install
pnpm build
pnpm test:run
pnpm lint
pnpm playground   # opens http://localhost:5173
```

See `PROJECT_MAP.md` for full architecture and milestones.

## License

Proprietary. Copyright (c) 2026 ansadil. All rights reserved.

No use, copying, modification, or distribution is permitted without the prior written permission of the copyright holder. The software is provided AS IS, without warranty. Package manifests set `"license": "UNLICENSED"` and `"private": true`.
