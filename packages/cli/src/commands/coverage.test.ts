import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Manifest } from '@carto/core'
import { serializeManifest } from '@carto/core'
import { coverageCommand } from './coverage'

class ProcessExitSignal extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`)
  }
}

async function runAndCaptureExit(rawArgs: string[] = []): Promise<{ exitCode: number | null; logs: string[]; errors: string[] }> {
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
    await runCommand(coverageCommand, { rawArgs })
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
  const dir = await mkdtemp(join(tmpdir(), 'carto-coverage-'))
  const originalCwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
}

function manifest(nodes: Manifest['nodes']): Manifest {
  return { version: 1, locales: ['en'], defaultLocale: 'en', updated_at: '2026-01-01T00:00:00.000Z', federated: [], nodes }
}

describe('carto coverage', () => {
  it('exits 0 and lists uncovered files by default', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'tracked.ts'), 'a', 'utf8')
      await writeFile(join(dir, 'orphan.ts'), 'b', 'utf8')
      await writeFile(join(dir, 'carto.json'), serializeManifest(manifest([{ id: 'n', sources: [{ file: 'tracked.ts' }] }])), 'utf8')

      const { exitCode, logs } = await runAndCaptureExit()
      expect(exitCode).toBe(0)
      expect(logs.some((line) => line.includes('1 / 2 files (50.0%)'))).toBe(true)
      expect(logs.some((line) => line.includes('orphan.ts'))).toBe(true)
    })
  })

  it('exits 1 with --fail-on-uncovered when files are uncovered', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'orphan.ts'), 'b', 'utf8')
      await writeFile(join(dir, 'carto.json'), serializeManifest(manifest([])), 'utf8')

      const { exitCode } = await runAndCaptureExit(['--fail-on-uncovered'])
      expect(exitCode).toBe(1)
    })
  })

  it('exits 0 and reports full coverage when nothing is uncovered', async () => {
    await withTempCwd(async (dir) => {
      await writeFile(join(dir, 'only.ts'), 'x', 'utf8')
      await writeFile(join(dir, 'carto.json'), serializeManifest(manifest([{ id: 'n', sources: [{ file: 'only.ts' }] }])), 'utf8')

      const { exitCode, logs } = await runAndCaptureExit(['--fail-on-uncovered'])
      expect(exitCode).toBe(0)
      expect(logs.some((line) => line.includes('all files covered'))).toBe(true)
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
