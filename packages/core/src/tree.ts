import type { Manifest, Node } from './schema.js'

export function nodesById(nodes: Node[]): Map<string, Node> {
  const map = new Map<string, Node>()
  for (const node of nodes) map.set(node.id, node)
  return map
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

export function urlPath(manifest: Manifest, id: string, locale: string, docPrefix = '', siteDefaultLocale = manifest.defaultLocale): string {
  const localePrefix = locale === siteDefaultLocale ? '' : `/${locale}`
  const segments = rootChain(manifest.nodes, id).map((node) => node.id)
  return `${localePrefix}${docPrefix}/${segments.join('/')}/`
}

export type TreeIssue =
  | { severity: 'error'; kind: 'parent-cycle'; ids: string[] }
  | { severity: 'warning'; kind: 'dangling-parent'; id: string; parent: string }

export function checkTree(nodes: Node[]): TreeIssue[] {
  const issues: TreeIssue[] = []
  const byId = nodesById(nodes)

  for (const node of nodes) {
    if (node.parent !== undefined && !byId.has(node.parent)) {
      issues.push({ severity: 'warning', kind: 'dangling-parent', id: node.id, parent: node.parent })
    }
  }

  const cycleKeys = new Set<string>()
  for (const start of nodes) {
    const path: string[] = []
    const onPath = new Set<string>()
    let current: Node | undefined = start
    while (current && current.parent !== undefined && byId.has(current.parent)) {
      if (onPath.has(current.id)) {
        const cycle = path.slice(path.indexOf(current.id))
        const key = [...cycle].sort().join(',')
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key)
          issues.push({ severity: 'error', kind: 'parent-cycle', ids: cycle })
        }
        break
      }
      path.push(current.id)
      onPath.add(current.id)
      current = byId.get(current.parent)
    }
  }

  return issues
}
