import { beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const cartoCli = join(repoRoot, 'packages', 'cli', 'dist', 'index.js')
const fixtures = join(repoRoot, 'tests', 'pipeline', 'fixtures')

interface Run {
  status: number | null
  stdout: string
  stderr: string
}

function carto(args: string[], cwd: string): Run {
  const r = spawnSync(process.execPath, [cartoCli, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function readAll(dir: string, ext: string): string {
  return walk(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
}

describe('carto pipeline: deterministic sync/validate/build over hand-written docs', () => {
  beforeAll(() => {
    if (!existsSync(cartoCli)) {
      throw new Error(`carto CLI not built at ${cartoCli}; run \`pnpm build\` before \`pnpm test:pipeline\``)
    }
  })

  it(
    'builds, detects staleness after a source change, refreshes, then federates a second doc-set',
    () => {
      const workDir = join(repoRoot, 'tests', 'pipeline', '.work')
      mkdirSync(workDir, { recursive: true })
      const root = mkdtempSync(join(workDir, 'carto-pipeline-'))
      const codeRoot = join(root, 'sample-app')
      const docRoot = join(root, 'docs-root')
      const glossaryRoot = join(root, 'glossary')
      try {
        cpSync(join(fixtures, 'sample-app', 'src'), join(codeRoot, 'src'), { recursive: true })
        cpSync(join(fixtures, 'doc-set'), docRoot, { recursive: true })

        const sync1 = carto(['sync'], docRoot)
        expect(sync1.status, `sync failed:\n${sync1.stderr}`).toBe(0)

        const validate1 = carto(['validate'], docRoot)
        expect(validate1.status, `validate not green after sync:\n${validate1.stdout}\n${validate1.stderr}`).toBe(0)

        const nodeCount = readdirSync(join(docRoot, 'docs'), { withFileTypes: true }).filter(
          (e) => e.isDirectory() && existsSync(join(docRoot, 'docs', e.name, 'node.json'))
        ).length
        expect(nodeCount).toBeGreaterThanOrEqual(3)

        const coverage1 = carto(['coverage'], docRoot)
        expect(coverage1.status, `coverage failed:\n${coverage1.stderr}`).toBe(0)
        expect(coverage1.stdout, 'coverage must walk the code root (3 source files), not the doc root').toMatch(/\/ 3 files/)

        const build1 = carto(['build'], docRoot)
        expect(build1.status, `build failed:\n${build1.stdout}\n${build1.stderr}`).toBe(0)

        const html1 = readAll(join(docRoot, 'dist-site'), '.html')
        expect(html1).toContain('authorId')
        expect(html1).toContain('buildFeed')
        expect(/href=["']carto:/i.test(html1), 'unresolved carto: link href in built HTML').toBe(false)

        cpSync(join(fixtures, 'sample-app', 'mutations', 'user-with-handle.ts'), join(codeRoot, 'src', 'user.ts'))

        const staleBeforeRefresh = carto(['status'], docRoot)
        expect(staleBeforeRefresh.status, 'carto status should be non-zero after mutating sample-app/src/user.ts').not.toBe(0)

        cpSync(join(fixtures, 'refresh', 'user'), join(docRoot, 'docs', 'user'), { recursive: true })
        const syncUser = carto(['sync', 'user'], docRoot)
        expect(syncUser.status, `sync user failed:\n${syncUser.stderr}`).toBe(0)

        const status2 = carto(['status'], docRoot)
        expect(status2.status, `carto status not green after refresh:\n${status2.stdout}\n${status2.stderr}`).toBe(0)

        const build2 = carto(['build'], docRoot)
        expect(build2.status, `build failed after refresh:\n${build2.stdout}\n${build2.stderr}`).toBe(0)

        const html2 = readAll(join(docRoot, 'dist-site'), '.html')
        expect(html2).toContain('handle')
        expect(html2).toContain('authorId')
        expect(html2).toContain('buildFeed')
        expect(/href=["']carto:/i.test(html2), 'unresolved carto: link href in built HTML after refresh').toBe(false)

        cpSync(join(fixtures, 'glossary'), glossaryRoot, { recursive: true })

        const manifest = JSON.parse(readFileSync(join(docRoot, 'carto.json'), 'utf8'))
        manifest.federated = [{ alias: 'glossary', type: 'file', path: '../glossary' }]
        writeFileSync(join(docRoot, 'carto.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

        for (const locale of ['en', 'zh']) {
          const page = join(docRoot, 'docs', 'overview', `${locale}.mdx`)
          const body = readFileSync(page, 'utf8')
          writeFileSync(page, `${body}\nSee the [glossary](carto:glossary/terms).\n`, 'utf8')
        }

        const validate3 = carto(['validate'], docRoot)
        expect(validate3.status, `validate not green after federate:\n${validate3.stdout}\n${validate3.stderr}`).toBe(0)

        const build3 = carto(['build'], docRoot)
        expect(build3.status, `build failed after federate:\n${build3.stdout}\n${build3.stderr}`).toBe(0)

        const distFiles = walk(join(docRoot, 'dist-site'))
        expect(distFiles.some((f) => /glossary-[0-9a-f]{8}/.test(f)), 'built site must mount the federated glossary under its alias-hash prefix').toBe(true)
        expect(distFiles.some((f) => /[\\/]self[\\/]/.test(f)), 'own pages must be mounted under the /self prefix once federation is active').toBe(true)

        const html3 = readAll(join(docRoot, 'dist-site'), '.html')
        expect(html3).toContain('Glossary')
        expect(/href=["']carto:/i.test(html3), 'unresolved carto: link href in built HTML after federate').toBe(false)
        expect(/href=["'][^"']*glossary-[0-9a-f]{8}\/terms/i.test(html3), 'cross-doc-set link must resolve to the prefixed glossary url').toBe(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    120_000
  )
})
