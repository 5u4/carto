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

## Customize the site

Drop a `carto.config.mjs` at your doc root (next to `carto.json`) to override
Starlight's options. It must default-export an object with a `starlight` key,
whose value is any [Starlight configuration](https://starlight.astro.build/reference/configuration/):

```js
import starlightThemeRapide from 'starlight-theme-rapide'

/** @type {{ starlight?: import('@astrojs/starlight/types').StarlightUserConfig }} */
export default {
  starlight: {
    title: 'My Docs',
    plugins: [starlightThemeRapide()],
    customCss: ['./src/custom.css'],
  },
}
```

The `@type` JSDoc annotation gives you full editor autocomplete and type
checking for the `starlight` options — it resolves to Starlight's own
`StarlightUserConfig`. `carto init` scaffolds a `carto.config.mjs` with this
annotation already in place.

Your options are merged into carto's Starlight config. carto keeps ownership of
`sidebar` and `locales` — both are derived from `carto.json` and always win, so
setting them here has no effect. Everything else (title, `customCss`, `plugins`,
`logo`, `social`, component overrides, …) is yours.

To use a community theme or any plugin — or to get the `@type` autocomplete —
your doc root must be an npm project so the package resolves: run `pnpm init`
there and `pnpm add @astrojs/starlight` (plus any theme, e.g.
`starlight-theme-rapide`). The build itself works without this; only editor
tooling needs it. Only `.mjs`/`.js` config files are supported.

## Testing

Two layers, split by what they defend:

- `pnpm test` — the fast unit suite (vitest). Deterministic, no network.
- `pnpm test:pipeline` — a deterministic system test
  (`tests/pipeline/carto-pipeline.test.ts`). It copies hand-written fixture
  doc-sets into a temp root and drives the real `carto` CLI through the full
  loop: sync → validate → build, then mutates a source file to assert staleness
  detection (status red → sync → green), then federates a second doc-set. Each
  phase asserts `carto build` renders, known source symbols reach the built
  HTML, every `carto:` link resolves, and the federated pages mount under their
  alias-hash and `/self` prefixes. No LLM, no secrets — runs in CI.

Skill quality (does an agent *follow* `skills/carto` and
`skills/documenting-component`) is measured separately with
[waza](https://github.com/microsoft/waza) under `evals/`. Those evals call a
real model, so they are a **local-only** tool — never wired into CI. Run them
by hand after changing a SKILL.md:

```sh
pnpm build            # the carto bin must exist (see Setup)
waza run evals/carto/eval.yaml --context-dir evals/carto/fixtures
waza run evals/documenting-component/eval.yaml --context-dir evals/documenting-component/fixtures
```

waza uses its bundled GitHub Copilot CLI; authenticate once with
`copilot login` (machine-level, no token file).

## Project layout / where to look next

- `packages/core` — schema, hashing, node tree, `carto:` link resolver
- `packages/cli` — the `carto` binary (`packages/cli/src/commands/`)
- `packages/template` — the bundled Astro + Starlight site
- `skills/carto/SKILL.md` — carto's doc-authoring skill (CLI, manifest, links, node-tree mapping)
- `docs/` + `carto.json` — carto's own self-documentation (dogfooded)
- `plans/` — implementation plans for this repo
- `tests/pipeline/` — the deterministic system test and its fixture doc-sets
- `evals/` — waza skill evals (local-only, real model)
