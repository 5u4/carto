import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyNode, statusReport } from './status'
import type { Manifest, Node } from './schema'

describe('classifyNode', () => {
  it('classifies a source with no stored hash as unsynced', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
    try {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const node: Node = { id: 'payments', sources: [{ file: 'a.ts' }] }
      const status = await classifyNode(node, dir)
      expect(status.state).toBe('unsynced')
      expect(status.sources[0]?.state).toBe('unsynced')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('classifies a matching stored hash as fresh, then stale after the file mutates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
    try {
      const file = join(dir, 'a.ts')
      await writeFile(file, 'hello', 'utf8')
      const node: Node = { id: 'payments', sources: [{ file: 'a.ts', hash: '2cf24dba5fb0a30e' }] }
      const fresh = await classifyNode(node, dir)
      expect(fresh.state).toBe('fresh')
      await writeFile(file, 'goodbye', 'utf8')
      const stale = await classifyNode(node, dir)
      expect(stale.state).toBe('stale')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('classifies a deleted file as missing, and mixing fresh and missing aggregates to missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
    try {
      const freshFile = join(dir, 'a.ts')
      const goneFile = join(dir, 'b.ts')
      await writeFile(freshFile, 'hello', 'utf8')
      await writeFile(goneFile, 'bye', 'utf8')
      const node: Node = {
        id: 'payments',
        sources: [
          { file: 'a.ts', hash: '2cf24dba5fb0a30e' },
          { file: 'b.ts', hash: 'anything00000000' }
        ]
      }
      await unlink(goneFile)
      const status = await classifyNode(node, dir)
      expect(status.state).toBe('missing')
      expect(status.sources.map((s) => s.state)).toEqual(['fresh', 'missing'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('classifies a zero-source node as fresh', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
    try {
      const node: Node = { id: 'payments', sources: [] }
      const status = await classifyNode(node, dir)
      expect(status.state).toBe('fresh')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects a stored-hash source that points at a directory instead of treating it as missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
    try {
      const node: Node = { id: 'payments', sources: [{ file: '.', hash: '2cf24dba5fb0a30e' }] }
      await expect(classifyNode(node, dir)).rejects.toBeDefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('statusReport', () => {
  it('classifies every node in the manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-status-'))
    try {
      await writeFile(join(dir, 'a.ts'), 'hello', 'utf8')
      const manifest: Manifest = {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2026-07-08T00:00:00Z',
        nodes: [
          { id: 'payments', sources: [{ file: 'a.ts', hash: '2cf24dba5fb0a30e' }] },
          { id: 'billing', sources: [] }
        ]
      }
      const report = await statusReport(manifest, dir)
      expect(report.map((r) => ({ id: r.id, state: r.state }))).toEqual([
        { id: 'payments', state: 'fresh' },
        { id: 'billing', state: 'fresh' }
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
