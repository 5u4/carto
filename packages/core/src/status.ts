import { join } from 'node:path'
import type { Manifest, Node } from './schema.js'
import { hashFile } from './hash.js'

export type FreshnessState = 'fresh' | 'unsynced' | 'stale' | 'missing'

export interface SourceStatus {
  file: string
  state: FreshnessState
  stored?: string
  actual?: string
}

export interface NodeStatus {
  id: string
  state: FreshnessState
  sources: SourceStatus[]
}

const PRIORITY: Record<FreshnessState, number> = { fresh: 0, unsynced: 1, stale: 2, missing: 3 }

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export async function classifyNode(node: Node, rootDir: string): Promise<NodeStatus> {
  const sources: SourceStatus[] = []
  for (const source of node.sources) {
    sources.push(await classifySource(source.file, source.hash, rootDir))
  }
  const state = sources.reduce<FreshnessState>((worst, s) => (PRIORITY[s.state] > PRIORITY[worst] ? s.state : worst), 'fresh')
  return { id: node.id, state, sources }
}

async function classifySource(file: string, stored: string | undefined, rootDir: string): Promise<SourceStatus> {
  const absolute = join(rootDir, file)
  let actual: string
  try {
    actual = await hashFile(absolute)
  } catch (error) {
    if (isNotFound(error)) return { file, state: 'missing', stored }
    throw error
  }
  if (stored === undefined) return { file, state: 'unsynced' }
  return actual === stored ? { file, state: 'fresh', stored, actual } : { file, state: 'stale', stored, actual }
}

export async function statusReport(manifest: Manifest, rootDir: string): Promise<NodeStatus[]> {
  const report: NodeStatus[] = []
  for (const node of manifest.nodes) report.push(await classifyNode(node, rootDir))
  return report
}
