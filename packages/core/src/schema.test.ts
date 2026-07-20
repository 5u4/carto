import { describe, expect, it } from 'vitest'
import { configSchema, nodeFileSchema } from './schema'

function baseConfig() {
  return { version: 1, locales: ['en'], defaultLocale: 'en' }
}

describe('configSchema', () => {
  it('accepts a minimal valid config', () => {
    expect(configSchema.safeParse(baseConfig()).success).toBe(true)
  })

  it('rejects a defaultLocale not present in locales', () => {
    expect(configSchema.safeParse({ ...baseConfig(), locales: ['en', 'zh'], defaultLocale: 'de' }).success).toBe(false)
  })

  it('rejects duplicate locales', () => {
    expect(configSchema.safeParse({ ...baseConfig(), locales: ['en', 'en'] }).success).toBe(false)
  })

  it('rejects a home id that is not a valid id', () => {
    expect(configSchema.safeParse({ ...baseConfig(), home: 'Not/Valid' }).success).toBe(false)
  })

  it('accepts a config with a file federated entry', () => {
    expect(configSchema.safeParse({ ...baseConfig(), federated: [{ alias: 'web', type: 'file', path: '../web' }] }).success).toBe(true)
  })

  it('rejects an absolute federated file path', () => {
    expect(configSchema.safeParse({ ...baseConfig(), federated: [{ alias: 'web', type: 'file', path: '/etc/secrets' }] }).success).toBe(false)
  })

  it('rejects a drive-rooted federated file path', () => {
    expect(configSchema.safeParse({ ...baseConfig(), federated: [{ alias: 'web', type: 'file', path: 'C:\\docs' }] }).success).toBe(false)
  })

  it('rejects the reserved federated alias "self"', () => {
    expect(configSchema.safeParse({ ...baseConfig(), federated: [{ alias: 'self', type: 'file', path: '../web' }] }).success).toBe(false)
  })

  it('rejects duplicate federated aliases', () => {
    const federated = [
      { alias: 'web', type: 'file', path: '../a' },
      { alias: 'web', type: 'file', path: '../b' }
    ]
    expect(configSchema.safeParse({ ...baseConfig(), federated }).success).toBe(false)
  })

  it('rejects a git federated entry without a ref', () => {
    expect(configSchema.safeParse({ ...baseConfig(), federated: [{ alias: 'web', type: 'git', url: 'https://x.git' }] }).success).toBe(false)
  })
})

describe('nodeFileSchema', () => {
  it('accepts a node with empty sources', () => {
    expect(nodeFileSchema.safeParse({ sources: [] }).success).toBe(true)
  })

  it('defaults sources to an empty array', () => {
    const result = nodeFileSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sources).toEqual([])
  })

  it('accepts a source with file but no hash', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: 'src/payment.ts' }] }).success).toBe(true)
  })

  it('rejects a parent that is not a valid id', () => {
    expect(nodeFileSchema.safeParse({ parent: 'Bad/Id', sources: [] }).success).toBe(false)
  })

  it('rejects a source file with a parent-traversal segment', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: '../x' }] }).success).toBe(false)
  })

  it('rejects a source file with a traversal segment in the middle of the path', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: 'a/../b' }] }).success).toBe(false)
  })

  it('rejects an absolute source file path', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: '/abs/x' }] }).success).toBe(false)
  })

  it('rejects a windows drive-letter source file path', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: 'C:\\win' }] }).success).toBe(false)
  })

  it('accepts nested relative source file paths', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: 'packages/api/src/payment.ts' }] }).success).toBe(true)
  })

  it('accepts a source carrying both hash and commit', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: 'a.ts', hash: 'abc123', commit: 'deadbeef' }] }).success).toBe(true)
  })

  it('rejects a source with a commit but no hash', () => {
    expect(nodeFileSchema.safeParse({ sources: [{ file: 'a.ts', commit: 'deadbeef' }] }).success).toBe(false)
  })
})
