# carto

carto generates *sustainably-evolving* documentation for a codebase: a
top-down mental-model map (not an API reference) whose pages carry
machine-checkable anchors back to source, so stale pages are detectable and
regenerable rather than silently rotting. It's a TypeScript pnpm monorepo of
three packages: `@carto/core` (schema, content hashing, node tree, link
resolver), `@carto/cli` (the `carto` binary), and `@carto/template` (the
bundled Astro + Starlight site).

## Prerequisites

- Node >= 20
- pnpm — this repo pins `pnpm@10.13.1` via `packageManager` in `package.json`

## Setup

Run these three commands, in order, from the repo root:

```sh
pnpm install    # installs deps; the carto bin is NOT linked yet (dist/ absent)
pnpm build      # compiles core, cli, and template -> creates packages/cli/dist
pnpm install    # re-run: links the carto bin now that its build target exists
```

The second `pnpm install` is not optional. pnpm links a workspace package's
`bin` entry into `node_modules/.bin` **at install time**. The `carto` bin
target is `packages/cli/dist/index.js`, which doesn't exist on a fresh clone
until after `pnpm build` runs — so the first install silently skips the link
(a benign warning), and it does not retry after a later build. If you stop
after `pnpm install && pnpm build`, `pnpm exec carto` fails with:

```
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "carto" not found
```

Running `pnpm install` a second time (now that `dist/index.js` exists) links
the bin. Confirm it worked with `pnpm exec carto --help`.

## Preview the docs

From the repo root:

```sh
pnpm exec carto dev
```

This starts the Astro dev server. Open **http://localhost:4321/overview/**.

Notes:
- The default locale (`en`) is unprefixed; `zh` lives under `/zh/overview/`.
- Bare `/` (and `/en/`) 404 — there's no index route, only the node slugs.
- All `carto` commands read `carto.json` from the current directory, so they
  must be run from the doc root — here, the repo root.

## CLI commands

| Command | Description |
|---|---|
| `carto init` | Scaffold a starter `carto.json` and `docs/` in the current directory |
| `carto status` | Report each node's freshness; exits non-zero if any node is stale, 0 if all are fresh |
| `carto sync` | Recompute and write every source hash; refreshes `updated_at` |
| `carto coverage` | List files under the doc root that no node's `sources` tracks; respects `.gitignore` + `.cartoignore`; exits 0 by default, or non-zero with `--fail-on-uncovered` |
| `carto validate` | Validate schema, id/slug uniqueness, parent cycles, and link resolution; exits non-zero on any error |
| `carto dev` | Preview the site for the current doc root |
| `carto build` | Build the static site for the current doc root |

## Build the static site

```sh
pnpm exec carto build
```

Renders the production site into `./dist-site/` (gitignored). Preview the
built output — from the repo root, with `CARTO_ROOT` pointing at the doc root so
Astro serves `$CARTO_ROOT/dist-site` (not the template package's own dir):

```sh
CARTO_ROOT="$PWD" pnpm --filter @carto/template exec astro preview
```

## Testing

- `pnpm test` — the fast unit suite (vitest). Deterministic, no network.
- `pnpm e2e` — deterministic pipeline smoke test (`scripts/e2e.sh`): drives the
  `carto` binary through sync → status → validate → build and asserts staleness
  detection. No LLM.
- `pnpm test:e2e` — the **real agent** end-to-end test
  (`tests/e2e/agent.e2e.test.ts`). It spins up a temp doc root, then runs a live
  agent (`omp`, headless) that reads a tiny `user`/`post`/`feed` codebase and
  drives the full carto authoring loop: generate all pages from zero, then
  refresh after a source file changes. Each phase asserts `carto validate` is
  green, `carto build` renders, known source symbols reach the built HTML, and
  every `carto:` link resolves.

This test is **ignored by default** — it costs money and takes minutes. It is
skipped unless `CARTO_E2E` is set, which is loaded from a git-ignored
`.env.e2e`. To run it:

```sh
cp .env.example .env.e2e   # then set CARTO_E2E=1 and E2E_MODEL
pnpm build                 # the carto bin must exist (see Setup)
pnpm test:e2e
```

`.env.example` is the tracked template; `.env.e2e` is your local, ignored copy.
`E2E_MODEL` picks the agent model (default `claude-haiku-4.5` — the fixture is
deliberately simple so a small, cheap model can document it).

## Project layout / where to look next

- `packages/core` — schema, hashing, node tree, `carto:` link resolver
- `packages/cli` — the `carto` binary (`packages/cli/src/commands/`)
- `packages/template` — the bundled Astro + Starlight site
- `skill/SKILL.md` — the doc-authoring guide for generating carto pages
- `docs/` + `carto.json` — carto's own self-documentation (dogfooded)
- `plans/` — implementation plans for this repo
- `pnpm e2e` — end-to-end smoke test that carto can document its own repo
