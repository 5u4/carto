import { describe, expect, it } from 'vitest'
import remarkSourceFootnotes, {
  rehypeSourceFootnoteLabels,
  type SourceFootnotePages
} from './remark-source-footnotes'

const pagePath = '/tmp/carto/src/content/docs/page.mdx'

function pages(locale = 'en', sources: string[] = []): SourceFootnotePages {
  return new Map([[pagePath, { locale, sources }]])
}

describe('remarkSourceFootnotes', () => {
  it('replaces grouped line citations with deduplicated native footnotes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Claim (' },
            { type: 'inlineCode', value: 'packages/core/src/a.ts:4-8' },
            { type: 'text', value: ', ' },
            { type: 'inlineCode', value: 'packages/core/src/b.ts:12' },
            { type: 'text', value: '). Repeated ' },
            { type: 'inlineCode', value: 'packages/core/src/a.ts:4-8' },
            { type: 'text', value: '.' }
          ]
        }
      ]
    }

    remarkSourceFootnotes({ pages: pages() })(tree, { path: pagePath })

    expect(tree.children[0].children).toEqual([
      { type: 'text', value: 'Claim' },
      { type: 'footnoteReference', identifier: 'carto-source-1', label: 'carto-source-1' },
      { type: 'text', value: ',\u202f' },
      { type: 'footnoteReference', identifier: 'carto-source-2', label: 'carto-source-2' },
      { type: 'text', value: '. Repeated' },
      { type: 'footnoteReference', identifier: 'carto-source-1', label: 'carto-source-1' },
      { type: 'text', value: '.' }
    ])
    expect(tree.children.slice(1)).toEqual([
      {
        type: 'footnoteDefinition',
        identifier: 'carto-source-1',
        label: 'carto-source-1',
        children: [{ type: 'paragraph', children: [{ type: 'inlineCode', value: 'packages/core/src/a.ts:4-8' }] }]
      },
      {
        type: 'footnoteDefinition',
        identifier: 'carto-source-2',
        label: 'carto-source-2',
        children: [{ type: 'paragraph', children: [{ type: 'inlineCode', value: 'packages/core/src/b.ts:12' }] }]
      }
    ])
  })

  it('shortens tracked bare paths to their shortest unique suffix', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'inlineCode', value: 'packages/core/src/status.ts' },
            { type: 'text', value: ' and ' },
            { type: 'inlineCode', value: 'packages/cli/src/status.ts' }
          ]
        }
      ]
    }

    remarkSourceFootnotes({
      pages: pages('en', ['packages/core/src/status.ts', 'packages/cli/src/status.ts'])
    })(tree, { path: pagePath })

    expect(tree.children[0].children).toEqual([
      { type: 'inlineCode', value: 'core/src/status.ts' },
      { type: 'footnoteReference', identifier: 'carto-source-1', label: 'carto-source-1' },
      { type: 'text', value: ' and ' },
      { type: 'inlineCode', value: 'cli/src/status.ts' },
      { type: 'footnoteReference', identifier: 'carto-source-2', label: 'carto-source-2' }
    ])
  })

  it('leaves non-citations and skipped syntax unchanged', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'inlineCode', value: 'timeout:900' }] },
        { type: 'paragraph', children: [{ type: 'inlineCode', value: 'examples/demo.ts' }] },
        { type: 'link', children: [{ type: 'inlineCode', value: 'packages/core/src/a.ts:4' }] },
        { type: 'code', value: 'packages/core/src/a.ts:4' }
      ]
    }

    remarkSourceFootnotes({ pages: pages() })(tree, { path: pagePath })

    expect(tree.children).toEqual([
      { type: 'paragraph', children: [{ type: 'inlineCode', value: 'timeout:900' }] },
      { type: 'paragraph', children: [{ type: 'inlineCode', value: 'examples/demo.ts' }] },
      { type: 'link', children: [{ type: 'inlineCode', value: 'packages/core/src/a.ts:4' }] },
      { type: 'code', value: 'packages/core/src/a.ts:4' }
    ])
  })

  it('avoids identifiers already used by authored footnotes', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'inlineCode', value: 'packages/core/src/a.ts:4' }] },
        {
          type: 'footnoteDefinition',
          identifier: 'carto-source-1',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Authored note' }] }]
        }
      ]
    }

    remarkSourceFootnotes({ pages: pages() })(tree, { path: pagePath })

    expect(tree.children[0].children).toEqual([
      { type: 'footnoteReference', identifier: 'carto-source-2', label: 'carto-source-2' }
    ])
  })
})

describe('rehypeSourceFootnoteLabels', () => {
  it('reveals a localized sources heading', () => {
    const tree = footnoteTree(['user-content-fn-carto-source-1'])

    rehypeSourceFootnoteLabels({ pages: pages('zh') })(tree, { path: pagePath })

    expect(tree.children[0].children[0]).toEqual({
      type: 'element',
      tagName: 'h2',
      properties: {},
      children: [{ type: 'text', value: '来源' }]
    })
  })

  it('labels a mixed authored and generated section', () => {
    const tree = footnoteTree(['user-content-fn-note', 'user-content-fn-carto-source-1'])

    rehypeSourceFootnoteLabels({ pages: pages() })(tree, { path: pagePath })

    expect(tree.children[0].children[0].children).toEqual([{ type: 'text', value: 'Notes and sources' }])
  })
})

function footnoteTree(ids: string[]) {
  return {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'section',
        properties: { dataFootnotes: true },
        children: [
          {
            type: 'element',
            tagName: 'h2',
            properties: { className: ['sr-only'] },
            children: [{ type: 'text', value: 'Footnotes' }]
          },
          {
            type: 'element',
            tagName: 'ol',
            properties: {},
            children: ids.map((id) => ({ type: 'element', tagName: 'li', properties: { id }, children: [] }))
          }
        ]
      }
    ]
  }
}
