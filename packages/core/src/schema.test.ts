import { describe, expect, it } from 'vitest'
import { manifestSchema } from './schema'

interface RawManifest {
  version: number
  locales: string[]
  defaultLocale: string
  updated_at: string
  nodes: Array<{ id: string; sources: Array<{ file: string; hash?: string }> }>
}

function baseManifest(): RawManifest {
  return {
    version: 1,
    locales: ['en'],
    defaultLocale: 'en',
    updated_at: '2026-07-08T00:00:00Z',
    nodes: [{ id: 'payments', sources: [] }]
  }
}

describe('manifestSchema', () => {
  it('accepts a minimal valid manifest', () => {
    const result = manifestSchema.safeParse(baseManifest())
    expect(result.success).toBe(true)
  })

  it('rejects an uppercase id', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'Payments', sources: [] }]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('rejects an id containing a dot', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'a.b', sources: [] }]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('rejects an id containing a slash', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'a/b', sources: [] }]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('rejects a defaultLocale not present in locales', () => {
    const manifest = baseManifest()
    manifest.locales = ['en', 'zh']
    manifest.defaultLocale = 'de'
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('rejects duplicate locales', () => {
    const manifest = baseManifest()
    manifest.locales = ['en', 'en']
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('rejects two nodes with the same id', () => {
    const manifest = baseManifest()
    manifest.nodes = [
      { id: 'payments', sources: [] },
      { id: 'payments', sources: [] }
    ]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('accepts a node with empty sources and a source with file but no hash', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: 'src/payment.ts' }] }]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(true)
  })

  it('rejects a source file with a parent-traversal segment', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: '../x' }] }]
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects a source file with a traversal segment in the middle of the path', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: 'a/../b' }] }]
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects an absolute source file path', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: '/abs/x' }] }]
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects a windows drive-letter source file path', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: 'C:\\win' }] }]
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('accepts nested relative source file paths', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: 'packages/api/src/payment.ts' }] }]
    expect(manifestSchema.safeParse(manifest).success).toBe(true)
  })

  it('accepts a source carrying both hash and commit', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: 'a.ts', hash: 'abc123', commit: 'deadbeef' } as never] }]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(true)
  })

  it('rejects a source with a commit but no hash', () => {
    const manifest = baseManifest()
    manifest.nodes = [{ id: 'payments', sources: [{ file: 'a.ts', commit: 'deadbeef' } as never] }]
    const result = manifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })

  it('accepts a manifest with a file federated entry', () => {
    const manifest = { ...baseManifest(), federated: [{ alias: 'web', type: 'file', path: '../web' }] }
    expect(manifestSchema.safeParse(manifest).success).toBe(true)
  })

  it('rejects an absolute federated file path', () => {
    const manifest = { ...baseManifest(), federated: [{ alias: 'web', type: 'file', path: '/etc/secrets' }] }
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects a drive-rooted federated file path', () => {
    const manifest = { ...baseManifest(), federated: [{ alias: 'web', type: 'file', path: 'C:\\docs' }] }
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects the reserved federated alias "self"', () => {
    const manifest = { ...baseManifest(), federated: [{ alias: 'self', type: 'file', path: '../web' }] }
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects duplicate federated aliases within a manifest', () => {
    const manifest = {
      ...baseManifest(),
      federated: [
        { alias: 'web', type: 'file', path: '../a' },
        { alias: 'web', type: 'file', path: '../b' }
      ]
    }
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects a git federated entry without a ref', () => {
    const manifest = { ...baseManifest(), federated: [{ alias: 'web', type: 'git', url: 'https://x.git' }] }
    expect(manifestSchema.safeParse(manifest).success).toBe(false)
  })
})
