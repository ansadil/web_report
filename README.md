# Reports Web

> Embeddable reporting tool for web projects (Laravel, Next.js, or any JS host).

## Highlights

- **Two products**: `Viewer` (renders reports from JSON schema) and `Builder` (WYSIWYG with drag & drop).
- **Framework-agnostic core**: Web Component (Lit) + thin React & Vue wrappers.
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
| `@reports-web/core` | Web Components + engine + adapters + exporters |
| `@reports-web/builder-ui` | WYSIWYG canvas with drag & drop |
| `@reports-web/react` | Thin React 18+/19 wrapper |
| `@reports-web/vue` | Thin Vue 3 wrapper |
| `@reports-web/shared` | Cross-package types & tiny utilities |

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

## Develop

```bash
pnpm install
pnpm build
pnpm test:run
pnpm playground   # opens http://localhost:5173
```

See `PROJECT_MAP.md` for full architecture and milestones.
