import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

function loadEnvE2E(): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const text = readFileSync(new URL('./.env.e2e', import.meta.url), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  } catch {
    return env
  }
  return env
}

export default defineConfig({
  resolve: {
    alias: {
      '@carto/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    env: loadEnvE2E(),
    testTimeout: 900_000,
    hookTimeout: 900_000
  }
})
