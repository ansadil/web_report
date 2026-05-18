# Reports Web · Demo Playground

A complete, runnable example app that exercises every feature of Reports Web in one place.

## What this demo shows

| Feature | Demonstrated by |
|---|---|
| 8 element kinds (text, field, image, chart, aggregate, expression, line, box) | All 4 sample reports |
| Banded layout (Report/Page Header, Detail, Group Header/Footer, Page/Report Footer) | Sales by Region |
| Built-in aggregates (sum, count, avg) | Sales/Employees reports |
| Conditional formatting (`cond` rules) | Sales (highlight amount ≥ 500), Employees (salary tiers), Invoices (status colors) |
| Expression evaluator (computed columns) | Expression Demo report |
| Charts (bar + pie) | Sales by Region (bar), Invoices Summary (pie) |
| Multiple page orientations | Invoices + Expression Demo use landscape |
| Date / number formatting via `Intl` | All reports |
| **5 sample Data Adapters** | `StaticAdapter` here; REST/GraphQL/SQL/Custom in `examples/` |
| **Storage Adapter** | `LocalStorageAdapter` — saved reports persist across page reloads |
| RTL / LTR full switch | Click **AR · RTL** in the header |
| Arabic / English UI strings | Same |
| Export pipeline | Click Print / PDF / Excel / Image — downloads stream from the Viewer toolbar |
| WYSIWYG Builder + DnD | Click **Builder** tab → drag toolbox items / fields onto bands |
| Properties Panel | Click any element in Builder to edit its style/format/expression |
| Save / Open / Delete cycle | Click Save in Builder → reload page → use Open / Delete in sidebar |

## Run

```bash
pnpm install
pnpm playground         # http://127.0.0.1:5173
```

## Source layout

```
apps/playground/
├── index.html          # Layout: header, sidebar, viewer/builder views
└── src/
    ├── main.ts         # Wiring: adapters, events, locale/view switching
    ├── datasets.ts     # 3 sample datasets (sales, employees, invoices)
    └── reports.ts      # 4 ready-to-show ReportSchemaV1 instances
```

## How to copy a piece into your own app

### Just the viewer (vanilla)

```html
<reports-viewer id="r" locale="en" dir="ltr"></reports-viewer>
<script type="module">
  import '@reports-web/core';
  import { createStaticAdapter } from '@reports-web/core';
  const v = document.getElementById('r');
  v.dataAdapter = createStaticAdapter({ tables: { rows: myRows } });
  v.schema = mySchema;       // see reports.ts for shape
  v.addEventListener('export', e => {
    const { blob, filename } = e.detail;
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = filename; a.click();
  });
</script>
```

### Just the builder (vanilla)

```html
<reports-builder id="b" locale="ar" dir="rtl"></reports-builder>
<script type="module">
  import '@reports-web/core';
  import { createStaticAdapter, createLocalStorageAdapter } from '@reports-web/core';
  const b = document.getElementById('b');
  b.dataAdapter = createStaticAdapter({ tables: { rows: myRows } });
  b.storageAdapter = createLocalStorageAdapter();
  b.schema = myStartingSchema;   // optional
  b.addEventListener('save', e => console.log('saved', e.detail.schema));
</script>
```

### React

```tsx
import { ReportViewer, ReportBuilder } from '@reports-web/react';
import { createStaticAdapter } from '@reports-web/core';
const adapter = createStaticAdapter({ tables: { rows: myRows } });
<ReportViewer schema={mySchema} dataAdapter={adapter} locale="ar" dir="rtl"
              onExport={p => p.blob && downloadBlob(p.blob, p.filename!)} />
```

### Vue

```vue
<script setup>
import { ReportViewer } from '@reports-web/vue';
import { createStaticAdapter } from '@reports-web/core';
const adapter = createStaticAdapter({ tables: { rows: myRows } });
</script>
<template>
  <ReportViewer :schema="mySchema" :dataAdapter="adapter" locale="ar" dir="rtl" />
</template>
```
