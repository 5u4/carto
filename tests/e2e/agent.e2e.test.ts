import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const cartoBin = join(repoRoot, 'node_modules', '.bin', 'carto')
const binDir = join(repoRoot, 'node_modules', '.bin')
const skillPath = join(repoRoot, 'skill', 'SKILL.md')
const fixtureSrc = join(repoRoot, 'tests', 'e2e', 'fixtures', 'sample-app', 'src')
const mutation = join(repoRoot, 'tests', 'e2e', 'fixtures', 'sample-app', 'mutations', 'user-with-handle.ts')

const runE2E = ['1', 'true', 'yes'].includes((process.env.CARTO_E2E ?? '').trim().toLowerCase())
const model = process.env.E2E_MODEL ?? 'claude-haiku-4.5'
const TURN_TIMEOUT = 300_000
const PHASE_TIMEOUT = 900_000

interface Run {
  status: number | null
  stdout: string
  stderr: string
}

function carto(args: string[], cwd: string): Run {
  const r = spawnSync(cartoBin, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function agent(prompt: string, cwd: string, sessionDir: string, cont: boolean): Run {
  const args = [
    '-p',
    '--auto-approve',
    '--no-skills',
    '--no-rules',
    '--no-extensions',
    '--model',
    model,
    '--session-dir',
    sessionDir,
    '--append-system-prompt',
    skillPath,
    ...(cont ? ['-c'] : []),
    prompt
  ]
  const r = spawnSync('omp', args, {
    cwd,
    encoding: 'utf8',
    timeout: TURN_TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` }
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

describe.skipIf(!runE2E)('agent e2e: document a mini codebase with carto', () => {
  it(
    'generates docs from zero, then refreshes after a source change',
    () => {
      const workDir = join(repoRoot, 'tests', 'e2e', '.work')
      mkdirSync(workDir, { recursive: true })
      const root = mkdtempSync(join(workDir, 'carto-e2e-'))
      const codeRoot = join(root, 'sample-app')
      const docRoot = join(root, 'docs-root')
      const sessionDir = join(docRoot, '.session')
      try {
        mkdirSync(join(codeRoot, 'src'), { recursive: true })
        cpSync(fixtureSrc, join(codeRoot, 'src'), { recursive: true })
        mkdirSync(docRoot, { recursive: true })

        const init = carto(['init', '--code-root', '../sample-app', '--locales', 'en,zh'], docRoot)
        expect(init.status, `init failed: ${init.stderr}`).toBe(0)

        const generate = agent(
          'Document a TypeScript codebase with carto. The doc root is the current directory and already has carto.json (locales en, zh, codeRoot "../sample-app") and docs/. The code being documented lives at ../sample-app; read ../sample-app/src/user.ts, ../sample-app/src/post.ts, ../sample-app/src/feed.ts. Design a carto node tree, write docs/<id>/<locale>.mdx for every node and every locale, and register each node\'s sources in carto.json as paths relative to codeRoot (i.e. src/user.ts, src/post.ts, src/feed.ts). Link related nodes with carto: links. Every .mdx file must begin with a YAML frontmatter block containing a `title:` field. Run carto sync and carto validate, then run carto build, fixing issues until both carto validate and carto build succeed. Do not stop until carto build succeeds.',
          docRoot,
          sessionDir,
          false
        )
        expect(generate.status, `agent generate crashed: ${generate.stderr}`).toBe(0)

        const validate1 = carto(['validate'], docRoot)
        expect(validate1.status, `validate not green after generate:\n${validate1.stdout}\n${validate1.stderr}`).toBe(0)

        const manifest1 = JSON.parse(readFileSync(join(docRoot, 'carto.json'), 'utf8'))
        expect(manifest1.nodes.length).toBeGreaterThanOrEqual(3)

        const coverage1 = carto(['coverage'], docRoot)
        expect(coverage1.status, `coverage failed after generate:\n${coverage1.stderr}`).toBe(0)
        expect(coverage1.stdout, 'coverage must walk the code root (3 source files), not the doc root').toMatch(/\/ 3 files/)

        const mdx1 = readAll(join(docRoot, 'docs'), '.mdx')
        expect(mdx1).toMatch(/\]\(carto:/)

        const build1 = carto(['build'], docRoot)
        expect(build1.status, `build failed after generate:\n${build1.stdout}\n${build1.stderr}`).toBe(0)

        const html1 = readAll(join(docRoot, 'dist-site'), '.html')
        expect(html1).toContain('authorId')
        expect(html1).toContain('buildFeed')
        expect(/href=["']carto:/i.test(html1), 'unresolved carto: link href in built HTML after generate').toBe(false)

        cpSync(mutation, join(codeRoot, 'src', 'user.ts'))

        const staleBeforeRefresh = carto(['validate'], docRoot)
        expect(staleBeforeRefresh.status, 'validate should be non-zero after mutating sample-app/src/user.ts').not.toBe(0)

        const refresh = agent(
          '../sample-app/src/user.ts changed: the User interface gained a `handle: string` field and createUser now takes a handle argument. Run carto status to see which node is stale, update the affected docs/<id>/<locale>.mdx to describe the new handle field (mention the handle field explicitly), then run carto sync so the source hashes update, then carto validate and carto build. After editing any mdx you MUST run carto sync again. Do not stop until carto validate exits 0 and carto build succeeds.',
          docRoot,
          sessionDir,
          true
        )
        expect(refresh.status, `agent refresh crashed: ${refresh.stderr}`).toBe(0)

        const validate2 = carto(['validate'], docRoot)
        expect(validate2.status, `validate not green after refresh:\n${validate2.stdout}\n${validate2.stderr}`).toBe(0)

        const build2 = carto(['build'], docRoot)
        expect(build2.status, `build failed after refresh:\n${build2.stdout}\n${build2.stderr}`).toBe(0)

        const html2 = readAll(join(docRoot, 'dist-site'), '.html')
        expect(html2).toContain('handle')
        expect(html2).toContain('authorId')
        expect(html2).toContain('buildFeed')
        expect(/href=["']carto:/i.test(html2), 'unresolved carto: link href in built HTML after refresh').toBe(false)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    PHASE_TIMEOUT
  )
})
