import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const cartoBin = join(repoRoot, 'node_modules', '.bin', 'carto')
const binDir = join(repoRoot, 'node_modules', '.bin')
const skillPath = join(repoRoot, 'skill', 'SKILL.md')
const fixtureSrc = join(repoRoot, 'tests', 'e2e', 'fixtures', 'blog', 'src')
const mutation = join(repoRoot, 'tests', 'e2e', 'fixtures', 'blog', 'mutations', 'user-with-handle.ts')

const runE2E = !!process.env.CARTO_E2E
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
      const sessionDir = join(root, '.session')
      try {
        cpSync(fixtureSrc, join(root, 'src'), { recursive: true })

        const init = carto(['init', '--locales', 'en,zh'], root)
        expect(init.status, `init failed: ${init.stderr}`).toBe(0)

        const generate = agent(
          'Document the TypeScript code under ./src with carto. The doc root is the current directory and already has carto.json (locales en, zh) and docs/. Read src/user.ts, src/post.ts, src/feed.ts, design a carto node tree, write docs/<id>/<locale>.mdx for every node and every locale, register each node\'s sources in carto.json, and link related nodes with carto: links. Every .mdx file must begin with a YAML frontmatter block containing a `title:` field. Run carto sync and carto validate, then run carto build, fixing issues until both carto validate and carto build succeed. Do not stop until carto build succeeds.',
          root,
          sessionDir,
          false
        )
        expect(generate.status, `agent generate crashed: ${generate.stderr}`).toBe(0)

        const validate1 = carto(['validate'], root)
        expect(validate1.status, `validate not green after generate:\n${validate1.stdout}\n${validate1.stderr}`).toBe(0)

        const manifest1 = JSON.parse(readFileSync(join(root, 'carto.json'), 'utf8'))
        expect(manifest1.nodes.length).toBeGreaterThanOrEqual(3)

        const mdx1 = readAll(join(root, 'docs'), '.mdx')
        expect(mdx1).toMatch(/\]\(carto:/)

        const build1 = carto(['build'], root)
        expect(build1.status, `build failed after generate:\n${build1.stdout}\n${build1.stderr}`).toBe(0)

        const html1 = readAll(join(root, 'dist-site'), '.html')
        expect(html1).toContain('authorId')
        expect(html1).toContain('buildFeed')
        expect(/href=["']carto:/i.test(html1), 'unresolved carto: link href in built HTML after generate').toBe(false)

        cpSync(mutation, join(root, 'src', 'user.ts'))

        const staleBeforeRefresh = carto(['validate'], root)
        expect(staleBeforeRefresh.status, 'validate should be non-zero after mutating src/user.ts').not.toBe(0)

        const refresh = agent(
          'src/user.ts changed: the User interface gained a `handle: string` field and createUser now takes a handle argument. Run carto status to see which node is stale, update the affected docs/<id>/<locale>.mdx to describe the new handle field (mention the handle field explicitly), then run carto sync, carto validate, and carto build, fixing issues until all three succeed. Do not stop until carto build succeeds.',
          root,
          sessionDir,
          true
        )
        expect(refresh.status, `agent refresh crashed: ${refresh.stderr}`).toBe(0)

        const validate2 = carto(['validate'], root)
        expect(validate2.status, `validate not green after refresh:\n${validate2.stdout}\n${validate2.stderr}`).toBe(0)

        const build2 = carto(['build'], root)
        expect(build2.status, `build failed after refresh:\n${build2.stdout}\n${build2.stderr}`).toBe(0)

        const html2 = readAll(join(root, 'dist-site'), '.html')
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
