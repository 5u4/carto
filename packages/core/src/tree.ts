import type { Manifest, Node } from './schema.js'

export function nodesById(nodes: Node[]): Map<string, Node> {
  const map = new Map<string, Node>()
  for (const node of nodes) map.set(node.id, node)
  return map
}

export function slugOf(node: Node): string {
  return node.slug ?? node.id
}

export function childrenOf(nodes: Node[], parentId: string | null): Node[] {
  return nodes.filter((node) => (node.parent ?? null) === parentId)
}

export function rootChain(nodes: Node[], id: string): Node[] {
  const byId = nodesById(nodes)
  const chain: Node[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return chain
}

export function urlPath(manifest: Manifest, id: string, locale: string): string {
  const prefix = locale === manifest.defaultLocale ? '' : `/${locale}`
  const segments = rootChain(manifest.nodes, id).map((node) => slugOf(node))
  return `${prefix}/${segments.join('/')}/`
}

export type TreeIssue =
  | { severity: 'error'; kind: 'duplicate-sibling-slug'; parent: string | null; slug: string; ids: string[] }
  | { severity: 'error'; kind: 'parent-cycle'; ids: string[] }
  | { severity: 'warning'; kind: 'dangling-parent'; id: string; parent: string }

export function checkTree(nodes: Node[]): TreeIssue[] {
  const issues: TreeIssue[] = []
  const byId = nodesById(nodes)

  const bySibling = new Map<string, Map<string, string[]>>()
  for (const node of nodes) {
    const parentKey = node.parent ?? '\u0000root'
    const slugMap = bySibling.get(parentKey) ?? new Map<string, string[]>()
    const slug = slugOf(node)
    slugMap.set(slug, [...(slugMap.get(slug) ?? []), node.id])
    bySibling.set(parentKey, slugMap)
  }
  for (const [parentKey, slugMap] of bySibling) {
    const parent = parentKey === '\u0000root' ? null : parentKey
    for (const [slug, ids] of slugMap) {
      if (ids.length > 1) issues.push({ severity: 'error', kind: 'duplicate-sibling-slug', parent, slug, ids })
    }
  }

  for (const node of nodes) {
    if (node.parent !== undefined && !byId.has(node.parent)) {
      issues.push({ severity: 'warning', kind: 'dangling-parent', id: node.id, parent: node.parent })
    }
  }

  const cycleKeys = new Set<string>()
  for (const start of nodes) {
    const seen = new Set<string>()
    let current: Node | undefined = start
    while (current && current.parent !== undefined && byId.has(current.parent)) {
      if (seen.has(current.id)) {
        const key = [...seen].sort().join(',')
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key)
          issues.push({ severity: 'error', kind: 'parent-cycle', ids: [...seen] })
        }
        break
      }
      seen.add(current.id)
      current = byId.get(current.parent)
    }
  }

  return issues
}
