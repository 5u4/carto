import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { manifestSchema, type Manifest, type Node, type Source } from './schema.js'
import { hashFile } from './hash.js'

export class ManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestError'
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export function parseManifest(raw: unknown): Manifest {
  const result = manifestSchema.safeParse(raw)
  if (!result.success) {
    throw new ManifestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  return result.data
}

export function serializeManifest(manifest: Manifest): string {
  const ordered: Record<string, unknown> = {
    version: manifest.version,
    locales: manifest.locales,
    defaultLocale: manifest.defaultLocale,
    updated_at: manifest.updated_at
  }
  if (manifest.home !== undefined) ordered.home = manifest.home
  ordered.nodes = manifest.nodes.map((node) => orderNode(node))
  return `${JSON.stringify(ordered, null, 2)}\n`
}

function orderNode(node: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { id: node.id }
  if (node.slug !== undefined) out.slug = node.slug
  if (node.parent !== undefined) out.parent = node.parent
  out.sources = node.sources.map((source) => orderSource(source))
  return out
}

function orderSource(source: Source): Record<string, unknown> {
  return source.hash === undefined ? { file: source.file } : { file: source.file, hash: source.hash }
}

export async function readManifest(path: string): Promise<Manifest> {
  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ManifestError(`${path} is not valid JSON`)
  }
  return parseManifest(json)
}

export async function writeManifest(path: string, manifest: Manifest): Promise<void> {
  await writeFile(path, serializeManifest(manifest), 'utf8')
}

export interface SyncOptions {
  rootDir: string
  now?: () => string
}

export async function syncManifest(manifest: Manifest, options: SyncOptions): Promise<Manifest> {
  const missing: string[] = []
  const nodes: Node[] = []
  for (const node of manifest.nodes) {
    const sources: Source[] = []
    for (const source of node.sources) {
      try {
        sources.push({ file: source.file, hash: await hashFile(join(options.rootDir, source.file)) })
      } catch (error) {
        if (!isNotFound(error)) throw error
        missing.push(source.file)
        sources.push({ file: source.file, hash: source.hash })
      }
    }
    nodes.push({ ...node, sources })
  }
  if (missing.length > 0) {
    throw new ManifestError(`cannot sync: missing source files: ${missing.join(', ')}`)
  }
  const now = options.now ? options.now() : new Date().toISOString()
  return { ...manifest, updated_at: now, nodes }
}
