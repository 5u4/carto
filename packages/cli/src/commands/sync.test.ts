import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Manifest } from '@carto/core'
import { writeManifest } from '@carto/core'
import { syncCommand } from './sync'

class ProcessExitSignal extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`)
  }
}

async function runAndCaptureExit(rawArgs: string[] = []): Promise<number | null> {
  const spy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null): never => {
    throw new ProcessExitSignal(typeof code === 'number' ? code : 0)
  })
  try {
    await runCommand(syncCommand, { rawArgs })
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
    federated: [],
    nodes: [{ id: 'payments', sources: [{ file: 'payments.md' }] }]
  }
}

async function readNodeFile(dir: string, id: string): Promise<{ sources: Array<{ file: string; hash?: string; commit?: string }> }> {
  return JSON.parse(await readFile(join(dir, 'docs', id, 'node.json'), 'utf8'))
}

describe('carto sync', () => {
  it('fills a 16-char hash for an unsynced source and is idempotent', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeManifest(dir, manifestWithSource())

      const firstExit = await runAndCaptureExit()
      expect(firstExit).toBeNull()
      const firstNode = await readNodeFile(dir, 'payments')
      const firstHash = firstNode.sources[0]?.hash
      expect(firstHash).toHaveLength(16)

      const secondExit = await runAndCaptureExit()
      expect(secondExit).toBeNull()
      const secondNode = await readNodeFile(dir, 'payments')
      expect(secondNode.sources[0]?.hash).toBe(firstHash)
    })
  })

  it('writes no commit key when run outside a git repo', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeManifest(dir, manifestWithSource())

      const exit = await runAndCaptureExit()
      expect(exit).toBeNull()
      const node = await readNodeFile(dir, 'payments')
      expect(node.sources[0]).not.toHaveProperty('commit')
      expect(node.sources[0]?.hash).toHaveLength(16)
    })
  })

  it('exits non-zero and writes nothing when a source file is missing', async () => {
    await withTempCwd(async (dir) => {
      await writeManifest(dir, manifestWithSource())
      const before = await readFile(join(dir, 'docs', 'payments', 'node.json'), 'utf8')

      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      const after = await readFile(join(dir, 'docs', 'payments', 'node.json'), 'utf8')
      expect(after).toBe(before)
    })
  })

  it('bare sync leaves an already-synced source untouched even after it changes on disk', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeManifest(dir, manifestWithSource())
      const firstExit = await runAndCaptureExit()
      expect(firstExit).toBeNull()
      const synced = await readNodeFile(dir, 'payments')
      const originalHash = synced.sources[0]?.hash

      await writeFile(join(dir, 'payments.md'), 'mutated payments content', 'utf8')
      const secondExit = await runAndCaptureExit()
      expect(secondExit).toBeNull()
      const untouched = await readNodeFile(dir, 'payments')
      expect(untouched.sources[0]?.hash).toBe(originalHash)
    })
  })

  it('carto sync <id> re-hashes and blesses a stale node', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeManifest(dir, manifestWithSource())
      const firstExit = await runAndCaptureExit()
      expect(firstExit).toBeNull()
      const synced = await readNodeFile(dir, 'payments')
      const originalHash = synced.sources[0]?.hash

      await writeFile(join(dir, 'payments.md'), 'mutated payments content', 'utf8')
      const exitCode = await runAndCaptureExit(['payments'])
      expect(exitCode).toBeNull()
      const blessed = await readNodeFile(dir, 'payments')
      expect(blessed.sources[0]?.hash).not.toBe(originalHash)
      expect(blessed.sources[0]?.hash).toHaveLength(16)
    })
  })

  it('exits 1 when the id passed to carto sync <id> is unknown', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'payments.md'), 'payments content', 'utf8')
      await writeManifest(dir, manifestWithSource())

      const exitCode = await runAndCaptureExit(['ghost'])
      expect(exitCode).toBe(1)
    })
  })
})
