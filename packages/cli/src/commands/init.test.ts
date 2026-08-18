import { describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docsDir, parseConfig } from '@carto/core'
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
  it('creates a schema-valid carto.json and a .carto/docs/ dir in an empty directory', async () => {
    await withTempCwd(async (dir) => {
      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      const raw = JSON.parse(await readFile(join(dir, 'carto.json'), 'utf8'))
      expect(() => parseConfig(raw)).not.toThrow()
      expect(raw).not.toHaveProperty('nodes')
      expect(raw).not.toHaveProperty('updated_at')
      const docsStat = await stat(docsDir(dir))
      expect(docsStat.isDirectory()).toBe(true)
    })
  })

  it('reuses an existing .carto/docs/ directory', async () => {
    await withTempCwd(async (dir) => {
      const docs = docsDir(dir)
      await mkdir(docs, { recursive: true })
      const marker = join(docs, 'keep.txt')
      await writeFile(marker, 'keep', 'utf8')
      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      expect(await readFile(marker, 'utf8')).toBe('keep')
    })
  })

  it('prints a copyable tool-agnostic documentation prompt after initialization', async () => {
    await withTempCwd(async () => {
      const logs: string[] = []
      const logSpy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
        logs.push(line)
      })
      try {
        const exitCode = await runAndCaptureExit()
        expect(exitCode).toBeNull()
        expect(logs).toContain('initialized carto.json, .carto/docs/, carto.config.mjs (locales: en)')
        expect(logs.at(-1)).toBe('Use the carto skill to document <scope>.')
      } finally {
        logSpy.mockRestore()
      }
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

  it('scaffolds a typed carto.config.mjs pointing at the Starlight config type', async () => {
    await withTempCwd(async (dir) => {
      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      const config = await readFile(join(dir, 'carto.config.mjs'), 'utf8')
      expect(config).toContain("import('@astrojs/starlight/types').StarlightUserConfig")
      expect(config).toContain('export default {')
      expect(config).toContain('starlight: {}')
    })
  })

  it('does not overwrite an existing carto.config.mjs', async () => {
    await withTempCwd(async (dir) => {
      const configPath = join(dir, 'carto.config.mjs')
      await writeFile(configPath, 'export default { starlight: { title: "Mine" } }', 'utf8')
      const before = await readFile(configPath, 'utf8')
      const exitCode = await runAndCaptureExit()
      expect(exitCode).toBeNull()
      expect(await readFile(configPath, 'utf8')).toBe(before)
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
