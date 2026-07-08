import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashContent, hashFile } from './hash'

describe('hashContent', () => {
  it('returns 16 lowercase hex chars matching the known sha256 prefix', () => {
    const digest = hashContent(new TextEncoder().encode('hello'))
    expect(digest).toMatch(/^[0-9a-f]{16}$/)
    expect(digest).toBe('2cf24dba5fb0a30e')
  })
})

describe('hashFile', () => {
  it('equals hashContent of the file bytes and changes when the file mutates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'carto-hash-'))
    const file = join(dir, 'source.txt')
    try {
      await writeFile(file, 'hello', 'utf8')
      const first = await hashFile(file)
      expect(first).toBe(hashContent(new TextEncoder().encode('hello')))
      await writeFile(file, 'goodbye', 'utf8')
      const second = await hashFile(file)
      expect(second).toBe(hashContent(new TextEncoder().encode('goodbye')))
      expect(second).not.toBe(first)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
