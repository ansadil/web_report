export default defineNuxtConfig({
  ssr: true,
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
});
