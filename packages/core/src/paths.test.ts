import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { docsDir, localeFile, nodeDir, nodeFile } from './index'

describe('Carto storage paths', () => {
  it('keeps every node artifact under .carto/docs', () => {
    const root = join('workspace', 'guide')

    expect(docsDir(root)).toBe(join(root, '.carto', 'docs'))
    expect(nodeDir(root, 'api')).toBe(join(root, '.carto', 'docs', 'api'))
    expect(nodeFile(root, 'api')).toBe(join(root, '.carto', 'docs', 'api', 'node.json'))
    expect(localeFile(root, 'api', 'fr')).toBe(join(root, '.carto', 'docs', 'api', 'fr.mdx'))
  })
})
