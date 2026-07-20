import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ManifestError,
  codeRootDir,
  parseConfig,
  parseNodeFile,
  readConfig,
  readNode,
  readManifest,
  serializeConfig,
  serializeNodeFile,
  syncManifest,
  writeConfig,
  writeNode
} from './manifest'
import type { Config, Manifest, Node } from './schema'

function validConfig(): Config {
  return { version: 1, locales: ['en'], defaultLocale: 'en', federated: [] }
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-manifest-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('parseConfig', () => {
  it('round-trips a valid config', () => {
    const config = validConfig()
    expect(parseConfig(config)).toEqual(config)
  })

  it('throws ManifestError on bad input', () => {
    expect(() => parseConfig({ version: 2 })).toThrow(ManifestError)
  })
})

describe('parseNodeFile', () => {
  it('injects the id from the directory name', () => {
    const node = parseNodeFile('payments', { parent: 'api', sources: [{ file: 'a.ts' }] })
    expect(node).toEqual({ id: 'payments', parent: 'api', sources: [{ file: 'a.ts' }] })
  })

  it('defaults sources to an empty array', () => {
    expect(parseNodeFile('solo', {})).toEqual({ id: 'solo', sources: [] })
  })

  it('names the node id in the error message', () => {
    expect(() => parseNodeFile('payments', { sources: [{ file: '/abs' }] })).toThrow('payments')
  })
})

describe('serializeConfig', () => {
  it('uses a fixed key order and omits an empty federated list', () => {
    const text = serializeConfig({ version: 1, locales: ['en', 'zh'], defaultLocale: 'en', federated: [] })
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'locales', 'defaultLocale'])
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('includes codeRoot, home, and federated when present', () => {
    const text = serializeConfig({
      version: 1,
      locales: ['en'],
      defaultLocale: 'en',
      codeRoot: 'src',
      home: 'overview',
      federated: [{ alias: 'web', type: 'file', path: '../web' }]
    })
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'locales', 'defaultLocale', 'codeRoot', 'home', 'federated'])
  })
})

describe('serializeNodeFile', () => {
  it('omits id, keeps parent then sources, and orders source keys', () => {
    const node: Node = { id: 'api', parent: 'root', sources: [{ file: 'src/a.ts', hash: 'abc123', commit: 'deadbeef' }] }
    const text = serializeNodeFile(node)
    expect(Object.keys(JSON.parse(text))).toEqual(['parent', 'sources'])
    expect(Object.keys(JSON.parse(text).sources[0])).toEqual(['file', 'hash', 'commit'])
  })

  it('omits parent for a root node and commit when hash is absent', () => {
    const text = serializeNodeFile({ id: 'root', sources: [{ file: 'src/b.ts' }] })
    expect(Object.keys(JSON.parse(text))).toEqual(['sources'])
    expect(JSON.parse(text).sources[0]).toEqual({ file: 'src/b.ts' })
  })
})

describe('readManifest / writeConfig / writeNode', () => {
  it('round-trips a manifest through the per-node disk layout', async () => {
    await withTempDir(async (dir) => {
      const config = validConfig()
      await writeConfig(dir, config)
      await writeNode(dir, { id: 'api', sources: [{ file: 'a.ts', hash: 'h1' }] })
      await writeNode(dir, { id: 'payments', parent: 'api', sources: [] })
      const manifest = await readManifest(dir)
      expect(manifest).toEqual({
        ...config,
        nodes: [
          { id: 'api', sources: [{ file: 'a.ts', hash: 'h1' }] },
          { id: 'payments', parent: 'api', sources: [] }
        ]
      })
    })
  })

  it('derives node ids from directory names, sorted', async () => {
    await withTempDir(async (dir) => {
      await writeConfig(dir, validConfig())
      await writeNode(dir, { id: 'zeta', sources: [] })
      await writeNode(dir, { id: 'alpha', sources: [] })
      const manifest = await readManifest(dir)
      expect(manifest.nodes.map((n) => n.id)).toEqual(['alpha', 'zeta'])
    })
  })

  it('ignores a docs directory with no node.json', async () => {
    await withTempDir(async (dir) => {
      await writeConfig(dir, validConfig())
      await mkdir(join(dir, 'docs', 'stray'), { recursive: true })
      await writeFile(join(dir, 'docs', 'stray', 'en.mdx'), 'x', 'utf8')
      const manifest = await readManifest(dir)
      expect(manifest.nodes).toEqual([])
    })
  })

  it('returns no nodes when docs/ is absent', async () => {
    await withTempDir(async (dir) => {
      await writeConfig(dir, validConfig())
      const manifest = await readManifest(dir)
      expect(manifest.nodes).toEqual([])
    })
  })

  it('rejects a docs directory whose name is not a valid node id', async () => {
    await withTempDir(async (dir) => {
      await writeConfig(dir, validConfig())
      await mkdir(join(dir, 'docs', 'Bad Id'), { recursive: true })
      await writeFile(join(dir, 'docs', 'Bad Id', 'node.json'), '{"sources":[]}', 'utf8')
      await expect(readManifest(dir)).rejects.toThrow(ManifestError)
    })
  })

  it('reads a single config and node from disk', async () => {
    await withTempDir(async (dir) => {
      await writeConfig(dir, validConfig())
      await writeNode(dir, { id: 'api', sources: [] })
      expect(await readConfig(dir)).toEqual(validConfig())
      expect(await readNode(dir, 'api')).toEqual({ id: 'api', sources: [] })
      expect(await readNode(dir, 'ghost')).toBeUndefined()
    })
  })
})

describe('syncManifest (bare)', () => {
  it('blesses only unsynced sources and leaves stale ones untouched', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'fresh.ts'), 'new', 'utf8')
      await writeFile(join(dir, 'stale.ts'), 'changed', 'utf8')
      const manifest: Manifest = {
        ...validConfig(),
        nodes: [
          { id: 'a', sources: [{ file: 'fresh.ts' }] },
          { id: 'b', sources: [{ file: 'stale.ts', hash: 'old-hash', commit: 'old-commit' }] }
        ]
      }
      const { manifest: synced, changed } = await syncManifest(manifest, { rootDir: dir, commit: 'now-commit' })
      expect(changed).toEqual(['a'])
      expect(synced.nodes[0]?.sources[0]?.hash).toMatch(/^[0-9a-f]{16}$/)
      expect(synced.nodes[0]?.sources[0]?.commit).toBe('now-commit')
      expect(synced.nodes[1]?.sources[0]).toEqual({ file: 'stale.ts', hash: 'old-hash', commit: 'old-commit' })
    })
  })

  it('is idempotent once every source is synced', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const manifest: Manifest = { ...validConfig(), nodes: [{ id: 'a', sources: [{ file: 'a.ts' }] }] }
      const first = await syncManifest(manifest, { rootDir: dir, commit: 'c1' })
      expect(first.changed).toEqual(['a'])
      const second = await syncManifest(first.manifest, { rootDir: dir, commit: 'c1' })
      expect(second.changed).toEqual([])
      expect(second.manifest).toEqual(first.manifest)
    })
  })

  it('omits commit when none is provided', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const manifest: Manifest = { ...validConfig(), nodes: [{ id: 'a', sources: [{ file: 'a.ts' }] }] }
      const { manifest: synced } = await syncManifest(manifest, { rootDir: dir })
      expect(synced.nodes[0]?.sources[0]?.commit).toBeUndefined()
    })
  })
})

describe('syncManifest (targeted)', () => {
  it('re-hashes and re-stamps only the named nodes, including stale ones', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.ts'), 'a-new', 'utf8')
      await writeFile(join(dir, 'b.ts'), 'b-new', 'utf8')
      const manifest: Manifest = {
        ...validConfig(),
        nodes: [
          { id: 'a', sources: [{ file: 'a.ts', hash: 'a-old', commit: 'c0' }] },
          { id: 'b', sources: [{ file: 'b.ts', hash: 'b-old', commit: 'c0' }] }
        ]
      }
      const { manifest: synced, changed } = await syncManifest(manifest, { rootDir: dir, commit: 'c1', targets: ['a'] })
      expect(changed).toEqual(['a'])
      expect(synced.nodes[0]?.sources[0]?.commit).toBe('c1')
      expect(synced.nodes[0]?.sources[0]?.hash).not.toBe('a-old')
      expect(synced.nodes[1]?.sources[0]).toEqual({ file: 'b.ts', hash: 'b-old', commit: 'c0' })
    })
  })

  it('throws when a target id does not exist', async () => {
    await withTempDir(async (dir) => {
      const manifest: Manifest = { ...validConfig(), nodes: [{ id: 'a', sources: [] }] }
      await expect(syncManifest(manifest, { rootDir: dir, targets: ['ghost'] })).rejects.toThrow('ghost')
    })
  })
})

describe('syncManifest errors', () => {
  it('throws ManifestError naming the file when an unsynced source is missing', async () => {
    await withTempDir(async (dir) => {
      const manifest: Manifest = { ...validConfig(), nodes: [{ id: 'a', sources: [{ file: 'ghost.ts' }] }] }
      await expect(syncManifest(manifest, { rootDir: dir })).rejects.toThrow('ghost.ts')
    })
  })

  it('rethrows a non-ENOENT error instead of treating it as missing', async () => {
    await withTempDir(async (dir) => {
      const manifest: Manifest = { ...validConfig(), nodes: [{ id: 'a', sources: [{ file: '.' }] }] }
      await expect(syncManifest(manifest, { rootDir: dir })).rejects.not.toBeInstanceOf(ManifestError)
    })
  })
})

describe('codeRootDir', () => {
  it('returns the doc root unchanged when codeRoot is absent', () => {
    expect(codeRootDir(validConfig() as Manifest, '/docs')).toBe('/docs')
  })

  it('resolves codeRoot relative to the doc root', () => {
    expect(codeRootDir({ ...validConfig(), codeRoot: 'code' } as Manifest, '/docs')).toBe(join('/docs', 'code'))
  })
})

function readFileText(dir: string, id: string): Promise<string> {
  return readFile(join(dir, 'docs', id, 'node.json'), 'utf8')
}

describe('writeNode', () => {
  it('writes node.json into the node directory', async () => {
    await withTempDir(async (dir) => {
      await writeNode(dir, { id: 'api', sources: [{ file: 'a.ts', hash: 'h' }] })
      const text = await readFileText(dir, 'api')
      expect(JSON.parse(text)).toEqual({ sources: [{ file: 'a.ts', hash: 'h' }] })
    })
  })
})
