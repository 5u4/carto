import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Manifest } from '@carto/core'
import { serializeManifest } from '@carto/core'
import { syncCommand } from './sync'

class ProcessExitSignal extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`)
  }
}

async function runAndCaptureExit(): Promise<number | null> {
  const spy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null): never => {
    throw new ProcessExitSignal(typeof code === 'number' ? code : 0)
  })
  try {
    await runCommand(syncCommand, { rawArgs: [] })
    return null
  } catch (error) {
    if (error instanceof ProcessExitSignal) return error.code
    throw error
  } finally {
    spy.mockRestore()
  }
}

async function withTempCwd<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-sync-'))
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

describe('carto sync', () => {
  it('fills a 16-char hash and refreshes updated_at, and is idempotent', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeFile(join(dir, 'carto.json'), serializeManifest(manifestWithSource()), 'utf8')

      const firstExit = await runAndCaptureExit()
      expect(firstExit).toBeNull()
      const firstManifest = JSON.parse(await readFile(join(dir, 'carto.json'), 'utf8'))
      const firstHash = firstManifest.nodes[0].sources[0].hash
      expect(firstHash).toHaveLength(16)
      expect(firstManifest.updated_at).not.toBe('2026-01-01T00:00:00.000Z')

      const secondExit = await runAndCaptureExit()
      expect(secondExit).toBeNull()
      const secondManifest = JSON.parse(await readFile(join(dir, 'carto.json'), 'utf8'))
      expect(secondManifest.nodes[0].sources[0].hash).toBe(firstHash)
    })
  })

  it('exits non-zero and writes nothing when a source file is missing', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'carto.json'), serializeManifest(manifestWithSource()), 'utf8')
      const before = await readFile(join(dir, 'carto.json'), 'utf8')

      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      const after = await readFile(join(dir, 'carto.json'), 'utf8')
      expect(after).toBe(before)
    })
  })
})
