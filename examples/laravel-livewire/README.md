# Laravel + Livewire + Reports Web

This folder contains **drop-in files** for a Laravel 11+ app using **Livewire 3** and **Vite** to render `@reports-web/core`: `<reports-viewer>` (read-only) and `<reports-builder>` (design-time editor).

## Prerequisites

- PHP 8.2+, Composer, Node 20+
- This monorepo built at least once: `pnpm --filter @reports-web/core run build`

## 1. Create a Laravel app (outside or inside the monorepo)

```bash
composer create-project laravel/laravel invoices-demo
cd invoices-demo
composer require livewire/livewire
php artisan livewire:publish --config   # optional
```

Install npm deps and link the core package (adjust the relative path if your layout differs).

From `invoices-demo/` next to `reports_web/`:

```bash
npm install file:../reports_web/packages/core
```

From `invoices-demo/` inside `reports_web/examples/invoices-demo/`:

```bash
npm install file:../../../packages/core
```

## 2. npm link `@reports-web/core`

Merge **`files/package.json.fragment`** into your Laravel **`package.json`** (adjust the `file:` path), then:

```bash
npm install
```

## 3. Vite (`optimizeDeps`) + JS bundle

1. Merge **`files/vite.config.snippet.ts`** into **`vite.config.js`** / **`vite.config.ts`** (add `optimizeDeps.include`; combine with any existing `optimizeDeps` keys Laravel ships).

2. Your Laravel **`vite.config`** should already list **`resources/js/app.js`** in the `laravel({ input: [...] })` plugin — keep that; **do not** require a separate Vite entry for the web components.

3. **`resources/js/app.js`** — add **`import './reports-web';`** (see **`files/resources/js/app.js.snippet`**) so `mountInvoiceReportViewer` and `mountReportBuilder` exist **before** Livewire runs `@script` hooks.

## 4. Copy application files

Copy files below into your Laravel project root:

| Stub | Target |
|------|--------|
| `files/app/Livewire/InvoiceSummaryReport.php` | `app/Livewire/InvoiceSummaryReport.php` |
| `files/app/Livewire/ReportBuilderDemo.php` | `app/Livewire/ReportBuilderDemo.php` |
| `files/resources/views/layouts/reports.blade.php` | `resources/views/layouts/reports.blade.php` |
| `files/resources/views/livewire/invoice-summary-report.blade.php` | `resources/views/livewire/invoice-summary-report.blade.php` |
| `files/resources/views/livewire/report-builder-demo.blade.php` | `resources/views/livewire/report-builder-demo.blade.php` |
| `files/resources/js/reports-web.js` | `resources/js/reports-web.js` |

**Routes:** append the lines from **`files/routes/web.php.fragment`** to **`routes/web.php`** next to your other `Route::…` definitions (invoice viewer + report builder).

## 5. Run

```bash
npm run dev   # or npm run build
php artisan serve
```

Open **`http://127.0.0.1:8000/reports/invoices`** (viewer) or **`http://127.0.0.1:8000/reports/builder`** (builder demo).

Use **English / العربية** to toggle `locale` and `dir`; each toggle assigns a new element id so Livewire re-mounts `<reports-viewer>` / `<reports-builder>` cleanly.

The builder page listens for **`save`** (calls `onBuilderSave` with the schema), **`save-error`**, and **`export-json`** (triggers a browser download). Wire persistence inside those PHP methods as needed.

Add **`ar`** to **`config/app.php`** `available_locales` / validation only if you use validated locales elsewhere (`InvoiceSummaryReport` / `ReportBuilderDemo` already restrict ar/en).

## Notes

- Requires **Livewire 3** (`@script`, `@js`).
- `pnpm --filter @reports-web/core run build` must succeed before `npm install file:…/packages/core` so `dist/` and PDF fonts exist. QR/barcode rendering is bundled into `dist/adapters/code/render-code.js`; if Vite still fails on `chart.js`, add it to your app `package.json` and `optimizeDeps.include` (see **`files/package.json.fragment`**).
- For production, run **`npm run build`** and cache Laravel config.
- Replace **`InvoiceSummaryReport`** **`sampleRows()`** / **`buildSchema()`** with data from Eloquent or an API when ready; replace **`ReportBuilderDemo::demoRows()`** or pass an **`initialSchema`** once you load definitions from storage.
