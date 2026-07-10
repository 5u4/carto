import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Manifest } from '@carto/core'
import { serializeManifest, syncManifest } from '@carto/core'
import { statusCommand } from './status'

class ProcessExitSignal extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`)
  }
}

async function runAndCaptureExit(): Promise<{ exitCode: number | null; logs: string[]; errors: string[] }> {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null): never => {
    throw new ProcessExitSignal(typeof code === 'number' ? code : 0)
  })
  const logs: string[] = []
  const errors: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
    logs.push(line)
  })
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((line: string) => {
    errors.push(line)
  })
  try {
    await runCommand(statusCommand, { rawArgs: [] })
    return { exitCode: null, logs, errors }
  } catch (error) {
    if (error instanceof ProcessExitSignal) return { exitCode: error.code, logs, errors }
    throw error
  } finally {
    exitSpy.mockRestore()
    logSpy.mockRestore()
    errorSpy.mockRestore()
  }
}

async function withTempCwd<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
  const originalCwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
}

function manifestWithSource(): Manifest {
  return {
    version: 1,
    locales: ['en'],
    defaultLocale: 'en',
    updated_at: '2026-01-01T00:00:00.000Z',
    nodes: [{ id: 'payments', sources: [{ file: 'payments.md' }] }]
  }
}

describe('carto status', () => {
  it('exits 0 and prints fresh for a synced manifest matching its source', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      const synced = await syncManifest(manifestWithSource(), { rootDir: dir })
      await writeFile(join(dir, 'carto.json'), serializeManifest(synced), 'utf8')

      const { exitCode, logs } = await runAndCaptureExit()
      expect(exitCode).toBe(0)
      expect(logs.some((line) => line.includes('fresh') && line.includes('payments'))).toBe(true)
    })
  })

  it('exits non-zero and prints stale after the tracked file mutates', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      const synced = await syncManifest(manifestWithSource(), { rootDir: dir })
      await writeFile(join(dir, 'carto.json'), serializeManifest(synced), 'utf8')
      await writeFile(join(dir, 'payments.md'), 'mutated content', 'utf8')

      const { exitCode, logs } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(logs.some((line) => line.includes('stale') && line.includes('payments'))).toBe(true)
    })
  })

  it('exits non-zero and prints unsynced for a source with no stored hash', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeFile(join(dir, 'carto.json'), serializeManifest(manifestWithSource()), 'utf8')

      const { exitCode, logs } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(logs.some((line) => line.includes('unsynced') && line.includes('payments'))).toBe(true)
    })
  })

  it('lists the specific changed file under a stale node', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      const synced = await syncManifest(manifestWithSource(), { rootDir: dir })
      await writeFile(join(dir, 'carto.json'), serializeManifest(synced), 'utf8')
      await writeFile(join(dir, 'payments.md'), 'mutated content', 'utf8')

      const { logs } = await runAndCaptureExit()
      expect(logs.some((line) => line.includes('stale') && line.includes('payments.md'))).toBe(true)
    })
  })

  it('prints the stored anchor commit next to a stale source', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      const synced = await syncManifest(manifestWithSource(), { rootDir: dir, commit: 'abc1234567890' })
      await writeFile(join(dir, 'carto.json'), serializeManifest(synced), 'utf8')
      await writeFile(join(dir, 'payments.md'), 'mutated content', 'utf8')

      const { logs } = await runAndCaptureExit()
      expect(logs.some((line) => line.includes('stale') && line.includes('payments.md') && line.includes('(was abc1234)'))).toBe(true)
    })
  })

  it('exits 1 with an error message when carto.json is missing', async () => {
    await withTempCwd(async () => {
      const { exitCode, errors } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(errors.some((line) => line.startsWith('error: '))).toBe(true)
    })
  })
})
