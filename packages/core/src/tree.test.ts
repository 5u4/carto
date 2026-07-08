import { describe, expect, it } from 'vitest'
import { checkTree, childrenOf, rootChain, urlPath } from './tree'
import type { Manifest, Node } from './schema'

function node(partial: Partial<Node> & { id: string }): Node {
  return { sources: [], ...partial }
}

describe('childrenOf', () => {
  it('returns siblings in array order', () => {
    const nodes = [node({ id: 'b', parent: 'root' }), node({ id: 'a', parent: 'root' }), node({ id: 'c', parent: 'other' })]
    expect(childrenOf(nodes, 'root').map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('root children are the nodes with no parent', () => {
    const nodes = [node({ id: 'root' }), node({ id: 'child', parent: 'root' })]
    expect(childrenOf(nodes, null).map((n) => n.id)).toEqual(['root'])
  })
})

describe('rootChain', () => {
  it('returns root, mid, leaf for a 3-level tree', () => {
    const nodes = [node({ id: 'root' }), node({ id: 'mid', parent: 'root' }), node({ id: 'leaf', parent: 'mid' })]
    expect(rootChain(nodes, 'leaf').map((n) => n.id)).toEqual(['root', 'mid', 'leaf'])
  })
})

describe('urlPath', () => {
  function manifest(): Manifest {
    return {
      version: 1,
      locales: ['en', 'zh'],
      defaultLocale: 'en',
      updated_at: '2026-07-08T00:00:00Z',
      nodes: [
        node({ id: 'api', slug: 'backend' }),
        node({ id: 'payments', slug: 'billing', parent: 'api' })
      ]
    }
  }

  it('builds a path with no prefix for the default locale, using slug overrides', () => {
    expect(urlPath(manifest(), 'payments', 'en')).toBe('/backend/billing/')
  })

  it('builds a path with a locale prefix for a non-default locale', () => {
    expect(urlPath(manifest(), 'payments', 'zh')).toBe('/zh/backend/billing/')
  })
})

describe('checkTree', () => {
  it('reports one duplicate-sibling-slug error', () => {
    const nodes = [node({ id: 'a', slug: 'x' }), node({ id: 'b', slug: 'x' })]
    const issues = checkTree(nodes)
    expect(issues).toEqual([{ severity: 'error', kind: 'duplicate-sibling-slug', parent: null, slug: 'x', ids: ['a', 'b'] }])
  })

  it('reports one dangling-parent warning for an absent parent', () => {
    const nodes = [node({ id: 'a', parent: 'ghost' })]
    const issues = checkTree(nodes)
    expect(issues).toEqual([{ severity: 'warning', kind: 'dangling-parent', id: 'a', parent: 'ghost' }])
  })

  it('reports exactly one parent-cycle error for a 2-node mutual cycle', () => {
    const nodes = [node({ id: 'a', parent: 'b' }), node({ id: 'b', parent: 'a' })]
    const issues = checkTree(nodes)
    const cycleIssues = issues.filter((issue) => issue.kind === 'parent-cycle')
    expect(cycleIssues).toHaveLength(1)
    expect(cycleIssues[0]).toMatchObject({ severity: 'error', kind: 'parent-cycle' })
  })

  it('excludes lead-in nodes from a cycle reached via a non-cyclic path', () => {
    const nodes = [node({ id: 'x', parent: 'a' }), node({ id: 'a', parent: 'b' }), node({ id: 'b', parent: 'a' })]
    const issues = checkTree(nodes)
    const cycleIssues = issues.filter((issue) => issue.kind === 'parent-cycle')
    expect(cycleIssues).toHaveLength(1)
    const [cycleIssue] = cycleIssues
    if (cycleIssue?.kind !== 'parent-cycle') throw new Error('expected a parent-cycle issue')
    expect([...cycleIssue.ids].sort()).toEqual(['a', 'b'])
  })

  it('reports a self-parent as a one-node cycle', () => {
    const nodes = [node({ id: 'a', parent: 'a' })]
    const issues = checkTree(nodes)
    expect(issues).toEqual([{ severity: 'error', kind: 'parent-cycle', ids: ['a'] }])
  })

  it('returns no issues for a valid tree', () => {
    const nodes = [node({ id: 'root' }), node({ id: 'child', parent: 'root' })]
    expect(checkTree(nodes)).toEqual([])
  })
})
