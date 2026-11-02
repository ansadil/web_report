export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2024-11-01',
  vite: {
    resolve: {
      alias: {
        'node:fs/promises': 'node:fs/promises',
        'node:fs': 'node:fs',
        'node:path': 'node:path',
        'node:url': 'node:url',
      },
    },
    optimizeDeps: { include: ['@reports-web/vue', '@reports-web/core'] },
  },
  nitro: {
    externals: { external: ['harfbuzzjs'] },
  },
  vue: {
    compilerOptions: {
      isCustomElement: (tag) => tag.startsWith('reports-'),
    },
  },
});
