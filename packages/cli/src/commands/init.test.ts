import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseManifest } from '@carto/core'
import { initCommand } from './init'

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
    await runCommand(initCommand, { rawArgs })
    return null
  } catch (error) {
    if (error instanceof ProcessExitSignal) return error.code
    throw error
  } finally {
    spy.mockRestore()
  }
}

async function withTempCwd<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-init-'))
  const originalCwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
}

describe('carto init', () => {
  it('creates a schema-valid carto.json and a docs/ dir in an empty directory', async () => {
    await withTempCwd(async (dir) => {
      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      const raw = JSON.parse(await readFile(join(dir, 'carto.json'), 'utf8'))
      expect(() => parseManifest(raw)).not.toThrow()
      const docsStat = await stat(join(dir, 'docs'))
      expect(docsStat.isDirectory()).toBe(true)
    })
  })

  it('refuses to overwrite an existing carto.json and leaves it unchanged', async () => {
    await withTempCwd(async (dir) => {
      const firstExit = await runAndCaptureExit()
      expect(firstExit).toBeNull()
      const before = await readFile(join(dir, 'carto.json'), 'utf8')
      const secondExit = await runAndCaptureExit()
      expect(secondExit).toBe(1)
      const after = await readFile(join(dir, 'carto.json'), 'utf8')
      expect(after).toBe(before)
    })
  })

  it('rejects an empty --locales and writes no carto.json', async () => {
    await withTempCwd(async (dir) => {
      const exitCode = await runAndCaptureExit(['--locales', ''])
      expect(exitCode).toBe(1)
      await expect(stat(join(dir, 'carto.json'))).rejects.toThrow()
    })
  })

  it('rejects a --defaultLocale not present in --locales and writes no carto.json', async () => {
    await withTempCwd(async (dir) => {
      const exitCode = await runAndCaptureExit(['--locales', 'en', '--defaultLocale', 'de'])
      expect(exitCode).toBe(1)
      await expect(stat(join(dir, 'carto.json'))).rejects.toThrow()
    })
  })
})
