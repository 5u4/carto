# Plan 002: Implement `@carto/core` — schema, hashing, tree, resolver, status

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 442f9de..HEAD -- packages/core`
> This plan builds on plan 001, which created the `@carto/core` skeleton
> (`packages/core/package.json`, `tsconfig.json`, `tsconfig.build.json`,
> `src/index.ts`, `src/index.test.ts`). Confirm those exist and match the
> excerpts in "Current state" below. If `packages/core/src/schema.ts` (or any
> other feature file this plan creates) already exists, or the skeleton differs
> from the excerpts, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-monorepo-foundation.md
- **Category**: tech-debt (core library)
- **Planned at**: commit `442f9de`, 2026-07-08

## Why this matters

`@carto/core` is the shared brain of carto. It defines the `carto.json` schema
(once, with zod), computes the content hashes that drive staleness detection,
derives the node tree and page URLs, and resolves `carto:<id>` links. Both the
CLI (plan 003) and the Astro template (plan 004) import this package and
reimplement none of it — the schema, the URL algorithm, and the link resolver
must have exactly one definition or the CLI's `validate` and the site's build
will disagree. If this package is wrong, every downstream page renders a broken
link or a false stale signal. This plan delivers the package with full unit
tests so the contract is pinned before anything consumes it.

## Current state

Plan 001 created the `@carto/core` **skeleton** and nothing more. The relevant
files, exactly as they exist now:

- `packages/core/package.json` — declares only `typescript` + `vitest` dev deps
  and uses "types from source" exports:

  ```json
  {
    "name": "@carto/core",
    "version": "0.0.0",
    "type": "module",
    "private": true,
    "main": "./dist/index.js",
    "types": "./src/index.ts",
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
    "devDependencies": {
      "typescript": "^5.7.0",
      "vitest": "^2.1.8"
    }
  }
  ```

- `packages/core/tsconfig.json` — extends `../../tsconfig.base.json`, `outDir`
  `./dist`, `rootDir` `./src`, `include: ["src"]`. Used by `typecheck`
  (`tsc --noEmit`).
- `packages/core/tsconfig.build.json` — extends `./tsconfig.json`,
  `exclude: ["dist", "node_modules", "**/*.test.ts"]`. Used by `build`.
- `packages/core/src/index.ts` — `export const version = '0.0.0'`.
- `packages/core/src/index.test.ts` — the trivial smoke test asserting
  `version === '0.0.0'`.

The root `tsconfig.base.json` (plan 001) sets `target: ES2022`, `module: ESNext`,
`moduleResolution: Bundler`, `strict: true`, `declaration: true`. The root
`vitest.config.ts` includes `packages/**/*.test.ts` and aliases `@carto/core` →
`packages/core/src/index.ts`.

### Critical build/ESM convention (a sibling author verified this at runtime)

The packages emit real ESM via plain `tsc` with `"type": "module"`. Node's ESM
runtime requires **explicit `.js` extensions on every intra-package relative
import** in the emitted output. Because TypeScript does not rewrite import
specifiers, you MUST write the `.js` extension in the **source** `.ts` files:

```ts
import { manifestSchema } from './schema.js'
```

`moduleResolution: Bundler` accepts a `.js` specifier that resolves to a `.ts`
file, so `tsc --noEmit` stays green while the emitted `dist/*.js` runs under
Node. **Every relative import between files in `packages/core/src/` MUST carry
`.js`.** (Bare package specifiers like `import { z } from 'zod'` do not — only
your own relative imports.) A relative import without `.js` typechecks but fails
at runtime in the CLI (plan 003) — a silent trap; do not skip it.

### The frozen design this package implements (inline — the only source of truth)

**`carto.json` shape:**

```jsonc
{
  "version": 1,
  "locales": ["en", "zh"],
  "defaultLocale": "en",
  "updated_at": "2026-07-08T00:00:00Z",
  "nodes": [
    {
      "id": "payments",
      "slug": "billing",
      "parent": "api",
      "sources": [
        { "file": "packages/api/src/payment.ts", "hash": "e3b0c44298fc1c14" }
      ]
    }
  ]
}
```

(The `jsonc` fence is illustrative. Do NOT put comments in any `.ts` file — the
repo forbids code comments and a gate enforces it; see conventions.)

**Field rules:**
- `version`: literal `1`.
- `locales`: non-empty array of **unique** strings.
- `defaultLocale`: MUST be an element of `locales`.
- `updated_at`: ISO 8601 string.
- `nodes[].id`: required; matches `^[a-z0-9][a-z0-9-]*$`; **unique across all nodes**.
- `nodes[].slug`: optional; same pattern; uniqueness among siblings is a
  tree-level check (Step 5), not a per-field zod rule.
- `nodes[].parent`: optional; when present it is the `id` of another node **or**
  an id that does not (yet) exist — a **dangling parent is a WARNING, not an
  error** (supports generating a subtree before its ancestors exist). A parent
  chain that forms a **cycle** (including self-parent) is an ERROR.
- `nodes[].sources`: array (may be empty); each `{ file, hash? }`. `file` is a
  path **relative to the directory containing carto.json**. `hash` is filled by
  sync; before first sync an entry has `file` only (no `hash`) — the **unsynced**
  state.

**Content hash:** sha256 of the file's raw bytes, hex, **first 16 chars**.

**Staleness classes** (per node, aggregated from its sources):
- `unsynced` — a source lacks a `hash`.
- `stale` — a source file's current hash ≠ its stored `hash`.
- `missing` — a source `file` does not exist on disk.
- `fresh` — all sources present and hashes match (zero-source node is fresh).
- Aggregation priority: `missing` > `stale` > `unsynced` > `fresh` (report worst).

**URL algorithm** (`urlPath`): URL of a node for a `locale` =
- a **locale prefix**: `''` when `locale === defaultLocale`, else `/<locale>`; then
- the **slug chain** root→node, each segment `node.slug ?? node.id`, `/`-joined
  and wrapped with `/`, trailing slash.

Example: node `payments` (slug `billing`), parent `api` (slug `backend`),
`defaultLocale = en`. locale `en` → `/backend/billing/`; locale `zh` →
`/zh/backend/billing/`.

**`carto:` link syntax** (the target string of a Markdown link):
```
carto:<id>              internal ref by node id
carto:<id>#<anchor>     internal ref + in-page heading anchor
carto:<alias>/<id>      RESERVED v2 federation ('/' = external boundary)
```
`<id>`/`<alias>` match `^[a-z0-9][a-z0-9-]*$`. Because id forbids `.` and `/`,
separators are unambiguous: `#` = anchor, `/` = federation boundary.
- Internal link whose `id` has no node → `unknown-id` error.
- Federation `/` form → `federation-unsupported` error in MVP (reserved so v2
  stays backward-compatible).
- Empty-label filling (`[](carto:<id>)` → target title) is the **caller's** job
  (the template reads the title from mdx frontmatter); the resolver only returns
  the URL and the target id.

### Repo conventions (inlined from AGENTS.md — the executor has not read it)

- **Zero comments in code.** No `//`, `///`, `//!`, `/* */`, no `TODO`/`NOTE`,
  no banners. Carry intent in names, types, structure. Only allowed comment is an
  `SPDX-License-Identifier` header (not needed here). `pnpm lint`
  (`scripts/lint-comments.sh`, plan 001) fails the diff on any comment.
- **Match the skeleton style**: single quotes, no semicolons — see
  `packages/core/src/index.test.ts` as the test-structure exemplar (explicit
  `describe`/`it`/`expect` imports from `vitest`).
- **English** for all identifiers, strings, test names.
- **Simplicity / no speculative abstraction**: implement exactly the API below.
  No plugin systems, no config knobs, no extra "for later" exports.

## Commands you will need

| Purpose   | Command                                   | Expected on success            |
|-----------|-------------------------------------------|--------------------------------|
| Install   | `pnpm install`                            | exit 0                         |
| Add zod   | `pnpm --filter @carto/core add zod`       | exit 0; `zod` in core deps     |
| Typecheck | `pnpm typecheck`                          | exit 0, no errors              |
| Tests     | `pnpm test`                               | all pass (incl. new core tests)|
| Core only | `pnpm test -- packages/core`              | core tests pass                |
| Build     | `pnpm build`                              | exit 0                         |
| Lint      | `pnpm lint`                               | exit 0 (comment gate)          |

## Suggested executor toolkit

- zod v3 docs for `z.object`, `z.literal`, `z.array(...).min(1)`, `.regex`,
  `.superRefine`, and `safeParse` — you use `superRefine` for cross-field checks
  (defaultLocale membership, id/locale uniqueness).
- Node built-ins only for IO: `node:crypto` (`createHash`), `node:fs/promises`
  (`readFile`, `writeFile`, `access`), `node:path` (`join`). No runtime dep
  besides `zod`.

## Scope

**In scope** (create unless noted):
- `packages/core/package.json` (modify — add the `zod` dependency only)
- `packages/core/src/schema.ts` (create)
- `packages/core/src/hash.ts` (create)
- `packages/core/src/manifest.ts` (create)
- `packages/core/src/tree.ts` (create)
- `packages/core/src/resolver.ts` (create)
- `packages/core/src/status.ts` (create)
- `packages/core/src/index.ts` (modify — re-export the public API)
- Test files beside each source: `schema.test.ts`, `hash.test.ts`,
  `manifest.test.ts`, `tree.test.ts`, `resolver.test.ts`, `status.test.ts`
- `packages/core/src/index.test.ts` (keep the plan-001 smoke test, or update it
  if you drop the `version` export)

**Out of scope** (do NOT touch):
- `packages/cli/**`, `packages/template/**` — plans 003, 004.
- Root configs, `scripts/`, `.gitignore` — plan 001. (Adding `zod` via
  `pnpm --filter @carto/core add` edits only `packages/core/package.json` + the
  lockfile — expected and in scope.)
- Any `docs/` scanning or mdx parsing — "each node has an mdx per locale" and "do
  mdx links resolve" are done by the CLI (003) and template (004) using the pure
  functions this package exports. Keep core free of `docs/` IO.
- `plans/README.md` beyond your own status row.

## Git workflow

- Branch: `advisor/002-core-package`.
- Commit per module; Conventional Commits, imperative, lowercase, no trailing
  period — e.g. `feat(core): add carto.json zod schema`,
  `feat(core): add carto link resolver`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

Order: `schema.ts` first (no internal deps); `hash.ts`; then `manifest.ts`
(schema+hash), `tree.ts` (schema), `resolver.ts` (schema+tree), `status.ts`
(schema+hash); then `index.ts`. Write each module, then its test, then run
`pnpm test -- packages/core` before moving on.

### Step 1: Add the `zod` dependency

```
pnpm --filter @carto/core add zod
```

**Verify**: `grep -q '"zod"' packages/core/package.json && echo ok` → `ok`;
`pnpm install` exits 0.

### Step 2: `schema.ts` — the zod schema and inferred types

Create `packages/core/src/schema.ts`. Target shape (comment-free):

```ts
import { z } from 'zod'

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export const sourceSchema = z.object({
  file: z.string().min(1),
  hash: z.string().min(1).optional()
})

export const nodeSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  slug: z.string().regex(ID_PATTERN).optional(),
  parent: z.string().regex(ID_PATTERN).optional(),
  sources: z.array(sourceSchema).default([])
})

export const manifestSchema = z
  .object({
    version: z.literal(1),
    locales: z.array(z.string().min(1)).min(1),
    defaultLocale: z.string().min(1),
    updated_at: z.string().min(1),
    nodes: z.array(nodeSchema)
  })
  .superRefine((manifest, ctx) => {
    const seenLocales = new Set<string>()
    for (const locale of manifest.locales) {
      if (seenLocales.has(locale)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locales'], message: `duplicate locale ${locale}` })
      }
      seenLocales.add(locale)
    }
    if (!manifest.locales.includes(manifest.defaultLocale)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultLocale'], message: 'defaultLocale must be a member of locales' })
    }
    const seenIds = new Set<string>()
    manifest.nodes.forEach((node, index) => {
      if (seenIds.has(node.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'id'], message: `duplicate node id ${node.id}` })
      }
      seenIds.add(node.id)
    })
  })

export type Source = z.infer<typeof sourceSchema>
export type Node = z.infer<typeof nodeSchema>
export type Manifest = z.infer<typeof manifestSchema>
```

Sibling-slug uniqueness and parent cycles/dangling are **tree** checks (Step 5),
not zod rules, because they read better as graph traversals and the CLI reports
them with distinct severities. `id` uniqueness lives here (a flat array invariant).

**Verify**: `pnpm typecheck` exits 0.

### Step 3: `hash.ts` — content hashing

Create `packages/core/src/hash.ts`:

```ts
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export function hashContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

export async function hashFile(path: string): Promise<string> {
  return hashContent(await readFile(path))
}
```

**Verify**: `pnpm typecheck` exits 0.

### Step 4: `manifest.ts` — parse, serialize, read, write, sync

Create `packages/core/src/manifest.ts`. Deterministic serialization (fixed key
order + 2-space indent + trailing newline) keeps `carto.json` diffs clean.
`syncManifest` recomputes hashes and refreshes `updated_at`; it THROWS on a
missing source file (sync must not write a hash for a file that is gone).

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { manifestSchema, type Manifest, type Node, type Source } from './schema.js'
import { hashFile } from './hash.js'

export class ManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestError'
  }
}

export function parseManifest(raw: unknown): Manifest {
  const result = manifestSchema.safeParse(raw)
  if (!result.success) {
    throw new ManifestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  return result.data
}

export function serializeManifest(manifest: Manifest): string {
  const ordered = {
    version: manifest.version,
    locales: manifest.locales,
    defaultLocale: manifest.defaultLocale,
    updated_at: manifest.updated_at,
    nodes: manifest.nodes.map((node) => orderNode(node))
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}

function orderNode(node: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { id: node.id }
  if (node.slug !== undefined) out.slug = node.slug
  if (node.parent !== undefined) out.parent = node.parent
  out.sources = node.sources.map((source) => orderSource(source))
  return out
}

function orderSource(source: Source): Record<string, unknown> {
  return source.hash === undefined ? { file: source.file } : { file: source.file, hash: source.hash }
}

export async function readManifest(path: string): Promise<Manifest> {
  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ManifestError(`${path} is not valid JSON`)
  }
  return parseManifest(json)
}

export async function writeManifest(path: string, manifest: Manifest): Promise<void> {
  await writeFile(path, serializeManifest(manifest), 'utf8')
}

export interface SyncOptions {
  rootDir: string
  now?: () => string
}

export async function syncManifest(manifest: Manifest, options: SyncOptions): Promise<Manifest> {
  const missing: string[] = []
  const nodes: Node[] = []
  for (const node of manifest.nodes) {
    const sources: Source[] = []
    for (const source of node.sources) {
      try {
        sources.push({ file: source.file, hash: await hashFile(join(options.rootDir, source.file)) })
      } catch {
        missing.push(source.file)
        sources.push({ file: source.file, hash: source.hash })
      }
    }
    nodes.push({ ...node, sources })
  }
  if (missing.length > 0) {
    throw new ManifestError(`cannot sync: missing source files: ${missing.join(', ')}`)
  }
  const now = options.now ? options.now() : new Date().toISOString()
  return { ...manifest, updated_at: now, nodes }
}
```

**Verify**: `pnpm typecheck` exits 0.

### Step 5: `tree.ts` — derivation and integrity checks

Create `packages/core/src/tree.ts`. Derives children (array-order preserved), the
root→node chain, the display slug, the URL, and the tree integrity issues
(sibling-slug duplicates, parent cycles = error; dangling parent = warning).

```ts
import type { Manifest, Node } from './schema.js'

export function nodesById(nodes: Node[]): Map<string, Node> {
  const map = new Map<string, Node>()
  for (const node of nodes) map.set(node.id, node)
  return map
}

export function slugOf(node: Node): string {
  return node.slug ?? node.id
}

export function childrenOf(nodes: Node[], parentId: string | null): Node[] {
  return nodes.filter((node) => (node.parent ?? null) === parentId)
}

export function rootChain(nodes: Node[], id: string): Node[] {
  const byId = nodesById(nodes)
  const chain: Node[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return chain
}

export function urlPath(manifest: Manifest, id: string, locale: string): string {
  const prefix = locale === manifest.defaultLocale ? '' : `/${locale}`
  const segments = rootChain(manifest.nodes, id).map((node) => slugOf(node))
  return `${prefix}/${segments.join('/')}/`
}

export type TreeIssue =
  | { severity: 'error'; kind: 'duplicate-sibling-slug'; parent: string | null; slug: string; ids: string[] }
  | { severity: 'error'; kind: 'parent-cycle'; ids: string[] }
  | { severity: 'warning'; kind: 'dangling-parent'; id: string; parent: string }

export function checkTree(nodes: Node[]): TreeIssue[] {
  const issues: TreeIssue[] = []
  const byId = nodesById(nodes)

  const bySibling = new Map<string, Map<string, string[]>>()
  for (const node of nodes) {
    const parentKey = node.parent ?? '\u0000root'
    const slugMap = bySibling.get(parentKey) ?? new Map<string, string[]>()
    const slug = slugOf(node)
    slugMap.set(slug, [...(slugMap.get(slug) ?? []), node.id])
    bySibling.set(parentKey, slugMap)
  }
  for (const [parentKey, slugMap] of bySibling) {
    const parent = parentKey === '\u0000root' ? null : parentKey
    for (const [slug, ids] of slugMap) {
      if (ids.length > 1) issues.push({ severity: 'error', kind: 'duplicate-sibling-slug', parent, slug, ids })
    }
  }

  for (const node of nodes) {
    if (node.parent !== undefined && !byId.has(node.parent)) {
      issues.push({ severity: 'warning', kind: 'dangling-parent', id: node.id, parent: node.parent })
    }
  }

  const cycleKeys = new Set<string>()
  for (const start of nodes) {
    const seen = new Set<string>()
    let current: Node | undefined = start
    while (current && current.parent !== undefined && byId.has(current.parent)) {
      if (seen.has(current.id)) {
        const key = [...seen].sort().join(',')
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key)
          issues.push({ severity: 'error', kind: 'parent-cycle', ids: [...seen] })
        }
        break
      }
      seen.add(current.id)
      current = byId.get(current.parent)
    }
  }

  return issues
}
```

**Verify**: `pnpm typecheck` exits 0.

### Step 6: `resolver.ts` — parse and resolve `carto:` links

Create `packages/core/src/resolver.ts`:

```ts
import type { Manifest } from './schema.js'
import { ID_PATTERN } from './schema.js'
import { nodesById, urlPath } from './tree.js'

export type ParsedLink =
  | { kind: 'internal'; id: string; anchor?: string }
  | { kind: 'federation'; alias: string; id: string; anchor?: string }

export function parseCartoLink(target: string): ParsedLink | null {
  if (!target.startsWith('carto:')) return null
  const body = target.slice('carto:'.length)
  const [path, anchor] = splitAnchor(body)
  const slash = path.indexOf('/')
  if (slash >= 0) {
    return { kind: 'federation', alias: path.slice(0, slash), id: path.slice(slash + 1), anchor }
  }
  return { kind: 'internal', id: path, anchor }
}

function splitAnchor(body: string): [string, string | undefined] {
  const hash = body.indexOf('#')
  if (hash < 0) return [body, undefined]
  return [body.slice(0, hash), body.slice(hash + 1)]
}

export type ResolveError =
  | { kind: 'not-a-carto-link' }
  | { kind: 'malformed'; target: string }
  | { kind: 'federation-unsupported'; alias: string }
  | { kind: 'unknown-id'; id: string }

export interface ResolveContext {
  manifest: Manifest
  locale: string
}

export type ResolveResult =
  | { ok: true; url: string; id: string }
  | { ok: false; error: ResolveError }

export function resolveCartoLink(target: string, ctx: ResolveContext): ResolveResult {
  const parsed = parseCartoLink(target)
  if (!parsed) return { ok: false, error: { kind: 'not-a-carto-link' } }
  if (parsed.kind === 'federation') {
    return { ok: false, error: { kind: 'federation-unsupported', alias: parsed.alias } }
  }
  if (!ID_PATTERN.test(parsed.id)) return { ok: false, error: { kind: 'malformed', target } }
  const node = nodesById(ctx.manifest.nodes).get(parsed.id)
  if (!node) return { ok: false, error: { kind: 'unknown-id', id: parsed.id } }
  const base = urlPath(ctx.manifest, parsed.id, ctx.locale)
  return { ok: true, url: parsed.anchor ? `${base}#${parsed.anchor}` : base, id: parsed.id }
}
```

**Verify**: `pnpm typecheck` exits 0.

### Step 7: `status.ts` — classify node freshness

Create `packages/core/src/status.ts`:

```ts
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { Manifest, Node } from './schema.js'
import { hashFile } from './hash.js'

export type FreshnessState = 'fresh' | 'unsynced' | 'stale' | 'missing'

export interface SourceStatus {
  file: string
  state: FreshnessState
  stored?: string
  actual?: string
}

export interface NodeStatus {
  id: string
  state: FreshnessState
  sources: SourceStatus[]
}

const PRIORITY: Record<FreshnessState, number> = { fresh: 0, unsynced: 1, stale: 2, missing: 3 }

export async function classifyNode(node: Node, rootDir: string): Promise<NodeStatus> {
  const sources: SourceStatus[] = []
  for (const source of node.sources) {
    sources.push(await classifySource(source.file, source.hash, rootDir))
  }
  const state = sources.reduce<FreshnessState>((worst, s) => (PRIORITY[s.state] > PRIORITY[worst] ? s.state : worst), 'fresh')
  return { id: node.id, state, sources }
}

async function classifySource(file: string, stored: string | undefined, rootDir: string): Promise<SourceStatus> {
  const absolute = join(rootDir, file)
  try {
    await access(absolute)
  } catch {
    return { file, state: 'missing', stored }
  }
  if (stored === undefined) return { file, state: 'unsynced' }
  const actual = await hashFile(absolute)
  return actual === stored ? { file, state: 'fresh', stored, actual } : { file, state: 'stale', stored, actual }
}

export async function statusReport(manifest: Manifest, rootDir: string): Promise<NodeStatus[]> {
  const report: NodeStatus[] = []
  for (const node of manifest.nodes) report.push(await classifyNode(node, rootDir))
  return report
}
```

**Verify**: `pnpm typecheck` exits 0.

### Step 8: `index.ts` — public API surface

Rewrite `packages/core/src/index.ts` (keep the `.js` extensions):

```ts
export * from './schema.js'
export * from './hash.js'
export * from './manifest.js'
export * from './tree.js'
export * from './resolver.js'
export * from './status.js'
```

If you keep the plan-001 `version` placeholder, leave its line; otherwise remove
it and update/delete `index.test.ts` so `pnpm test` stays green.

**Verify**: `pnpm typecheck` exits 0; `pnpm build` exits 0;
`grep -q "from './schema.js'" packages/core/dist/index.js && echo ok` → `ok`.

## Test plan

One `*.test.ts` beside each module (model after plan-001's `index.test.ts`:
`import { describe, expect, it } from 'vitest'`). Enumerated cases (each MUST exist):

- **`schema.test.ts`** — `manifestSchema.safeParse`:
  - accepts a minimal valid manifest (one node, one locale = defaultLocale).
  - rejects `id` `Payments` (uppercase); rejects `id` `a.b` and `a/b`.
  - rejects `defaultLocale: 'de'` when `locales: ['en','zh']`.
  - rejects duplicate locales `['en','en']`.
  - rejects two nodes with the same `id`.
  - accepts a node with empty `sources`, and a source with `file` but no `hash`.
- **`hash.test.ts`**:
  - `hashContent(new TextEncoder().encode('hello'))` is 16 lowercase hex chars and
    equals `2cf24dba5fb0a30e` (first 16 of sha256('hello')).
  - `hashFile` on a temp file equals `hashContent` of its bytes; mutating the file
    changes the hash.
- **`manifest.test.ts`** (temp dir):
  - `parseManifest` round-trips a valid object; throws `ManifestError` on bad input.
  - `serializeManifest`: fixed key order (`version`→`locales`→`defaultLocale`→
    `updated_at`→`nodes`; per node `id` first; omits absent `slug`/`parent`; omits
    `hash` when absent) and ends with exactly one `\n`.
  - `readManifest`/`writeManifest` round-trip yields an equal manifest.
  - `syncManifest` fills every hash and sets `updated_at` from an injected `now`;
    is idempotent; throws `ManifestError` naming the file when a source is missing.
- **`tree.test.ts`**:
  - `childrenOf` returns siblings in array order; root children = no-parent nodes.
  - `rootChain` for a 3-level tree → `[root, mid, leaf]`.
  - `urlPath` defaultLocale (with slug overrides) → `/backend/billing/`;
    non-default → `/zh/backend/billing/`.
  - `checkTree`: duplicate sibling slug → one `duplicate-sibling-slug` error;
    absent parent → one `dangling-parent` **warning**; a 2-node mutual cycle →
    exactly one `parent-cycle` error; a valid tree → `[]`.
- **`resolver.test.ts`**:
  - `parseCartoLink('carto:payments')` → internal, no anchor;
    `'carto:payments#refunds'` → anchor `refunds`; `'carto:web/auth'` → federation
    alias `web` id `auth`; `'/foo'` → null.
  - `resolveCartoLink('carto:payments', ctx)` → `ok:true`, url = node's `urlPath`
    for ctx locale; anchor form ends `#refunds`.
  - `'carto:ghost'` → `unknown-id`; `'carto:web/auth'` → `federation-unsupported`.
- **`status.test.ts`** (temp dir + real files):
  - source with no stored hash → `unsynced`.
  - stored hash matches file → `fresh`; after mutating file → `stale`.
  - deleted file → `missing`; node mixing `fresh` + `missing` aggregates to
    `missing`.
  - zero-source node → `fresh`.

**Verification**: `pnpm test -- packages/core` → all pass; `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` exits 0; the six new `*.test.ts` files under
      `packages/core/src/` exist and pass, covering the listed cases.
- [ ] `pnpm build` exits 0 and emitted sibling imports carry `.js`:
      `grep -q "from './schema.js'" packages/core/dist/index.js && echo ok` → `ok`.
- [ ] `pnpm lint` exits 0 (zero code comments in any created file).
- [ ] `grep -q '"zod"' packages/core/package.json && echo ok` → `ok`; no other new
      runtime dependency added.
- [ ] Public API is exported: after `pnpm build`, from the repo root
      `node -e "import('@carto/core').then(m => { for (const n of ['manifestSchema','hashFile','urlPath','resolveCartoLink','statusReport','syncManifest','checkTree']) if (!(n in m)) { console.error('missing', n); process.exit(1) } console.log('ok') })"`
      prints `ok`.
- [ ] `git status` shows only `packages/core/**` and the lockfile modified.
- [ ] `plans/README.md` status row updated (unless a dispatcher owns the index).

## STOP conditions

Stop and report back (do not improvise) if:

- The `@carto/core` skeleton at HEAD does not match the "Current state" excerpts.
- A schema rule in "The frozen design" is ambiguous for a case your test needs and
  this plan does not resolve it — report the gap; do not invent a new rule.
- Making the emitted ESM run seems to require changing `tsconfig.base.json`/root
  config (out of scope) rather than adding `.js` to source imports — report it.
- `zod`'s API differs from the snippets such that the schema cannot express these
  invariants — report before working around it.
- A test can only pass by weakening an assertion to something trivial (asserting a
  function is defined instead of its result) — report; the implementation is wrong.

## Maintenance notes

- This package is the single definition of the schema, the URL algorithm, and the
  link resolver. The CLI (`validate`/`sync`/`status`) and the template (remark
  link plugin, sidebar/route derivation) import it — **never** reimplement any of
  this logic there. A change to `urlPath` or `parseCartoLink` changes both the
  site's URLs and `validate`'s link checking at once, by design.
- If v2 federation lands, `resolveCartoLink`'s `federation-unsupported` branch
  becomes a real lookup through a `refs` table; the parser already returns a
  `federation` variant, so the syntax is forward-compatible.
- `checkTree` severities (dangling-parent = warning, else error) are the contract
  the CLI's `validate` exit code depends on — a reviewer should confirm `validate`
  treats only `severity: 'error'` as failing.
- Keep `serializeManifest`'s key order stable; changing it churns every
  `carto.json` diff in every consumer repo.
