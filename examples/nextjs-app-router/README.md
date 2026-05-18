# Next.js (App Router) Integration Example

This shows how to embed `<ReportViewer>` and `<ReportBuilder>` from `@reports-web/react` inside a Next.js 14+ app.

## Install

```bash
npm install @reports-web/react @reports-web/core
```

## Files in this example

- `app/reports/page.tsx` — server page that loads schema + initial data
- `app/reports/ViewerClient.tsx` — `'use client'` viewer wrapper
- `app/reports/builder/page.tsx` — builder page
- `app/api/reports/data/route.ts` — REST endpoint serving rows

## Notes

- The Reports Web core registers Web Components in the browser, so it must be loaded in a `'use client'` boundary.
- For SSR with frameworks like Next.js, don't try to render the WC on the server. Use `dynamic(() => import(...), { ssr: false })` if you need extra safety, but the wrapper already renders an empty custom element shell on the server which the client then hydrates.
