import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { coverageReport } from './coverage'
import type { Manifest } from './schema'

function manifest(nodes: Manifest['nodes']): Manifest {
  return { version: 1, locales: ['en'], defaultLocale: 'en', updated_at: '2026-01-01T00:00:00Z', nodes }
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'carto-coverage-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('coverageReport', () => {
  it('lists files not registered in any node source as uncovered', async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, 'src'), { recursive: true })
      await writeFile(join(dir, 'src', 'a.ts'), 'a')
      await writeFile(join(dir, 'src', 'b.ts'), 'b')
      const report = await coverageReport(manifest([{ id: 'n', sources: [{ file: 'src/a.ts' }] }]), dir)
      expect(report.total).toBe(2)
      expect(report.covered).toBe(1)
      expect(report.uncovered).toEqual(['src/b.ts'])
    })
  })

  it('reports full coverage when every file is tracked', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'only.ts'), 'x')
      const report = await coverageReport(manifest([{ id: 'n', sources: [{ file: 'only.ts' }] }]), dir)
      expect(report.total).toBe(1)
      expect(report.covered).toBe(1)
      expect(report.uncovered).toEqual([])
    })
  })

  it('treats a ./-prefixed source path as covering the same file', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'only.ts'), 'x')
      const report = await coverageReport(manifest([{ id: 'n', sources: [{ file: './only.ts' }] }]), dir)
      expect(report.uncovered).toEqual([])
    })
  })

  it("excludes carto's own outputs and vcs/dependency dirs by default", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'carto.json'), '{}')
      await mkdir(join(dir, 'docs', 'n'), { recursive: true })
      await writeFile(join(dir, 'docs', 'n', 'en.mdx'), 'doc')
      await mkdir(join(dir, 'dist-site'), { recursive: true })
      await writeFile(join(dir, 'dist-site', 'index.html'), 'html')
      await mkdir(join(dir, 'node_modules', 'dep'), { recursive: true })
      await writeFile(join(dir, 'node_modules', 'dep', 'index.js'), 'dep')
      await mkdir(join(dir, '.git'), { recursive: true })
      await writeFile(join(dir, '.git', 'HEAD'), 'ref')
      await writeFile(join(dir, 'real.ts'), 'src')
      const report = await coverageReport(manifest([]), dir)
      expect(report.uncovered).toEqual(['real.ts'])
    })
  })

  it('excludes .git whether it is a directory or a worktree gitlink file', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n')
      await writeFile(join(dir, 'real.ts'), 'src')
      const report = await coverageReport(manifest([]), dir)
      expect(report.uncovered).toEqual(['real.ts'])
    })
  })

  it('respects .gitignore and .cartoignore patterns', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, '.gitignore'), 'build/\n')
      await writeFile(join(dir, '.cartoignore'), '*.gen.ts\n')
      await mkdir(join(dir, 'build'), { recursive: true })
      await writeFile(join(dir, 'build', 'out.js'), 'out')
      await writeFile(join(dir, 'keep.ts'), 'keep')
      await writeFile(join(dir, 'schema.gen.ts'), 'gen')
      const report = await coverageReport(manifest([]), dir)
      expect(report.uncovered).toEqual(['keep.ts'])
    })
  })
})
