import { describe, expect, it } from 'vitest'
import type { NodeStatus } from '@carto/core'
import { injectStalenessBanner } from './staleness-banner'

const mdx = '---\ntitle: Payments\n---\n\nBody text.\n'

function status(partial: Partial<NodeStatus> & { state: NodeStatus['state'] }): NodeStatus {
  return { id: 'payments', sources: [], ...partial }
}

describe('injectStalenessBanner', () => {
  it('leaves a fresh node untouched', () => {
    expect(injectStalenessBanner(mdx, status({ state: 'fresh' }))).toBe(mdx)
  })

  it('leaves an unsynced node untouched', () => {
    expect(injectStalenessBanner(mdx, status({ state: 'unsynced' }))).toBe(mdx)
  })

  it('leaves the mdx untouched when status is undefined', () => {
    expect(injectStalenessBanner(mdx, undefined)).toBe(mdx)
  })

  it('adds a banner listing the changed files for a stale node', () => {
    const out = injectStalenessBanner(
      mdx,
      status({
        state: 'stale',
        sources: [
          { file: 'a.ts', state: 'stale' },
          { file: 'b.ts', state: 'fresh' }
        ]
      })
    )
    expect(out).toContain('banner:')
    expect(out).toContain('<code>a.ts</code>')
    expect(out).not.toContain('<code>b.ts</code>')
    expect(out).toContain('title: Payments')
    expect(out.startsWith('---\n')).toBe(true)
  })

  it('names both changed and missing files for a missing node', () => {
    const out = injectStalenessBanner(
      mdx,
      status({
        state: 'missing',
        sources: [
          { file: 'gone.ts', state: 'missing' },
          { file: 'moved.ts', state: 'stale' }
        ]
      })
    )
    expect(out).toContain('no longer exist: <code>gone.ts</code>')
    expect(out).toContain('changed since this page was written: <code>moved.ts</code>')
  })

  it('escapes backslashes and double quotes in file paths so the frontmatter stays valid', () => {
    const out = injectStalenessBanner(
      mdx,
      status({ state: 'stale', sources: [{ file: 'dir\\a"b.ts', state: 'stale' }] })
    )
    expect(out).toContain('<code>dir\\\\a\\"b.ts</code>')
  })

  it('leaves mdx without frontmatter untouched', () => {
    const noFrontmatter = 'Just body text.\n'
    expect(injectStalenessBanner(noFrontmatter, status({ state: 'stale' }))).toBe(noFrontmatter)
  })
})
