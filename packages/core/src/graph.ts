import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { Federated, Manifest } from './schema.js'
import { readManifest } from './manifest.js'

export interface DocSet {
  hash: string
  prefix: string
  docRoot: string
  manifest: Manifest
  aliasToHash: Map<string, string>
}

export interface Graph {
  federated: boolean
  root: DocSet
  byHash: Map<string, DocSet>
}

export class FederationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FederationError'
  }
}

async function identity(federalRoot: string, docRoot: string): Promise<{ hash: string; canonical: string }> {
  const canonical = relative(await realpath(federalRoot), await realpath(docRoot))
  const hash = createHash('sha256').update(`file:${canonical}`).digest('hex').slice(0, 8)
  return { hash, canonical }
}

function resolveEntry(currentDocRoot: string, entry: Federated): string {
  if (entry.type === 'git') {
    throw new FederationError(`git federation is not yet implemented (alias "${entry.alias}")`)
  }
  return resolve(currentDocRoot, entry.path)
}

export async function loadGraph(federalRoot: string): Promise<Graph> {
  const byHash = new Map<string, DocSet>()
  const aliasesByHash = new Map<string, Set<string>>()
  const rootManifest = await readManifest(join(federalRoot, 'carto.json'))
  const federated = rootManifest.federated.length > 0

  async function load(docRoot: string, hash: string): Promise<DocSet> {
    const existing = byHash.get(hash)
    if (existing) return existing
    const manifest = docRoot === federalRoot ? rootManifest : await readManifest(join(docRoot, 'carto.json'))
    const aliasToHash = new Map<string, string>()
    const docSet: DocSet = { hash, prefix: '', docRoot, manifest, aliasToHash }
    byHash.set(hash, docSet)
    for (const entry of manifest.federated) {
      const childRoot = resolveEntry(docRoot, entry)
      try {
        const { hash: childHash } = await identity(federalRoot, childRoot)
        aliasToHash.set(entry.alias, childHash)
        const aliases = aliasesByHash.get(childHash) ?? new Set<string>()
        aliases.add(entry.alias)
        aliasesByHash.set(childHash, aliases)
        await load(childRoot, childHash)
      } catch (error) {
        if (error instanceof FederationError) throw error
        const message = error instanceof Error ? error.message : String(error)
        throw new FederationError(`federated doc-set "${entry.alias}" could not be loaded from ${childRoot}: ${message}`)
      }
    }
    return docSet
  }

  const rootHash = (await identity(federalRoot, federalRoot)).hash
  const root = await load(federalRoot, rootHash)

  for (const docSet of byHash.values()) {
    if (docSet === root) {
      docSet.prefix = federated ? '/self' : ''
      continue
    }
    const aliases = aliasesByHash.get(docSet.hash)
    const minAlias = aliases ? [...aliases].sort()[0] : docSet.hash
    docSet.prefix = `/${minAlias}-${docSet.hash}`
  }

  return { federated, root, byHash }
}
