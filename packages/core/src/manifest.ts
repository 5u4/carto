import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { configSchema, nodeFileSchema, ID_PATTERN, type Manifest, type Config, type Node, type NodeFile, type Source, type Federated } from './schema.js'
import { hashFile } from './hash.js'

export function codeRootDir(manifest: Manifest, docRoot: string): string {
  return resolve(docRoot, manifest.codeRoot ?? '.')
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestError'
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export function parseConfig(raw: unknown): Config {
  const result = configSchema.safeParse(raw)
  if (!result.success) {
    throw new ManifestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  return result.data
}

export function parseNodeFile(id: string, raw: unknown): Node {
  const result = nodeFileSchema.safeParse(raw)
  if (!result.success) {
    throw new ManifestError(result.error.issues.map((i) => `node ${id}: ${i.path.join('.')}: ${i.message}`).join('; '))
  }
  return { id, ...result.data }
}

export function serializeConfig(config: Config): string {
  const ordered: Record<string, unknown> = {
    version: config.version,
    locales: config.locales,
    defaultLocale: config.defaultLocale
  }
  if (config.codeRoot !== undefined) ordered.codeRoot = config.codeRoot
  if (config.home !== undefined) ordered.home = config.home
  if (config.federated.length > 0) ordered.federated = config.federated.map((entry) => orderFederated(entry))
  return `${JSON.stringify(ordered, null, 2)}\n`
}

export function serializeNodeFile(node: Node): string {
  const out: Record<string, unknown> = {}
  if (node.parent !== undefined) out.parent = node.parent
  out.sources = node.sources.map((source) => orderSource(source))
  return `${JSON.stringify(out, null, 2)}\n`
}

function orderSource(source: Source): Record<string, unknown> {
  const out: Record<string, unknown> = { file: source.file }
  if (source.hash !== undefined) out.hash = source.hash
  if (source.hash !== undefined && source.commit !== undefined) out.commit = source.commit
  return out
}

function orderFederated(entry: Federated): Record<string, unknown> {
  if (entry.type === 'file') return { alias: entry.alias, type: entry.type, path: entry.path }
  const out: Record<string, unknown> = { alias: entry.alias, type: entry.type, url: entry.url, ref: entry.ref }
  if (entry.subdir !== undefined) out.subdir = entry.subdir
  return out
}

export async function readConfig(docRoot: string): Promise<Config> {
  const path = join(docRoot, 'carto.json')
  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ManifestError(`${path} is not valid JSON`)
  }
  return parseConfig(json)
}

async function readNodeIds(docRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(docRoot, 'docs'), { withFileTypes: true })
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
  const ids: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!ID_PATTERN.test(entry.name)) {
      throw new ManifestError(`docs/${entry.name} is not a valid node id (must match ${ID_PATTERN.source})`)
    }
    ids.push(entry.name)
  }
  return ids.sort()
}

export async function readNode(docRoot: string, id: string): Promise<Node | undefined> {
  const path = join(docRoot, 'docs', id, 'node.json')
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ManifestError(`${path} is not valid JSON`)
  }
  return parseNodeFile(id, json)
}

export async function readManifest(docRoot: string): Promise<Manifest> {
  const config = await readConfig(docRoot)
  const ids = await readNodeIds(docRoot)
  const nodes: Node[] = []
  for (const id of ids) {
    const node = await readNode(docRoot, id)
    if (node !== undefined) nodes.push(node)
  }
  return { ...config, nodes }
}

export async function writeConfig(docRoot: string, config: Config): Promise<void> {
  await mkdir(docRoot, { recursive: true })
  await writeFile(join(docRoot, 'carto.json'), serializeConfig(config), 'utf8')
}

export async function writeNode(docRoot: string, node: Node): Promise<void> {
  const dir = join(docRoot, 'docs', node.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'node.json'), serializeNodeFile(node), 'utf8')
}

export async function writeManifest(docRoot: string, manifest: Manifest): Promise<void> {
  await writeConfig(docRoot, manifest)
  for (const node of manifest.nodes) await writeNode(docRoot, node)
}

export interface SyncOptions {
  rootDir: string
  commit?: string
  targets?: string[]
}

export interface SyncResult {
  manifest: Manifest
  changed: string[]
}

async function syncSources(sources: Source[], rootDir: string, commit: string | undefined, missing: string[]): Promise<{ sources: Source[]; changed: boolean }> {
  const next: Source[] = []
  let changed = false
  for (const source of sources) {
    try {
      const hash = await hashFile(join(rootDir, source.file))
      if (hash !== source.hash || commit !== source.commit) changed = true
      next.push({ file: source.file, hash, commit })
    } catch (error) {
      if (!isNotFound(error)) throw error
      missing.push(source.file)
      next.push({ file: source.file, hash: source.hash, commit: source.commit })
    }
  }
  return { sources: next, changed }
}

async function syncUnsynced(sources: Source[], rootDir: string, commit: string | undefined, missing: string[]): Promise<{ sources: Source[]; changed: boolean }> {
  const next: Source[] = []
  let changed = false
  for (const source of sources) {
    if (source.hash !== undefined) {
      next.push(source)
      continue
    }
    try {
      const hash = await hashFile(join(rootDir, source.file))
      changed = true
      next.push({ file: source.file, hash, commit })
    } catch (error) {
      if (!isNotFound(error)) throw error
      missing.push(source.file)
      next.push(source)
    }
  }
  return { sources: next, changed }
}

export async function syncManifest(manifest: Manifest, options: SyncOptions): Promise<SyncResult> {
  const targets = options.targets
  if (targets !== undefined) {
    const known = new Set(manifest.nodes.map((node) => node.id))
    const unknown = targets.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      throw new ManifestError(`unknown node id(s): ${unknown.join(', ')}`)
    }
  }
  const targetSet = targets === undefined ? undefined : new Set(targets)
  const missing: string[] = []
  const nodes: Node[] = []
  const changed: string[] = []
  for (const node of manifest.nodes) {
    const inScope = targetSet === undefined || targetSet.has(node.id)
    if (!inScope) {
      nodes.push(node)
      continue
    }
    const result = targetSet === undefined
      ? await syncUnsynced(node.sources, options.rootDir, options.commit, missing)
      : await syncSources(node.sources, options.rootDir, options.commit, missing)
    nodes.push({ ...node, sources: result.sources })
    if (result.changed) changed.push(node.id)
  }
  if (missing.length > 0) {
    throw new ManifestError(`cannot sync: missing source files: ${missing.join(', ')}`)
  }
  return { manifest: { ...manifest, nodes }, changed }
}
