// Paste inside defineConfig({ ... }) from vite.config.js / vite.config.ts,
// merged with your existing `optimizeDeps` (spread arrays if needed).

optimizeDeps: {
  include: [
    '@reports-web/core',
    '@reports-web/core/viewer',
    '@reports-web/core/builder',
    'lit',
    'lit/directives/unsafe-html.js',
    'lit/directives/unsafe-svg.js',
    'chart.js',
    'qrcode',
    'jsbarcode',
  ],
},
