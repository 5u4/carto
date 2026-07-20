import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadGraph, FederationError } from './graph.js'
import { writeManifest } from './manifest.js'
import type { Federated, Manifest } from './schema.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-graph-'))
  dirs.push(dir)
  return dir
}

async function writeDocSet(root: string, sub: string, federated: Federated[] = []): Promise<string> {
  const dir = join(root, sub)
  const manifest: Manifest = {
    version: 1,
    locales: ['en'],
    defaultLocale: 'en',
    federated,
    nodes: [{ id: 'overview', sources: [] }]
  }
  await writeManifest(dir, manifest)
  return dir
}

describe('loadGraph', () => {
  it('reports no federation when the root has no federated entries', async () => {
    const workspace = await tempRoot()
    await writeDocSet(workspace, 'root')
    const graph = await loadGraph(join(workspace, 'root'))
    expect(graph.federated).toBe(false)
    expect(graph.root.prefix).toBe('')
    expect(graph.byHash.size).toBe(1)
  })

  it('gives the root the /self prefix and a child an alias.hash prefix', async () => {
    const workspace = await tempRoot()
    await writeDocSet(workspace, 'web')
    await writeDocSet(workspace, 'root', [{ alias: 'web', type: 'file', path: '../web' }])
    const graph = await loadGraph(join(workspace, 'root'))
    expect(graph.federated).toBe(true)
    expect(graph.root.prefix).toBe('/self')
    const child = [...graph.byHash.values()].find((ds) => ds !== graph.root)
    expect(child?.prefix).toMatch(/^\/web-[0-9a-f]{8}$/)
  })

  it('dedupes a diamond: the same doc-root referenced twice yields one docset', async () => {
    const workspace = await tempRoot()
    await writeDocSet(workspace, 'common')
    await writeDocSet(workspace, 'web', [{ alias: 'shared', type: 'file', path: '../common' }])
    await writeDocSet(workspace, 'root', [
      { alias: 'web', type: 'file', path: '../web' },
      { alias: 'common', type: 'file', path: '../common' }
    ])
    const graph = await loadGraph(join(workspace, 'root'))
    expect(graph.byHash.size).toBe(3)
  })

  it('picks the lexically smallest alias when a doc-root has several', async () => {
    const workspace = await tempRoot()
    await writeDocSet(workspace, 'common')
    await writeDocSet(workspace, 'root', [
      { alias: 'zeta', type: 'file', path: '../common' },
      { alias: 'alpha', type: 'file', path: '../common' }
    ])
    const graph = await loadGraph(join(workspace, 'root'))
    const child = [...graph.byHash.values()].find((ds) => ds !== graph.root)
    expect(child?.prefix).toMatch(/^\/alpha-/)
  })

  it('terminates on a cycle without infinite recursion', async () => {
    const workspace = await tempRoot()
    await writeDocSet(workspace, 'a', [{ alias: 'b', type: 'file', path: '../b' }])
    await writeDocSet(workspace, 'b', [{ alias: 'a', type: 'file', path: '../a' }])
    const graph = await loadGraph(join(workspace, 'a'))
    expect(graph.byHash.size).toBe(2)
  })

  it('throws for a git entry (not yet implemented)', async () => {
    const workspace = await tempRoot()
    await writeDocSet(workspace, 'root', [{ alias: 'x', type: 'git', url: 'https://x.git', ref: 'main' }])
    await expect(loadGraph(join(workspace, 'root'))).rejects.toBeInstanceOf(FederationError)
  })
})
