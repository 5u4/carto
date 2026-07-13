import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ManifestError, codeRootDir, parseManifest, readManifest, serializeManifest, syncManifest, writeManifest } from './manifest'
import type { Manifest } from './schema'

function validManifest(): Manifest {
  return {
    version: 1,
    locales: ['en'],
    defaultLocale: 'en',
    updated_at: '2026-07-08T00:00:00Z',
    federated: [],
    nodes: [{ id: 'payments', sources: [] }]
  }
}

describe('parseManifest', () => {
  it('round-trips a valid object', () => {
    const manifest = validManifest()
    expect(parseManifest(manifest)).toEqual(manifest)
  })

  it('throws ManifestError on bad input', () => {
    expect(() => parseManifest({ version: 2 })).toThrow(ManifestError)
  })
})

describe('serializeManifest', () => {
  it('uses a fixed key order and ends with exactly one trailing newline', () => {
    const manifest: Manifest = {
      version: 1,
      locales: ['en', 'zh'],
      defaultLocale: 'en',
      updated_at: '2026-07-08T00:00:00Z',
      federated: [],
      nodes: [
        { id: 'api', slug: 'backend', sources: [{ file: 'src/a.ts', hash: 'abc123' }] },
        { id: 'payments', parent: 'api', sources: [{ file: 'src/b.ts' }] }
      ]
    }
    const text = serializeManifest(manifest)
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'locales', 'defaultLocale', 'updated_at', 'nodes'])
    expect(Object.keys(JSON.parse(text).nodes[0])).toEqual(['id', 'slug', 'sources'])
    expect(Object.keys(JSON.parse(text).nodes[1])).toEqual(['id', 'parent', 'sources'])
    expect(JSON.parse(text).nodes[0].sources[0]).toEqual({ file: 'src/a.ts', hash: 'abc123' })
    expect(JSON.parse(text).nodes[1].sources[0]).toEqual({ file: 'src/b.ts' })
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('serializes source keys in file, hash, commit order and omits commit when absent', () => {
    const manifest: Manifest = {
      version: 1,
      locales: ['en'],
      defaultLocale: 'en',
      updated_at: '2026-07-08T00:00:00Z',
      federated: [],
      nodes: [
        { id: 'api', sources: [{ file: 'src/a.ts', hash: 'abc123', commit: 'deadbeef' }] },
        { id: 'web', sources: [{ file: 'src/b.ts', hash: 'def456' }] }
      ]
    }
    const text = serializeManifest(manifest)
    expect(Object.keys(JSON.parse(text).nodes[0].sources[0])).toEqual(['file', 'hash', 'commit'])
    expect(JSON.parse(text).nodes[0].sources[0]).toEqual({ file: 'src/a.ts', hash: 'abc123', commit: 'deadbeef' })
    expect(JSON.parse(text).nodes[1].sources[0]).toEqual({ file: 'src/b.ts', hash: 'def456' })
  })
})

describe('readManifest / writeManifest', () => {
  it('round-trips an equal manifest through disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-manifest-'))
    const path = join(dir, 'carto.json')
    try {
      const manifest = validManifest()
      await writeManifest(path, manifest)
      const read = await readManifest(path)
      expect(read).toEqual(manifest)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('syncManifest', () => {
  it('fills every hash and sets updated_at from an injected now, and is idempotent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-sync-'))
    try {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const manifest: Manifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2020-01-01T00:00:00Z',
        federated: [],
        nodes: [{ id: 'payments', sources: [{ file: 'a.ts' }] }]
      }
      const synced = await syncManifest(manifest, { rootDir: dir, now: () => '2026-07-08T00:00:00Z' })
      expect(synced.updated_at).toBe('2026-07-08T00:00:00Z')
      expect(synced.nodes[0]?.sources[0]?.hash).toMatch(/^[0-9a-f]{16}$/)
      const resynced = await syncManifest(synced, { rootDir: dir, now: () => '2026-07-08T00:00:00Z' })
      expect(resynced).toEqual(synced)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stamps the provided commit on every synced source and omits it when not provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-sync-commit-'))
    try {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const manifest: Manifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2020-01-01T00:00:00Z',
        federated: [],
        nodes: [{ id: 'payments', sources: [{ file: 'a.ts', commit: 'stale-anchor' }] }]
      }
      const stamped = await syncManifest(manifest, { rootDir: dir, commit: 'abc1234' })
      expect(stamped.nodes[0]?.sources[0]?.commit).toBe('abc1234')
      const bare = await syncManifest(manifest, { rootDir: dir })
      expect(bare.nodes[0]?.sources[0]?.commit).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('throws ManifestError naming the file when a source is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-sync-missing-'))
    try {
      const manifest: Manifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2020-01-01T00:00:00Z',
        federated: [],
        nodes: [{ id: 'payments', sources: [{ file: 'ghost.ts' }] }]
      }
      await expect(syncManifest(manifest, { rootDir: dir })).rejects.toThrow(ManifestError)
      await expect(syncManifest(manifest, { rootDir: dir })).rejects.toThrow('ghost.ts')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rethrows a non-ENOENT error instead of treating it as missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-sync-dir-'))
    try {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const manifest: Manifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2020-01-01T00:00:00Z',
        federated: [],
        nodes: [{ id: 'payments', sources: [{ file: '.' }] }]
      }
      await expect(syncManifest(manifest, { rootDir: dir })).rejects.not.toBeInstanceOf(ManifestError)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('codeRootDir', () => {
  it('returns the doc root unchanged when codeRoot is absent', () => {
    expect(codeRootDir(validManifest(), '/docs/root')).toBe('/docs/root')
  })

  it('resolves a relative codeRoot against the doc root', () => {
    expect(codeRootDir({ ...validManifest(), codeRoot: '..' }, '/repo/.carto')).toBe('/repo')
  })

  it('honors an absolute codeRoot verbatim', () => {
    expect(codeRootDir({ ...validManifest(), codeRoot: '/srv/repo' }, '/home/user/.carto/x')).toBe('/srv/repo')
  })
})
