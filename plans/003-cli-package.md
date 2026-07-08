# Plan 003: Implement the `carto` CLI (`@carto/cli`) with citty

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 442f9de..HEAD -- packages/cli packages/core`
> This plan builds on plan 001 (the `@carto/cli` skeleton) and plan 002 (the
> `@carto/core` library it consumes). Confirm both landed and match the excerpts
> in "Current state". If `@carto/core` does not export `readManifest`,
> `writeManifest`, `syncManifest`, `statusReport`, `checkTree`, `resolveCartoLink`,
> or `ManifestError`, that is a STOP condition — do not reimplement them here.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-monorepo-foundation.md, plans/002-core-package.md
- **Category**: dx
- **Planned at**: commit `442f9de`, 2026-07-08

## Why this matters

The `carto` CLI is the deterministic half of the workflow: the LLM writes prose
and edits `carto.json` by hand, and the CLI does the two things an LLM cannot do
reliably — compute content hashes (`sync`) and validate structure and links
(`validate`) — plus scaffold (`init`) and preview/build the site (`dev`/`build`).
Without it, there is no way to fill hashes or catch a broken `carto:` link before
it ships. This plan delivers exactly six commands, each a thin wrapper over
`@carto/core`, so the CLI holds no schema or resolution logic of its own.

## Current state

Plan 001 created the `@carto/cli` **skeleton**; plan 002 delivered `@carto/core`.
The relevant files as they exist now:

- `packages/cli/package.json` — declares the `carto` bin and a `workspace:*`
  dependency on `@carto/core`:

  ```json
  {
    "name": "@carto/cli",
    "version": "0.0.0",
    "type": "module",
    "private": true,
    "bin": {
      "carto": "./dist/index.js"
    },
    "main": "./dist/index.js",
    "exports": {
      ".": {
        "types": "./src/index.ts",
        "import": "./dist/index.js"
      }
    },
    "scripts": {
      "build": "tsc -p tsconfig.build.json",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@carto/core": "workspace:*"
    },
    "devDependencies": {
      "typescript": "^5.7.0"
    }
  }
  ```

- `packages/cli/tsconfig.json` — extends `../../tsconfig.base.json`, `outDir`
  `./dist`, `rootDir` `./src`, `include: ["src"]`.
- `packages/cli/tsconfig.build.json` — extends `./tsconfig.json`,
  `exclude: ["dist", "node_modules", "**/*.test.ts"]`.
- `packages/cli/src/index.ts` — currently
  `import { version } from '@carto/core'` then `export const cliVersion = version`.
  You replace this with the citty entry point.

### The `@carto/core` API you consume (from plan 002 — do NOT reimplement)

```ts
import type { Manifest, Node, NodeStatus, FreshnessState, TreeIssue } from '@carto/core'

readManifest(path: string): Promise<Manifest>
writeManifest(path: string, manifest: Manifest): Promise<void>
parseManifest(raw: unknown): Manifest
serializeManifest(manifest: Manifest): string
syncManifest(manifest: Manifest, options: { rootDir: string; now?: () => string }): Promise<Manifest>
statusReport(manifest: Manifest, rootDir: string): Promise<NodeStatus[]>
checkTree(nodes: Node[]): TreeIssue[]
resolveCartoLink(target: string, ctx: { manifest: Manifest; locale: string }): ResolveResult
parseCartoLink(target: string): ParsedLink | null
class ManifestError extends Error
```

- `NodeStatus` = `{ id: string; state: FreshnessState; sources: SourceStatus[] }`,
  `FreshnessState` = `'fresh' | 'unsynced' | 'stale' | 'missing'`.
- `TreeIssue` carries `severity: 'error' | 'warning'` and a `kind`
  (`duplicate-sibling-slug` | `parent-cycle` = error; `dangling-parent` = warning).
- `ResolveResult` = `{ ok: true; url; id } | { ok: false; error }`; the error
  `kind` is one of `not-a-carto-link` | `malformed` | `federation-unsupported` |
  `unknown-id`.

### The frozen CLI contract (inline — the only source of truth)

**Binary:** `carto`, built with **citty**. **Exactly six commands. No
fine-grained mutation commands** (no `add-node`, `set-parent`, …). The LLM edits
`carto.json` directly; `sync` + `validate` are the guardrails.

| Command | Kind | Behavior | Exit |
|---|---|---|---|
| `carto init` | scaffold | Create a starter `carto.json` (`version:1`, `locales`/`defaultLocale` from flags or defaults, empty `nodes: []`, `updated_at` = now) and a `docs/` dir in cwd. **Refuse if `carto.json` already exists.** | non-zero if `carto.json` exists |
| `carto status` | read-only | Print each node's freshness via `statusReport`. | **non-zero if any node is not fresh**, 0 if all fresh (or no nodes) |
| `carto sync` | write | Read manifest, `syncManifest` (fill hashes + refresh `updated_at`), write it back. The only deterministic manifest write. | 0 on success; non-zero if a source file is missing |
| `carto validate` | read-only | Full check (below). | non-zero on any **error** (warnings do not fail) |
| `carto dev` | dev | Run the bundled `@carto/template` Astro dev server against the doc root via `CARTO_ROOT`. | passthrough of the child process |
| `carto build` | build | Run the bundled `@carto/template` Astro build against the doc root via `CARTO_ROOT`. | passthrough |

**`validate` performs, via `@carto/core`:**
1. Schema parse (`readManifest` / `parseManifest`) — any zod error → error.
2. `checkTree(nodes)` — emit its issues; `severity:'error'` fail the command,
   `severity:'warning'` (dangling parent) print but do not fail.
3. **unsynced check** — any node whose `statusReport` state is `unsynced` (a
   source lacks a hash) → error ("run carto sync"). `stale`/`missing` are also
   reported (stale/missing → error too, since validate asserts a coherent synced
   manifest; but the primary "you forgot to sync" signal is `unsynced`).
4. **mdx-per-locale** — for every node and every declared locale, assert
   `docs/<id>/<locale>.mdx` exists (relative to the doc root). Missing → error.
5. **link resolution** — scan every `docs/<id>/<locale>.mdx`, find Markdown link
   targets starting with `carto:`, and for each call `resolveCartoLink(target,
   { manifest, locale })`. Any `ok:false` → error (unknown id, malformed, or
   federation-unsupported). Federation `/` form is therefore an error in MVP.

**Doc root & paths:** every command operates on the **current working directory**
as the doc root (the directory containing `carto.json`). `source.file` and the
`docs/` tree are relative to it. `dev`/`build` pass this dir to the template as
the `CARTO_ROOT` environment variable.

**mdx layout:** `docs/<id>/<locale>.mdx` (one file per node per locale).

### Repo conventions (inlined from AGENTS.md)

- **Zero comments in code** (no `//`, `/* */`, TODO/NOTE). `pnpm lint`
  (`scripts/lint-comments.sh`) enforces it.
- **Match style**: single quotes, no semicolons; tests use explicit
  `describe`/`it`/`expect` from `vitest` (see `packages/core/src/*.test.ts`).
- **English** everywhere. **Simplicity**: six commands, thin wrappers, no extra
  flags beyond what is specified.

## Commands you will need

| Purpose   | Command                                        | Expected on success            |
|-----------|------------------------------------------------|--------------------------------|
| Install   | `pnpm install`                                 | exit 0                         |
| Add citty | `pnpm --filter @carto/cli add citty`           | exit 0; `citty` in cli deps    |
| Typecheck | `pnpm typecheck`                               | exit 0                         |
| Tests     | `pnpm test`                                    | all pass (incl. new cli tests) |
| CLI only  | `pnpm test -- packages/cli`                    | cli tests pass                 |
| Build     | `pnpm build`                                   | exit 0                         |
| Run CLI   | `pnpm --filter @carto/cli exec carto <cmd>`    | per command                    |
| Lint      | `pnpm lint`                                     | exit 0                         |

## Suggested executor toolkit

- citty docs: `defineCommand({ meta, args, run })`, `runMain`, subCommands. A
  citty command's `run({ args })` receives parsed args; subcommands are wired via
  the parent's `subCommands` map.
- Node built-ins for IO/spawn: `node:fs/promises` (`access`, `mkdir`, `writeFile`),
  `node:path`, `node:process` (`cwd`, `env`, `exit`), `node:child_process`
  (`spawn`) for `dev`/`build`.

## Scope

**In scope** (create unless noted):
- `packages/cli/package.json` (modify — add `citty` dependency)
- `packages/cli/src/index.ts` (rewrite — citty main + subcommand wiring)
- `packages/cli/src/commands/init.ts` (create)
- `packages/cli/src/commands/status.ts` (create)
- `packages/cli/src/commands/sync.ts` (create)
- `packages/cli/src/commands/validate.ts` (create)
- `packages/cli/src/commands/dev.ts` (create)
- `packages/cli/src/commands/build.ts` (create)
- `packages/cli/src/links.ts` (create — a small mdx `carto:` link scanner used by
  `validate`; regex over Markdown link syntax, no full mdx parser)
- Test files: `packages/cli/src/commands/{init,status,sync,validate}.test.ts`
  (create). `dev`/`build` spawn Astro and are covered by plan 006's e2e, not unit
  tested here.

**Out of scope** (do NOT touch):
- `packages/core/**` — plan 002. If a check needs logic not in core (e.g. a new
  tree rule), that logic belongs in core: STOP and report, do not add it here.
- `packages/template/**` — plan 004. `dev`/`build` only *spawn* the template; do
  not implement Astro here. If the template entry does not exist yet, `dev`/`build`
  must fail gracefully with a clear message (Step 7), not crash.
- Root configs, `scripts/`, `.gitignore` — plan 001.
- `plans/README.md` beyond your own status row.

## Git workflow

- Branch: `advisor/003-carto-cli`.
- Commit per command or logical unit; Conventional Commits — e.g.
  `feat(cli): add carto sync command`, `feat(cli): add carto validate command`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `citty` dependency

```
pnpm --filter @carto/cli add citty
```

**Verify**: `grep -q '"citty"' packages/cli/package.json && echo ok` → `ok`;
`pnpm install` exits 0.

### Step 2: `links.ts` — scan `carto:` link targets from mdx

Create `packages/cli/src/links.ts`. A minimal Markdown-link scanner is enough —
match `](carto:...)` targets; do not build a full mdx AST.

```ts
export function extractCartoTargets(mdx: string): string[] {
  const targets: string[] = []
  const pattern = /\]\((carto:[^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(mdx)) !== null) {
    targets.push(match[1])
  }
  return targets
}
```

**Verify**: `pnpm typecheck` exits 0.

### Step 3: `commands/init.ts`

```ts
import { defineCommand } from 'citty'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serializeManifest, type Manifest } from '@carto/core'

export const initCommand = defineCommand({
  meta: { name: 'init', description: 'Scaffold carto.json and docs/ in the current directory' },
  args: {
    locales: { type: 'string', description: 'Comma-separated locales', default: 'en' },
    defaultLocale: { type: 'string', description: 'Default locale', default: 'en' }
  },
  async run({ args }) {
    const root = process.cwd()
    const manifestPath = join(root, 'carto.json')
    if (await exists(manifestPath)) {
      console.error('carto.json already exists; refusing to overwrite')
      process.exit(1)
    }
    const locales = args.locales.split(',').map((l) => l.trim()).filter(Boolean)
    const manifest: Manifest = {
      version: 1,
      locales,
      defaultLocale: args.defaultLocale,
      updated_at: new Date().toISOString(),
      nodes: []
    }
    await mkdir(join(root, 'docs'), { recursive: true })
    await writeFile(manifestPath, serializeManifest(manifest), 'utf8')
    console.log(`initialized carto.json (locales: ${locales.join(', ')}) and docs/`)
  }
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
```

Note: if `defaultLocale` is not among `locales`, `serializeManifest` still writes
it, but the manifest would be invalid — keep `init` simple and let `validate`
catch it; do NOT add cross-validation here (it belongs to the schema/validate path).

**Verify**: `pnpm typecheck` exits 0.

### Step 4: `commands/sync.ts`

```ts
import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readManifest, syncManifest, writeManifest, ManifestError } from '@carto/core'

export const syncCommand = defineCommand({
  meta: { name: 'sync', description: 'Recompute and write every source hash' },
  async run() {
    const root = process.cwd()
    const path = join(root, 'carto.json')
    try {
      const manifest = await readManifest(path)
      const synced = await syncManifest(manifest, { rootDir: root })
      await writeManifest(path, synced)
      console.log(`synced ${synced.nodes.length} node(s)`)
    } catch (error) {
      console.error(error instanceof ManifestError ? error.message : String(error))
      process.exit(1)
    }
  }
})
```

**Verify**: `pnpm typecheck` exits 0.

### Step 5: `commands/status.ts`

```ts
import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readManifest, statusReport } from '@carto/core'

export const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Report each node\'s freshness' },
  async run() {
    const root = process.cwd()
    const manifest = await readManifest(join(root, 'carto.json'))
    const report = await statusReport(manifest, root)
    for (const node of report) {
      console.log(`${node.state.padEnd(9)} ${node.id}`)
    }
    const anyNotFresh = report.some((node) => node.state !== 'fresh')
    process.exit(anyNotFresh ? 1 : 0)
  }
})
```

**Verify**: `pnpm typecheck` exits 0.

### Step 6: `commands/validate.ts`

Compose the five checks over `@carto/core`. Errors fail (exit 1); warnings print
and do not fail. Read every mdx once for the link + existence checks.

```ts
import { defineCommand } from 'citty'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readManifest, checkTree, statusReport, resolveCartoLink, ManifestError, type Manifest } from '@carto/core'
import { extractCartoTargets } from '../links.js'

export const validateCommand = defineCommand({
  meta: { name: 'validate', description: 'Validate schema, tree, sync state, and links' },
  async run() {
    const root = process.cwd()
    let manifest: Manifest
    try {
      manifest = await readManifest(join(root, 'carto.json'))
    } catch (error) {
      fail(error instanceof ManifestError ? error.message : String(error))
      return
    }
    const errors: string[] = []
    const warnings: string[] = []

    for (const issue of checkTree(manifest.nodes)) {
      const line = formatTreeIssue(issue)
      ;(issue.severity === 'error' ? errors : warnings).push(line)
    }

    const report = await statusReport(manifest, root)
    for (const node of report) {
      if (node.state === 'unsynced') errors.push(`node ${node.id} is unsynced; run carto sync`)
      else if (node.state === 'stale') errors.push(`node ${node.id} is stale; run carto sync`)
      else if (node.state === 'missing') errors.push(`node ${node.id} has a missing source file`)
    }

    for (const node of manifest.nodes) {
      for (const locale of manifest.locales) {
        const mdx = join(root, 'docs', node.id, `${locale}.mdx`)
        if (!(await exists(mdx))) {
          errors.push(`missing doc: docs/${node.id}/${locale}.mdx`)
          continue
        }
        const text = await readFile(mdx, 'utf8')
        for (const target of extractCartoTargets(text)) {
          const result = resolveCartoLink(target, { manifest, locale })
          if (!result.ok) errors.push(`docs/${node.id}/${locale}.mdx: ${describeError(target, result.error)}`)
        }
      }
    }

    for (const warning of warnings) console.warn(`warning: ${warning}`)
    if (errors.length > 0) {
      for (const error of errors) console.error(`error: ${error}`)
      process.exit(1)
    }
    console.log('validate: ok')
  }
})
```

Implement the small helpers comment-free: `fail(msg)` prints `error: <msg>` and
`process.exit(1)`; `exists(path)` wraps `access`; `formatTreeIssue(issue)` renders
each `TreeIssue` kind to a one-line string; `describeError(target, error)` renders
a `ResolveError` (e.g. `unknown carto: link ${target}`, `federation link ${target}
is not supported (v2)`, `malformed carto: link ${target}`).

**Verify**: `pnpm typecheck` exits 0.

### Step 7: `commands/dev.ts` and `commands/build.ts`

Both spawn the bundled template's Astro command with `CARTO_ROOT` set to the doc
root. The template (plan 004) exposes `dev` and `build:site` package scripts.
Resolve the template package directory; if it is not resolvable/built yet, fail
with a clear message rather than crashing.

```ts
import { defineCommand } from 'citty'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

function templateDir(): string | null {
  try {
    const require = createRequire(import.meta.url)
    return dirname(require.resolve('@carto/template/package.json'))
  } catch {
    return null
  }
}

function runTemplateScript(command: 'dev' | 'build'): void {
  const dir = templateDir()
  if (!dir) {
    console.error('@carto/template is not available; run pnpm build first')
    process.exit(1)
  }
  const script = command === 'build' ? 'build:site' : 'dev'
  const child = spawn('pnpm', ['run', script], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, CARTO_ROOT: process.cwd() }
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}

export const devCommand = defineCommand({
  meta: { name: 'dev', description: 'Preview the site for the current doc root' },
  run() {
    runTemplateScript('dev')
  }
})

export const buildCommand = defineCommand({
  meta: { name: 'build', description: 'Build the static site for the current doc root' },
  run() {
    runTemplateScript('build')
  }
})
```

If plan 004's template exposes a different invocation than `pnpm run dev`/`build:site`
(confirm against `packages/template/package.json` once it exists), adjust the
`spawn` args to match — but keep `CARTO_ROOT = process.cwd()` as the contract. If
the template package does not exist at all yet, that is expected during parallel
development; the graceful-failure branch above covers it, and plan 006 exercises
the real path.

**Verify**: `pnpm typecheck` exits 0.

### Step 8: `index.ts` — citty main and subcommand wiring

Rewrite `packages/cli/src/index.ts` with a shebang so the built `dist/index.js`
runs as the `carto` bin:

```ts
#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { initCommand } from './commands/init.js'
import { statusCommand } from './commands/status.js'
import { syncCommand } from './commands/sync.js'
import { validateCommand } from './commands/validate.js'
import { devCommand } from './commands/dev.js'
import { buildCommand } from './commands/build.js'

const main = defineCommand({
  meta: { name: 'carto', description: 'Generate and maintain carto documentation' },
  subCommands: {
    init: initCommand,
    status: statusCommand,
    sync: syncCommand,
    validate: validateCommand,
    dev: devCommand,
    build: buildCommand
  }
})

runMain(main)
```

The shebang line is not a code comment (it is an interpreter directive) — the
comment gate's regex ignores `#!`; leave it as the first line.

**Verify**: `pnpm build` exits 0; the built bin runs:
`pnpm --filter @carto/cli exec carto --help` prints all six subcommands
(`init`, `status`, `sync`, `validate`, `dev`, `build`).

## Test plan

Unit tests use temp dirs and drive each command's exported `run` (or spawn the
built bin — prefer calling the command's `run` with a `cwd` set via
`process.chdir` inside a temp dir, restoring it after). Model structure after
`packages/core/src/*.test.ts`. Cases (each MUST exist):

- **`init.test.ts`**: in an empty temp dir, `init` creates a schema-valid
  `carto.json` (parse it with `parseManifest` — no throw) and a `docs/` dir;
  running `init` again exits non-zero and leaves the file unchanged.
- **`sync.test.ts`**: given a `carto.json` with one node whose source is a real
  temp file (no hash) → after `sync`, the manifest on disk has a 16-char hash for
  that source and a refreshed `updated_at`; running `sync` again is idempotent
  (same hash). A manifest whose source file is missing → `sync` exits non-zero and
  does not write a partial hash.
- **`status.test.ts`**: a synced manifest → `status` exits 0 and prints `fresh`;
  after mutating the tracked file → `status` exits non-zero and prints `stale`;
  an unsynced source → prints `unsynced`, exits non-zero.
- **`validate.test.ts`**: a good fixture (schema-valid, synced, mdx present for
  every locale, all `carto:` links resolve) → exit 0, prints `validate: ok`. Each
  of these fails with exit 1: an mdx containing `[x](carto:ghost)` (unknown id);
  two nodes with the same `id` (schema/tree); a node missing `docs/<id>/<locale>.mdx`
  for a declared locale; an mdx containing `[x](carto:web/auth)` (federation). A
  dangling parent alone → exit 0 with a printed warning (does not fail).

To exercise `run` deterministically, capture `process.exit` (e.g. stub it to throw
a sentinel your test catches, or run the command in a child process and assert the
exit code) — pick one approach and use it consistently; document it in the test
file's structure, not in comments.

**Verification**: `pnpm test -- packages/cli` → all pass; `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm build` exits 0; `pnpm --filter @carto/cli exec carto --help` lists all
      six subcommands.
- [ ] `pnpm test` exits 0; the four command test files exist under
      `packages/cli/src/commands/` and pass, covering the cases above.
- [ ] `pnpm lint` exits 0 (zero code comments; the `#!` shebang is allowed).
- [ ] `grep -q '"citty"' packages/cli/package.json && echo ok` → `ok`; no other
      new runtime dependency besides `citty` (and the existing `@carto/core`).
- [ ] The CLI reimplements no core logic: `grep -REn "createHash|sha256|z\\.object|z\\.literal" packages/cli/src`
      returns no matches (hashing/schema live only in `@carto/core`).
- [ ] `git status` shows only `packages/cli/**` and the lockfile modified.
- [ ] `plans/README.md` status row updated (unless a dispatcher owns the index).

## STOP conditions

Stop and report back (do not improvise) if:

- `@carto/core` does not export the functions listed in "The `@carto/core` API you
  consume" (plan 002 incomplete) — do not reimplement them here.
- A `validate` check would require a new tree/graph rule not provided by
  `checkTree`/`resolveCartoLink` — that logic belongs in `@carto/core`; report it.
- citty's API differs from the snippets (e.g. `defineCommand`/`runMain`/`subCommands`
  shape) such that the six-command wiring cannot be expressed — report before
  restructuring.
- Making a command testable seems to require changing `@carto/core` or root config —
  report; adjust the test approach instead.
- The template package (plan 004) exposes an invocation incompatible with
  `CARTO_ROOT` + `pnpm run dev`/`build` — report so the contract can be reconciled;
  do not hardcode Astro internals into the CLI.

## Maintenance notes

- The CLI is intentionally a thin shell over `@carto/core`. Any new validation
  rule or hashing change goes into core, not here — a reviewer should reject a PR
  that adds schema/hash/resolution logic to `packages/cli`.
- `validate`'s error/warning split mirrors `checkTree`'s `severity`: only
  `severity:'error'` (and unsynced/stale/missing, and unresolved links, and
  missing mdx) fail the exit code; `dangling-parent` warnings never do. If that
  policy changes, change it in one place in `validate.ts`.
- `dev`/`build` depend on plan 004's template invocation contract (`CARTO_ROOT` +
  the template's `dev`/`build` scripts). If the template changes how it is
  launched, update `runTemplateScript` only.
- The six-command surface is a hard product decision — do not add `add-node`,
  `rename`, or other mutation subcommands. The LLM edits `carto.json` directly.
