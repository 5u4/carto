# Plan 004: Implement `@carto/template` — the bundled Astro 5 + Starlight site

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. **Step 2 is a routing spike with a hard decision
> gate — do not build the rest until it passes.** When done, update the status
> row for this plan in `plans/README.md` — unless a reviewer dispatched you and
> told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 442f9de..HEAD -- packages/template packages/core`
> This plan builds on plan 001 (the `@carto/template` skeleton) and plan 002
> (`@carto/core`). Confirm both landed and that `@carto/core` exports
> `readManifest`, `urlPath`, `slugOf`, `rootChain`, `childrenOf`, `resolveCartoLink`,
> `parseCartoLink`. If not, that is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (routing — Starlight hardcodes its content directory)
- **Depends on**: plans/001-monorepo-foundation.md, plans/002-core-package.md
- **Category**: dx
- **Planned at**: commit `442f9de`, 2026-07-08

## Why this matters

The template turns a doc root (`carto.json` + `docs/<id>/<locale>.mdx`) into a
browsable multi-language site. Two hard requirements make this the riskiest plan:
(1) mdx files are stored by **immutable node id** (`docs/<id>/<locale>.mdx`) so
refactors move no files, but each page's **URL** must come from the carto.json
**slug chain**, not the file path; (2) `carto:<id>` links in prose must resolve to
those URLs, locale-aware, using the **same** `@carto/core` resolver the CLI's
`validate` uses — so the site and `validate` never disagree. Starlight does not
natively support "id-based files, slug-based URLs", so this plan bridges the gap
with a materialization step. If routing is wrong, every link 404s.

## Current state

Plan 001 created the `@carto/template` **skeleton** (no Astro yet):

- `packages/template/package.json`:

  ```json
  {
    "name": "@carto/template",
    "version": "0.0.0",
    "type": "module",
    "private": true,
    "main": "./dist/index.js",
    "types": "./src/index.ts",
    "exports": { ".": { "types": "./src/index.ts", "import": "./dist/index.js" } },
    "scripts": {
      "build": "tsc -p tsconfig.build.json",
      "typecheck": "tsc --noEmit"
    },
    "devDependencies": { "typescript": "^5.7.0" }
  }
  ```

- `packages/template/tsconfig.json` (extends base, `outDir dist`, `rootDir src`,
  `include: ["src"]`), `tsconfig.build.json` (excludes tests), and
  `src/index.ts` = `export const version = '0.0.0'`.

### Verified constraint (a sibling author read Starlight's source)

Starlight **hardcodes `src/content/docs`** as its content collection base and
derives a page's **language from its directory** (the collection folder structure
is fixed; Starlight's own `utils/collection.ts` notes it relies on this for
git-dates and remark language detection). **You cannot point Starlight at
`$CARTO_ROOT/docs` and you cannot make it read id-based file paths.** Do not try
to eject or patch Starlight internals.

### The chosen approach: materialize, then let Starlight route natively

Instead of fighting Starlight, **feed it the layout it wants**. A prebuild
**materialization** step reads the doc root and writes the pages into the
template's own `src/content/docs/` in Starlight's expected shape:

- **defaultLocale** page → `src/content/docs/<slug-chain>.mdx`
- **other locale** page → `src/content/docs/<locale>/<slug-chain>.mdx`

where `<slug-chain>` is the `/`-joined `slugOf(node)` from root to the node (the
same chain `@carto/core.urlPath` uses, **without** the locale prefix — Starlight
adds the locale prefix from the directory).

**Why this works:** Starlight's directory-based i18n serves the root collection at
`/` (the default locale) and a `<locale>/` subdirectory at `/<locale>/`. So the
file `src/content/docs/backend/billing.mdx` serves at `/backend/billing/`, and
`src/content/docs/zh/backend/billing.mdx` serves at `/zh/backend/billing/`. That
is **exactly** what `urlPath(node, locale)` computes. By materializing into the
slug-chain layout, Starlight's native routing produces carto's URLs with no
custom routing — and `resolveCartoLink` (which also calls `urlPath`) produces
matching link targets. The two agree by construction.

During materialization, each mdx has its `carto:` links rewritten to resolved
URLs (empty labels filled with the target node's title), so no `carto:` string
reaches Starlight.

### The frozen contracts you depend on (inline)

**mdx layout in the doc root:** `docs/<id>/<locale>.mdx`; every mdx has YAML
frontmatter with a `title`.

**`@carto/core` API you consume** (from plan 002 — do NOT reimplement):
```ts
readManifest(path: string): Promise<Manifest>
urlPath(manifest: Manifest, id: string, locale: string): string
slugOf(node: Node): string
rootChain(nodes: Node[], id: string): Node[]
childrenOf(nodes: Node[], parentId: string | null): Node[]
resolveCartoLink(target: string, ctx: { manifest: Manifest; locale: string }): ResolveResult
```
`Manifest` = `{ version:1; locales:string[]; defaultLocale:string; updated_at:string; nodes:Node[] }`,
`Node` = `{ id; slug?; parent?; sources:{file;hash?}[] }`. `urlPath` returns e.g.
`/backend/billing/` (default) or `/zh/backend/billing/` (non-default), always
with a trailing slash.

**`CARTO_ROOT`:** the CLI (plan 003) launches the template with the environment
variable `CARTO_ROOT` set to the doc root (the dir containing `carto.json`). The
template reads the manifest and docs from there.

**Cross-plan contract with the CLI (plan 003):** the template exposes these
package scripts — `dev` (Astro dev server) and `build:site` (Astro static build);
both run materialization first. `carto dev` invokes `pnpm run dev`; `carto build`
invokes `pnpm run build:site`. The plain `build` script stays `tsc` (so the
monorepo's `pnpm -r build` compiles the TS without needing a doc root).

### Repo conventions (from AGENTS.md)

- **Zero comments in code** (no `//`, `/* */`, TODO/NOTE). `pnpm lint`
  (`scripts/lint-comments.sh`) enforces it — including inside `.mjs` and `.ts`.
  Astro config and the materialize script must be comment-free.
- **Match style**: single quotes, no semicolons. **English** everywhere.
- **Simplicity**: materialize + native routing. No custom Astro routes, no
  Starlight ejection, no extra config knobs.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Add deps | `pnpm --filter @carto/template add astro @astrojs/starlight @carto/core` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Monorepo build | `pnpm build` | exit 0 (template `build` = `tsc`) |
| Materialize+build a fixture | `CARTO_ROOT=<fixture> pnpm --filter @carto/template run build:site` | exit 0; site under the template's `dist/` |
| Lint | `pnpm lint` | exit 0 |

## Suggested executor toolkit

- Astro 5 config docs (`defineConfig`, integrations) and **Starlight** docs:
  the `starlight({ title, locales, sidebar })` integration, directory-based i18n
  (`locales: { root: { label, lang }, <locale>: { label, lang } }`), and the
  `sidebar` schema (`{ label, link }` and nested `{ label, items }`). **Confirm
  the installed Starlight version's sidebar/i18n schema against its docs before
  Step 5** — the shapes below target current Starlight; adapt field names if the
  installed version differs (a STOP condition if it cannot express the tree).
- Node built-ins: `node:fs/promises`, `node:path`, `node:process`.

## Scope

**In scope** (create unless noted):
- `packages/template/package.json` (modify — add deps + `dev`/`build:site`/`preview` scripts)
- `packages/template/astro.config.mjs` (create)
- `packages/template/src/content.config.ts` (create — Starlight content collection)
- `packages/template/src/materialize.ts` (create — the doc-root → `src/content/docs` step + link rewrite)
- `packages/template/src/site-config.ts` (create — pure helpers: build Starlight `locales` and `sidebar` from a `Manifest`; unit-tested)
- `packages/template/src/index.ts` (modify — export the pure helpers for testing)
- `packages/template/src/site-config.test.ts` (create)
- `packages/template/tests/fixtures/mini/` (create — a tiny doc root fixture: `carto.json` + `docs/**`)
- `packages/template/scripts/check-build.sh` (create — materialize+build the fixture and assert output paths/links)
- `packages/template/tsconfig.json` (modify only if Astro types require it — see Step 1)

**Out of scope** (do NOT touch):
- `packages/core/**` (plan 002 — the resolver/urlPath live there; never
  reimplement URL logic here), `packages/cli/**` (plan 003).
- Root configs, `scripts/lint-comments.sh`, `.gitignore` (plan 001). `.gitignore`
  already ignores `.astro/` and `dist/`/`dist-site/`.
- `plans/README.md` beyond your own status row.

## Git workflow

- Branch: `advisor/004-astro-template`.
- Commit per logical unit (deps+config, materialize, site-config helpers, tests);
  Conventional Commits — e.g. `feat(template): materialize doc root into starlight`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add Astro + Starlight, wire package scripts

```
pnpm --filter @carto/template add astro @astrojs/starlight @carto/core
```

Set `packages/template/package.json` scripts to:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "dev": "node ./dist/materialize.js && astro dev",
    "build:site": "node ./dist/materialize.js && astro build",
    "preview": "astro preview"
  }
}
```

`build` stays `tsc` so the monorepo `pnpm -r build` compiles `materialize.ts` →
`dist/materialize.js` (and the helpers) **without** needing a doc root. `dev` and
`build:site` run the compiled materialize step, then Astro. Ensure `astro` and
`@astrojs/starlight` are `dependencies` (the CLI spawns them) and `@carto/core`
is `workspace:*`.

If Astro's types require `tsconfig` changes to typecheck `astro.config.mjs`
(they usually do not for a `.mjs` config), prefer leaving `tsconfig.json` alone;
`astro.config.mjs` is JS and not part of `tsc --noEmit` over `src`.

**Verify**: `grep -q '"@astrojs/starlight"' packages/template/package.json && echo ok`
→ `ok`; `pnpm install` exits 0.

### Step 2: Routing spike — PROVE native routing yields carto URLs (decision gate)

Before writing the materialize logic, prove the routing assumption by hand with a
throwaway Starlight scaffold, so a wrong assumption fails here, cheaply.

1. Temporarily create, by hand, in the template package:
   - `src/content/docs/index.mdx` (frontmatter `title: Home`)
   - `src/content/docs/backend/billing.mdx` (frontmatter `title: Billing`)
   - `src/content/docs/zh/backend/billing.mdx` (frontmatter `title: 账单`)
2. Write a minimal `astro.config.mjs` (Step 4 shape, but with `locales` hardcoded
   to `{ root: { label: 'English', lang: 'en' }, zh: { label: '中文', lang: 'zh' } }`
   and an empty/simple `sidebar`) and `src/content.config.ts` (Step 3).
3. Run `pnpm --filter @carto/template exec astro build`.
4. Inspect the output. With `outDir: join(root, 'dist-site')` and no `CARTO_ROOT`
   set, `root` is the template package dir, so the site is under
   `packages/template/dist-site/`. Assert these files exist:
   - `packages/template/dist-site/backend/billing/index.html` (serves `/backend/billing/`)
   - `packages/template/dist-site/zh/backend/billing/index.html` (serves `/zh/backend/billing/`)

**Decision gate:**
- If both HTML files appear at those paths → the approach holds. **Delete the
  hand-made `src/content/docs/**` scaffold** (materialize will generate it) and
  proceed to Step 3.
- If Starlight produces different paths (e.g. requires an `index` per locale, or
  won't build `zh/` without extra config) → adjust the locale/config to Starlight's
  actual directory-i18n contract and re-run **once**. If you cannot get
  `/backend/billing/` and `/zh/backend/billing/` from directory layout without
  ejecting Starlight → **STOP and report** the exact Starlight behavior observed.
  Do not invent a custom-routing workaround without reporting first.

**Verify**: the two expected `index.html` paths exist after `astro build`.

### Step 3: `src/content.config.ts` — the Starlight docs collection

Define the content collection Starlight expects (Astro 5 content layer). Target
shape (confirm against the installed Starlight's `docsSchema`/`docsLoader`):

```ts
import { defineCollection } from 'astro:content'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() })
}
```

**Verify**: referenced in Step 2's spike build without a schema error.

### Step 4: `astro.config.mjs` — Starlight, driven by the manifest

Read `CARTO_ROOT`/`carto.json` at config-eval time and build Starlight `locales`
+ `sidebar` from the manifest via the pure helpers (Step 5). Comment-free:

```js
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { join } from 'node:path'
import { readManifest } from '@carto/core'
import { buildLocales, buildSidebar } from './dist/site-config.js'

const root = process.env.CARTO_ROOT ?? process.cwd()
const manifest = await readManifest(join(root, 'carto.json'))

export default defineConfig({
  outDir: join(root, 'dist-site'),
  integrations: [
    starlight({
      title: 'Carto',
      locales: buildLocales(manifest),
      sidebar: buildSidebar(manifest)
    })
  ]
})
```
`astro.config.mjs` imports the **compiled** helpers from `./dist/site-config.js`
(built by `tsc`); this is why `build:site`/`dev` run after `pnpm build`. If you
prefer importing the helpers from source, use an Astro/Vite-compatible path — but
the compiled import is the safe default given `type: module`.

`outDir` is set to `$CARTO_ROOT/dist-site` on purpose, for two reasons: (1) the
site lands in the **doc root** where the user expects it (and `dist-site/` is
already gitignored — plan 006 relies on this exact path); (2) it keeps Astro's
output out of `packages/template/dist/`, which holds the `tsc`-compiled
`materialize.js`/`site-config.js` — Astro wipes its `outDir` on each build, so
pointing it at the package `dist/` would delete the compiled helpers mid-build.
the compiled import is the safe default given `type: module`.

**Verify**: `pnpm typecheck` exits 0 (helpers typecheck); config is comment-free.

### Step 5: `src/site-config.ts` — pure manifest → Starlight config

Pure, synchronous, unit-testable. No IO. Uses `@carto/core` derivation only.

```ts
import { childrenOf, slugOf, urlPath, type Manifest, type Node } from '@carto/core'

export function buildLocales(manifest: Manifest): Record<string, { label: string; lang: string }> {
  const locales: Record<string, { label: string; lang: string }> = {}
  for (const locale of manifest.locales) {
    const key = locale === manifest.defaultLocale ? 'root' : locale
    locales[key] = { label: locale, lang: locale }
  }
  return locales
}

export interface SidebarEntry {
  label: string
  link?: string
  items?: SidebarEntry[]
}

export function buildSidebar(manifest: Manifest): SidebarEntry[] {
  return childrenOf(manifest.nodes, null).map((node) => entryFor(manifest, node))
}

function entryFor(manifest: Manifest, node: Node): SidebarEntry {
  const self: SidebarEntry = { label: slugOf(node), link: urlPath(manifest, node.id, manifest.defaultLocale) }
  const kids = childrenOf(manifest.nodes, node.id)
  if (kids.length === 0) return self
  return { label: slugOf(node), items: [self, ...kids.map((kid) => entryFor(manifest, kid))] }
}
```

Notes: labels use `slugOf(node)` as a stable, always-present string. Localized,
title-based sidebar labels (reading each node's per-locale mdx `title`) is a
**deferrable enhancement** — see Step 8; do not block routing on it. `link` uses
the defaultLocale URL; Starlight localizes the link per active locale via its
routing.

**Verify**: `pnpm typecheck` exits 0.

### Step 6: `src/materialize.ts` — doc root → `src/content/docs` + link rewrite

The prebuild step. Reads `CARTO_ROOT`, wipes and regenerates the template's
`src/content/docs/`, and rewrites `carto:` links. Comment-free target shape:

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readManifest, resolveCartoLink, rootChain, slugOf, type Manifest, type Node } from '@carto/core'

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = join(here, '..', 'src', 'content', 'docs')

async function main(): Promise<void> {
  const root = process.env.CARTO_ROOT ?? process.cwd()
  const manifest = await readManifest(join(root, 'carto.json'))
  await rm(contentDir, { recursive: true, force: true })
  await mkdir(contentDir, { recursive: true })
  const titles = await collectTitles(root, manifest)
  for (const node of manifest.nodes) {
    for (const locale of manifest.locales) {
      const source = join(root, 'docs', node.id, `${locale}.mdx`)
      const raw = await readFile(source, 'utf8')
      const rewritten = rewriteLinks(raw, manifest, locale, titles)
      const target = targetPath(manifest, node, locale)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, rewritten, 'utf8')
    }
  }
}

function targetPath(manifest: Manifest, node: Node, locale: string): string {
  const chain = rootChain(manifest.nodes, node.id).map((n) => slugOf(n)).join('/')
  const prefix = locale === manifest.defaultLocale ? '' : `${locale}/`
  return join(contentDir, `${prefix}${chain}.mdx`)
}

function rewriteLinks(mdx: string, manifest: Manifest, locale: string, titles: Map<string, string>): string {
  return mdx.replace(/(\[)([^\]]*)(\]\()(carto:[^)\s]+)(\))/g, (whole, open, label, mid, target, close) => {
    const result = resolveCartoLink(target, { manifest, locale })
    if (!result.ok) return whole
    const text = label.length > 0 ? label : (titles.get(`${result.id}:${locale}`) ?? result.id)
    return `${open}${text}${mid}${result.url}${close}`
  })
}

await main()
```

`collectTitles(root, manifest)` reads each `docs/<id>/<locale>.mdx`, extracts the
frontmatter `title` (a small YAML-frontmatter read — match the leading
`---\n...\n---` block and pull the `title:` line; do not add a YAML dep), and
returns a `Map` keyed `"<id>:<locale>"`. Keep it comment-free.

An unresolved `carto:` link is left as-is here (materialize does not fail the
build on it) because **`carto validate` (plan 003) is the gate that rejects broken
links** before build. If you prefer defense-in-depth, materialize MAY throw on an
`ok:false` result — but then Step 7's fixture must be link-clean. Choose one and
be consistent; the default (leave as-is, rely on validate) is simplest.

**Verify**: `pnpm build` compiles it to `dist/materialize.js`
(`test -f packages/template/dist/materialize.js && echo ok` → `ok`).

### Step 7: Fixture + end-to-end build check

Create `packages/template/tests/fixtures/mini/`:
- `carto.json` — 3 nodes, 2 locales, a slug override, a nested chain, and links:
  - `overview` (root), `api` (parent `overview`, `slug: backend`),
    `payments` (parent `api`, `slug: billing`).
  - locales `["en","zh"]`, defaultLocale `en`.
  - `sources` can be `[]` for the build check (build does not check staleness); the
    tree and links are what matter.
- `docs/overview/en.mdx` with a link `[](carto:payments)` (empty label → title)
  and `[the api](carto:api)`; `docs/overview/zh.mdx` with the same links verbatim.
- `docs/api/{en,zh}.mdx`, `docs/payments/{en,zh}.mdx`, each with a `title`.

Create `packages/template/scripts/check-build.sh` (POSIX sh, comment-free) that:
1. runs `node ./dist/materialize.js` with `CARTO_ROOT` = the fixture,
2. runs `astro build`,
3. asserts the output contains `$CARTO_ROOT/dist-site/backend/billing/index.html`
   and `$CARTO_ROOT/dist-site/zh/backend/billing/index.html` (the fixture is the
   `CARTO_ROOT`, so its `dist-site/` holds the built site),
4. greps the generated `overview` page HTML to confirm no literal `carto:` string
   remains and that a resolved `/backend/billing/` href is present,
5. exits non-zero if any assertion fails.

**Verify**: from the repo root after `pnpm build`,
`CARTO_ROOT=packages/template/tests/fixtures/mini bash packages/template/scripts/check-build.sh`
→ exit 0. (Adjust asserted slug-chain paths to match the fixture's slugs.)

### Step 8 (deferrable): localized sidebar labels + backlinks

These improve the site but MUST NOT jeopardize Steps 2–7. Attempt only after the
build check is green; if either risks the build, leave it out and record it in
Maintenance notes as a follow-up (do NOT open a new plan — it lives here).

- **Localized sidebar labels:** replace `slugOf(node)` labels with per-locale
  titles using Starlight's sidebar `label`/`translations` — requires passing the
  title map into `buildSidebar`. Keep the pure helper testable.
- **Backlinks footer:** derive "referenced by" from inbound `carto:` links (scan
  all mdx, invert the link graph) and render via a Starlight component override.
  Highest-effort piece; defer if the override API fights you.

## Test plan

- **Unit — `src/site-config.test.ts`** (vitest, model after
  `packages/core/src/*.test.ts`):
  - `buildLocales`: defaultLocale maps to key `root`; other locales map to their
    own key; each has `{ label, lang }`.
  - `buildSidebar`: a tree of `overview` (root), `api` (root, slug `backend`) and
    `payments` (parent `api`, slug `billing`) — note `overview` and `api` are both
    **top-level roots** (omit `parent`), only `payments` nests under `api`, so the
    leaf URL is `/backend/billing/` (making `api` a child of `overview` would give
    `/overview/backend/billing/` and contradict the Done-criteria path). The nested
    structure's leaf `link`s equal `urlPath(manifest, id, defaultLocale)` (e.g.
    `/backend/billing/`), and the top level has exactly the root nodes in array order.
- **Build smoke — `scripts/check-build.sh`** (Step 7): materialize + `astro build`
  the fixture, assert output HTML paths and resolved links. The real end-to-end
  proof that routing works.

**Verification**: `pnpm test -- packages/template` → unit tests pass;
`bash packages/template/scripts/check-build.sh` (with `CARTO_ROOT`) → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm build` exits 0 and `packages/template/dist/materialize.js` +
      `dist/site-config.js` exist.
- [ ] `pnpm test -- packages/template` passes (the `site-config` unit tests exist
      and assert `link === urlPath(...)`).
- [ ] The fixture builds: `CARTO_ROOT=packages/template/tests/fixtures/mini bash packages/template/scripts/check-build.sh`
      exits 0, and the built site exists at
      `packages/template/tests/fixtures/mini/dist-site/backend/billing/index.html`
      and `.../dist-site/zh/backend/billing/index.html`.
- [ ] No literal `carto:` target survives into built HTML for the fixture
      (the check-build script greps for it and finds none).
- [ ] `pnpm lint` exits 0 (astro.config.mjs, materialize.ts, site-config.ts,
      check-build.sh all comment-free).
- [ ] URL logic is not reimplemented here: `site-config.ts` builds `link` only by
      calling `urlPath` (a reviewer confirms no hand-composed URL string).
- [ ] `git status` shows only `packages/template/**` and the lockfile modified.
- [ ] `plans/README.md` status row updated (unless a dispatcher owns the index).

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 2 fails:** Starlight will not serve `/backend/billing/` and
  `/zh/backend/billing/` from directory layout without ejecting. Report the exact
  observed paths/behavior — this invalidates the materialization approach and
  needs a design decision.
- The installed Starlight version's `locales`/`sidebar`/content-collection schema
  differs so much that `buildLocales`/`buildSidebar`/`content.config.ts` cannot
  express the tree — report the version and the schema mismatch.
- `@carto/core` does not export `urlPath`/`resolveCartoLink`/`rootChain`/`slugOf`/
  `childrenOf` (plan 002 incomplete) — do not reimplement URL/resolution logic.
- Making the site build seems to require reimplementing the URL algorithm in the
  template (rather than calling `urlPath`) — that is a design violation; report it.
- Astro/Starlight pulls in a peer-dependency or Node-version requirement the
  monorepo cannot satisfy — report rather than upgrading root config.

## Maintenance notes

- **The URL algorithm has exactly one home: `@carto/core.urlPath`.** The template
  materializes into slug-chain file paths so Starlight's native routing *reproduces*
  those URLs, and rewrites links via `resolveCartoLink` (which calls `urlPath`).
  Never hand-compose a URL in the template — a divergence here silently breaks
  every link relative to what `carto validate` accepts.
- Materialization wipes and regenerates `src/content/docs/` each run; never edit
  files there by hand (they are build output). The source of truth is
  `$CARTO_ROOT/docs/<id>/<locale>.mdx`.
- `dev` does not re-materialize on `carto.json`/docs changes mid-session (MVP);
  re-run `carto dev` to pick up structural changes. A file watcher is a future
  enhancement.
- Cross-plan contract: the CLI (plan 003) calls `pnpm run dev` and
  `pnpm run build:site`, with `CARTO_ROOT` set. If you rename those scripts, update
  the CLI's `runTemplateScript`.
- Deferred here (not separate plans): localized sidebar labels and the backlinks
  footer (Step 8). Revisit once routing is stable.
- Starlight/Astro major upgrades are the main regression risk — the directory-i18n
  and content-collection contracts this plan leans on can change. The
  `check-build.sh` smoke test is the canary; keep it in CI (plan 006 wires e2e).
