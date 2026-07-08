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
| `carto validate` | Validate schema, id/slug uniqueness, parent cycles, and link resolution; exits non-zero on any error |
| `carto dev` | Preview the site for the current doc root |
| `carto build` | Build the static site for the current doc root |

## Build the static site

```sh
pnpm exec carto build
```

Renders the production site into `./dist-site/` (gitignored). Preview the
built output with:

```sh
pnpm --filter @carto/template exec astro preview
```

## Project layout / where to look next

- `packages/core` — schema, hashing, node tree, `carto:` link resolver
- `packages/cli` — the `carto` binary (`packages/cli/src/commands/`)
- `packages/template` — the bundled Astro + Starlight site
- `skill/SKILL.md` — the doc-authoring guide for generating carto pages
- `docs/` + `carto.json` — carto's own self-documentation (dogfooded)
- `plans/` — implementation plans for this repo
- `pnpm e2e` — end-to-end smoke test that carto can document its own repo
