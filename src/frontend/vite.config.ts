import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Cap worker forks: the default (one per CPU) spawns too many heavy jsdom
    // processes on high-core / low-free-memory machines and CI, which fails with
    // out-of-memory / spawn errors. A small cap keeps per-file isolation while
    // bounding peak memory. Override with `--poolOptions.forks.maxForks` locally.
    pool: 'forks',
    poolOptions: {
      forks: { minForks: 1, maxForks: 2 },
    },
  },
})
