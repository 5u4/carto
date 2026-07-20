import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@carto/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['tests/pipeline/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000
  }
})
