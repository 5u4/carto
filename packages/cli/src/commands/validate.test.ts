import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Manifest } from '@carto/core'
import { serializeManifest, syncManifest } from '@carto/core'
import { validateCommand } from './validate'

class ProcessExitSignal extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`)
  }
}

async function runAndCaptureExit(): Promise<{ exitCode: number | null; errors: string[]; warnings: string[]; logs: string[] }> {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null): never => {
    throw new ProcessExitSignal(typeof code === 'number' ? code : 0)
  })
  const errors: string[] = []
  const warnings: string[] = []
  const logs: string[] = []
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((line: string) => {
    errors.push(line)
  })
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((line: string) => {
    warnings.push(line)
  })
  const logSpy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
    logs.push(line)
  })
  try {
    await runCommand(validateCommand, { rawArgs: [] })
    return { exitCode: null, errors, warnings, logs }
  } catch (error) {
    if (error instanceof ProcessExitSignal) return { exitCode: error.code, errors, warnings, logs }
    throw error
  } finally {
    exitSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    logSpy.mockRestore()
  }
}

async function withTempCwd<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-validate-'))
  const originalCwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
}

async function writeDoc(dir: string, id: string, locale: string, body: string): Promise<void> {
  await mkdir(join(dir, 'docs', id), { recursive: true })
  await writeFile(join(dir, 'docs', id, `${locale}.mdx`), body, 'utf8')
}

function baseManifest(): Manifest {
  return {
    version: 1,
    locales: ['en'],
    defaultLocale: 'en',
    updated_at: '2026-01-01T00:00:00.000Z',
    nodes: [
      { id: 'payments', sources: [{ file: 'payments.md' }] },
      { id: 'billing', sources: [{ file: 'billing.md' }] }
    ]
  }
}

async function writeSyncedManifest(dir: string, manifest: Manifest): Promise<void> {
  await writeFile(join(dir, 'payments.md'), 'payments source', 'utf8')
  await writeFile(join(dir, 'billing.md'), 'billing source', 'utf8')
  const synced = await syncManifest(manifest, { rootDir: dir })
  await writeFile(join(dir, 'carto.json'), serializeManifest(synced), 'utf8')
}

describe('carto validate', () => {
  it('exits 0 and prints validate: ok for a good fixture', async () => {
    await withTempCwd(async (dir) => {
      await writeSyncedManifest(dir, baseManifest())
      await writeDoc(dir, 'payments', 'en', 'See [billing](carto:billing) for details.')
      await writeDoc(dir, 'billing', 'en', 'Billing overview.')

      const { exitCode, logs } = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      expect(logs).toContain('validate: ok')
    })
  })

  it('exits 1 when an mdx links to an unknown id', async () => {
    await withTempCwd(async (dir) => {
      await writeSyncedManifest(dir, baseManifest())
      await writeDoc(dir, 'payments', 'en', 'See [ghost](carto:ghost) for details.')
      await writeDoc(dir, 'billing', 'en', 'Billing overview.')

      const { exitCode, errors } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(errors.some((line) => line.includes('carto:ghost'))).toBe(true)
    })
  })

  it('exits 1 when two nodes share the same id', async () => {
    await withTempCwd(async (dir) => {
      const duplicateManifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2026-01-01T00:00:00.000Z',
        nodes: [
          { id: 'payments', sources: [] },
          { id: 'payments', sources: [] }
        ]
      }
      await writeFile(join(dir, 'carto.json'), JSON.stringify(duplicateManifest, null, 2), 'utf8')

      const { exitCode, errors } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(errors.some((line) => line.includes('payments'))).toBe(true)
    })
  })

  it('exits 1 when a declared locale is missing its mdx file', async () => {
    await withTempCwd(async (dir) => {
      await writeSyncedManifest(dir, baseManifest())
      await writeDoc(dir, 'billing', 'en', 'Billing overview.')

      const { exitCode, errors } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(errors.some((line) => line.includes('docs/payments/en.mdx'))).toBe(true)
    })
  })

  it('exits 1 when an mdx uses the unsupported federation link form', async () => {
    await withTempCwd(async (dir) => {
      await writeSyncedManifest(dir, baseManifest())
      await writeDoc(dir, 'payments', 'en', 'See [auth](carto:web/auth) for details.')
      await writeDoc(dir, 'billing', 'en', 'Billing overview.')

      const { exitCode, errors } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(errors.some((line) => line.includes('carto:web/auth'))).toBe(true)
    })
  })

  it('exits 0 with a printed warning when a node has a dangling parent', async () => {
    await withTempCwd(async (dir) => {
      const manifest: Manifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2026-01-01T00:00:00.000Z',
        nodes: [{ id: 'payments', parent: 'ghost-parent', sources: [{ file: 'payments.md' }] }]
      }
      await writeFile(join(dir, 'payments.md'), 'payments source', 'utf8')
      const synced = await syncManifest(manifest, { rootDir: dir })
      await writeFile(join(dir, 'carto.json'), serializeManifest(synced), 'utf8')
      await writeDoc(dir, 'payments', 'en', 'Payments overview.')

      const { exitCode, warnings, logs } = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      expect(logs).toContain('validate: ok')
      expect(warnings.some((line) => line.includes('ghost-parent'))).toBe(true)
    })
  })

  it('exits 1 when home points to an unknown node id', async () => {
    await withTempCwd(async (dir) => {
      await writeSyncedManifest(dir, { ...baseManifest(), home: 'ghost' })
      await writeDoc(dir, 'payments', 'en', 'Payments overview.')
      await writeDoc(dir, 'billing', 'en', 'Billing overview.')

      const { exitCode, errors } = await runAndCaptureExit()
      expect(exitCode).toBe(1)
      expect(errors.some((line) => line.includes('home') && line.includes('ghost'))).toBe(true)
    })
  })

  it('exits 0 when home points to an existing node', async () => {
    await withTempCwd(async (dir) => {
      await writeSyncedManifest(dir, { ...baseManifest(), home: 'billing' })
      await writeDoc(dir, 'payments', 'en', 'Payments overview.')
      await writeDoc(dir, 'billing', 'en', 'Billing overview.')

      const { exitCode, logs } = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      expect(logs).toContain('validate: ok')
    })
  })
})
