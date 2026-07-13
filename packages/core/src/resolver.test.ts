import { describe, expect, it } from 'vitest'
import { parseCartoLink, resolveCartoLink } from './resolver'
import type { DocSet } from './graph'
import type { Manifest, Node } from './schema'

function node(partial: Partial<Node> & { id: string }): Node {
  return { sources: [], ...partial }
}

describe('parseCartoLink', () => {
  it('parses an internal link with no anchor', () => {
    expect(parseCartoLink('carto:payments')).toEqual({ kind: 'internal', id: 'payments', anchor: undefined })
  })

  it('parses an internal link with an anchor', () => {
    expect(parseCartoLink('carto:payments#refunds')).toEqual({ kind: 'internal', id: 'payments', anchor: 'refunds' })
  })

  it('parses a federation link with alias and id', () => {
    expect(parseCartoLink('carto:web/auth')).toEqual({ kind: 'federation', alias: 'web', id: 'auth', anchor: undefined })
  })

  it('returns null for a non-carto target', () => {
    expect(parseCartoLink('/foo')).toBeNull()
  })
})

describe('resolveCartoLink', () => {
  function manifest(): Manifest {
    return {
      version: 1,
      locales: ['en', 'zh'],
      defaultLocale: 'en',
      updated_at: '2026-07-08T00:00:00Z',
      federated: [],
      nodes: [
        node({ id: 'api', slug: 'backend' }),
        node({ id: 'payments', slug: 'billing', parent: 'api' })
      ]
    }
  }

  it('resolves an internal link to the node urlPath for the context locale', () => {
    const result = resolveCartoLink('carto:payments', { manifest: manifest(), locale: 'en' })
    expect(result).toEqual({ ok: true, url: '/backend/billing/', id: 'payments' })
  })

  it('appends the anchor to the resolved url', () => {
    const result = resolveCartoLink('carto:payments#refunds', { manifest: manifest(), locale: 'en' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.url.endsWith('#refunds')).toBe(true)
  })

  it('returns unknown-id for a missing node', () => {
    const result = resolveCartoLink('carto:ghost', { manifest: manifest(), locale: 'en' })
    expect(result).toEqual({ ok: false, error: { kind: 'unknown-id', id: 'ghost' } })
  })

  it('returns federation-unsupported when no federation context is provided', () => {
    const result = resolveCartoLink('carto:web/auth', { manifest: manifest(), locale: 'en' })
    expect(result).toEqual({ ok: false, error: { kind: 'federation-unsupported', alias: 'web' } })
  })

  function federatedContext() {
    const target: DocSet = {
      hash: 'deadbeef',
      prefix: '/web-deadbeef',
      docRoot: '/tmp/web',
      manifest: {
        version: 1,
        locales: ['en'],
        defaultLocale: 'en',
        updated_at: '2026-07-08T00:00:00Z',
        federated: [],
        nodes: [node({ id: 'auth', slug: 'auth' })]
      },
      aliasToHash: new Map()
    }
    return {
      byHash: new Map([['deadbeef', target]]),
      aliasToHash: new Map([['web', 'deadbeef']]),
      siteDefaultLocale: 'en'
    }
  }

  it('resolves a federation link to the target docset prefixed url', () => {
    const result = resolveCartoLink('carto:web/auth', { manifest: manifest(), locale: 'en', prefix: '/self', federation: federatedContext() })
    expect(result).toEqual({ ok: true, url: '/web-deadbeef/auth/', id: 'auth' })
  })

  it('returns unknown-alias for a federation alias not in the current manifest', () => {
    const result = resolveCartoLink('carto:ghost/auth', { manifest: manifest(), locale: 'en', federation: federatedContext() })
    expect(result).toEqual({ ok: false, error: { kind: 'unknown-alias', alias: 'ghost' } })
  })

  it('returns unknown-federated-id for a missing id in the target docset', () => {
    const result = resolveCartoLink('carto:web/ghost', { manifest: manifest(), locale: 'en', federation: federatedContext() })
    expect(result).toEqual({ ok: false, error: { kind: 'unknown-federated-id', alias: 'web', id: 'ghost' } })
  })

  it('prefixes a non-default site locale onto a federation url', () => {
    const result = resolveCartoLink('carto:web/auth', { manifest: manifest(), locale: 'zh', federation: federatedContext() })
    expect(result.ok && result.url).toBe('/zh/web-deadbeef/auth/')
  })
})
