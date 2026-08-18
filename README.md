# carto

carto generates *sustainably-evolving* documentation for a codebase: a
developer-oriented code map (not an API reference) whose pages carry
machine-checkable anchors back to source, so stale pages are detectable and
regenerable rather than silently rotting. It's a TypeScript pnpm monorepo of
three packages: `@carto/core` (schema, content hashing, node tree, link
resolver), `@carto/cli` (the `carto` binary), and `@carto/template` (the
bundled Astro + Starlight site).

## Requirements

- Bash, Git, and curl
- Node >= 22.12.0
- Corepack or pnpm 10; the installer uses the repository-pinned pnpm version

## Install

Install the CLI and its manually invoked Carto coding-agent skill from source:

```sh
curl -fsSL https://raw.githubusercontent.com/5u4/carto/main/install.sh | bash
```

The installer clones carto to `~/.carto/repo`, builds it, links `carto` into
`~/.local/bin`, and links the `carto` skill into `~/.agents/skills`. The skill
keeps its documentation-authoring guidance in internal, on-demand references.
Re-run the same command to update. If the installer adds
`~/.local/bin` to your shell configuration, open a new shell before verifying:

```sh
carto --help
```

Carto is verified in CI on Linux. macOS is expected to work and is maintained
through regular use, but is not covered by CI. On Windows, use WSL; native
Windows installation is not currently supported.

## Start a doc set

From the root of the codebase you want to document:

```sh
carto init
```

Then ask your coding agent: `Use the carto skill to document <scope>.` The
agent reads the code, writes the page tree and prose, and uses the CLI to hash
and validate its work. The CLI does not call an LLM itself.

## CLI commands

| Command | Description |
|---|---|
| `carto init` | Scaffold `carto.json` and `.carto/docs/` in the current directory |
| `carto status` | Report each node's freshness; exit non-zero if any node is not fresh |
| `carto sync <node-id...>` | Record current source hashes for the named, reviewed documentation nodes |
| `carto coverage` | List source files no node tracks; use `--fail-on-uncovered` to make gaps fail |
| `carto validate` | Validate schema, tree, source state, locales, and logical links |
| `carto build` | Build the static site into `dist-site/` |
| `carto preview` | Serve an existing `dist-site/` locally without rebuilding it |

Every command reads `carto.json` from the current directory and stores authored
node bundles under `.carto/docs/`. Run commands from the doc root.

## Build and preview

```sh
carto build
carto preview
```

`build` publishes `dist-site/` only after a successful isolated build. A failed
build leaves the previous output intact. `preview` serves that built output on
`127.0.0.1`; use `--host` or `--port` to override the listening address.

Authored MDX keeps complete repository-relative `path:line` and
`path:start-end` citations beside the claims they support. The built site moves
those addresses into localized numbered source footnotes so the prose stays
readable while the canonical MDX remains useful to coding agents. This is a
rendering-only transformation; source addresses are not external links.

## Work on carto itself

From a source checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/index.js --help
```

The installed user command is managed by `install.sh`; contributors do not
need a pnpm global link.

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

To use a community theme or plugin, make the doc root an npm project and
install that dependency there, for example `pnpm init` followed by
`pnpm add starlight-theme-rapide`. Install `@astrojs/starlight` there as well
if you want the scaffolded `@type` annotation to resolve for editor
autocomplete. A plain generated config needs no doc-root dependencies. Only
`.mjs`/`.js` config files are supported.

## Testing

Two layers, split by what they defend:

- `pnpm test` — the fast unit suite (vitest). Deterministic, no network.
- `pnpm test:pipeline` — a deterministic system test
  (`tests/pipeline/carto-pipeline.test.ts`). It copies hand-written fixture
  doc-sets into a temp root and drives the real `carto` CLI through the full
  loop: sync → validate → build → preview, then mutates a source file to assert
  staleness detection (status red → targeted sync → green), then federates a
  second doc-set. It fetches the previewed artifact, checks known source symbols
  reach the HTML, verifies every `carto:` link resolves, and confirms federated
  pages mount under their alias-hash and `/self` prefixes. No LLM or secrets;
  it runs in CI.

Skill quality (does an agent *follow* `skills/carto`) is measured separately
with [waza](https://github.com/microsoft/waza) under `evals/carto`. This eval
calls a real model, so it is a **local-only** tool — never wired into CI. Run it
by hand after changing the skill:

```sh
pnpm build            # the carto bin must exist (see Setup)
waza run evals/carto/eval.yaml --context-dir evals/carto/fixtures
```

waza uses its bundled GitHub Copilot CLI; authenticate once with
`copilot login` (machine-level, no token file).

## Project layout / where to look next

- `packages/core` — schema, hashing, node tree, `carto:` link resolver
- `packages/cli` — the `carto` binary (`packages/cli/src/commands/`)
- `packages/template` — the bundled Astro + Starlight site
- `skills/carto/` — the manually invoked Carto skill and its on-demand documentation-authoring references
- `.carto/docs/` + `carto.json` — carto's own self-documentation (dogfooded)
- `plans/` — implementation plans for this repo
- `tests/pipeline/` — the deterministic system test and its fixture doc-sets
- `evals/carto/` — the local-only, real-model waza eval for the Carto skill
