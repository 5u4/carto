import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn() }
})

import { buildSite, previewSite } from './render.js'

const templateRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const installedContent = join(templateRoot, 'src', 'content', 'docs')
const roots: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('site rendering', () => {
  it('builds in an isolated workspace, publishes on success, and cleans temporary state', async () => {
    const docRoot = await emptyDocRoot()
    const destination = join(docRoot, 'dist-site')
    await mkdir(destination)
    await writeFile(join(destination, 'old.txt'), 'old', 'utf8')
    const installedBefore = await snapshot(installedContent)
    let workspace = ''

    vi.mocked(spawn).mockImplementation((_command, rawArgs) => {
      const args = rawArgs as string[]
      workspace = valueAfter(args, '--root')
      const output = valueAfter(args, '--outDir')
      return child(async () => {
        expect(workspace).not.toBe(templateRoot)
        expect(valueAfter(args, '--config')).toBe('astro.config.mjs')
        expect(await readFile(join(workspace, 'astro.config.mjs'), 'utf8')).toContain('packages/template/astro.config.mjs')
        expect(await readFile(join(workspace, 'src', 'content', 'docs', 'index.mdx'), 'utf8')).toContain('Nothing here yet')
        expect(existsSync(join(workspace, '.astro', 'cache'))).toBe(true)
        await mkdir(output, { recursive: true })
        await writeFile(join(output, 'index.html'), 'new', 'utf8')
        return { code: 0, signal: null }
      })
    })

    await buildSite(docRoot)

    expect(await readFile(join(destination, 'index.html'), 'utf8')).toBe('new')
    expect(existsSync(join(destination, 'old.txt'))).toBe(false)
    expect(existsSync(workspace)).toBe(false)
    expect((await readdir(docRoot)).filter((name) => name.startsWith('.carto-dist-site'))).toEqual([])
    expect(await snapshot(installedContent)).toEqual(installedBefore)
  })

  it('preserves the previous site and cleans temporary state when Astro fails', async () => {
    const docRoot = await emptyDocRoot()
    const destination = join(docRoot, 'dist-site')
    await mkdir(destination)
    await writeFile(join(destination, 'index.html'), 'previous', 'utf8')
    let workspace = ''

    vi.mocked(spawn).mockImplementation((_command, rawArgs) => {
      const args = rawArgs as string[]
      workspace = valueAfter(args, '--root')
      return child(async () => ({ code: 1, signal: null }))
    })

    await expect(buildSite(docRoot)).rejects.toThrow('Astro build failed with exit code 1')
    expect(await readFile(join(destination, 'index.html'), 'utf8')).toBe('previous')
    expect(existsSync(workspace)).toBe(false)
  })

  it('rejects preview when no built site exists', async () => {
    const docRoot = await emptyDocRoot()

    await expect(previewSite(docRoot)).rejects.toThrow('run carto build first')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('forwards preview host and port to Astro and prints the URL', async () => {
    const docRoot = await emptyDocRoot()
    await mkdir(join(docRoot, 'dist-site'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    let workspace = ''

    vi.mocked(spawn).mockImplementation((_command, rawArgs) => {
      const args = rawArgs as string[]
      workspace = valueAfter(args, '--root')
      expect(workspace).not.toBe(templateRoot)
      expect(valueAfter(args, '--host')).toBe('0.0.0.0')
      expect(valueAfter(args, '--port')).toBe('49152')
      expect(valueAfter(args, '--outDir')).toBe(join(docRoot, 'dist-site'))
      return child(async () => ({ code: null, signal: 'SIGTERM' }))
    })

    await previewSite(docRoot, { host: '0.0.0.0', port: 49_152 })

    expect(log).toHaveBeenCalledWith('Previewing http://0.0.0.0:49152/')
    expect(existsSync(workspace)).toBe(false)
    log.mockRestore()
  })
})

async function emptyDocRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'carto-render-test-'))
  roots.push(root)
  await writeFile(
    join(root, 'carto.json'),
    `${JSON.stringify({ version: 1, locales: ['en', 'zh'], defaultLocale: 'en' }, null, 2)}\n`,
    'utf8'
  )
  return root
}

function child(
  complete: () => Promise<{ code: number | null; signal: NodeJS.Signals | null }>
): ChildProcess {
  const process = new EventEmitter() as ChildProcess
  process.kill = vi.fn(() => true)
  queueMicrotask(async () => {
    try {
      const result = await complete()
      process.emit('exit', result.code, result.signal)
    } catch (error) {
      process.emit('error', error)
    }
  })
  return process
}

function valueAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag)
  if (index < 0 || index === args.length - 1) throw new Error(`Missing ${flag}`)
  return args[index + 1]
}

async function snapshot(path: string): Promise<Record<string, string>> {
  if (!existsSync(path)) return {}
  const files: Record<string, string> = {}
  await visit(path, '')
  return files

  async function visit(current: string, relative: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const childPath = join(current, entry.name)
      const childRelative = join(relative, entry.name)
      if (entry.isDirectory()) await visit(childPath, childRelative)
      else files[childRelative] = await readFile(childPath, 'utf8')
    }
  }
}
