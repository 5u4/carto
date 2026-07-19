---
name: carto
description: Generate and maintain sustainably-evolving documentation for one or more codebases — a top-down, mental-model map (not API reference) whose pages carry machine-checkable anchors back to source, so stale pages are detectable and regenerable. Use when asked to document a codebase, write architecture or onboarding docs, build a code map for new joiners, or refresh existing carto docs after code changes.
---

# Carto

You document a codebase with **carto**: a sustainably-evolving map that helps a
human build a mental model of what the code does and why. It is **not** API
reference and **not** a line-by-line transcription. The differentiator is
sustainability — every page carries machine-checkable anchors back to the code it
describes, so tooling can tell which pages went stale when code changed and
regenerate only those.

You (the agent) do the judgement: read code, write `.mdx` pages, and edit one
`carto.json` manifest. A small CLI does only what you can't do reliably — hash
files and validate structure/links. An Astro/Starlight template renders the
result. This skill tells you how to drive the loop.

## Before you start

- The doc root (the directory you document into) must contain a `carto.json`
  manifest and a `docs/` directory. If `carto.json` is absent, run `carto init`
  once to scaffold both. `init` refuses to run if `carto.json` already exists.
- The `carto` CLI must be on PATH.
- You write prose and the manifest by hand. The CLI never invents structure — it
  only hashes (`carto sync`) and checks (`carto validate`).
- Content doctrine lives in the **`documenting-strategy`** skill — how to split a
  system into mental-model pages, layer them for the audience, pick each page's
  type, and hold every page to a content floor. Read it before you plan a node
  tree; this skill covers only the carto-specific mechanics.

## Two modes

- **document `<dir|files>`** — new coverage. Read the code, invent a node subtree,
  write the pages, register the sources.
- **refresh `[<id>]`** — regenerate existing pages after code changed. Run
  `carto status` to see which nodes are non-fresh. `refresh` with no id covers
  every non-fresh node; `refresh <id>` targets one node and its subtree. For each
  stale source, prefer a **diff-first** pass: `carto status` prints the anchor
  commit the page was last synced at (`stale a.ts (was 44cc03e264f8f6ef7b9dee8d4c28375764b8e5af)`), so run
  `git diff <anchor> -- <file>` to see exactly what changed and make a targeted
  edit, instead of re-reading the whole file and rewriting the page. Fall back to
  a full re-read when there is no anchor, the source is not in a git repo, or the
  anchor commit is unreachable (rebased/squashed away — `git diff` errors).

To find code that no page covers yet — the files new work adds — run
`carto coverage`. It only reports orphans; deciding to document them stays a
deliberate `document` call, never automatic.

## The generation loop

Every invocation, given a scope:

```
invoke(scope)
  -> read code + run `carto status`
  -> plan the node tree (choose ids, parents, sources)
  -> write .mdx pages: docs/<id>/<locale>.mdx for every node x every locale
  -> edit carto.json: add or update nodes; each source lists `file` only, no hash
  -> carto sync       (CLI fills every source hash, refreshes updated_at)
  -> carto validate   (CLI checks schema, tree, and links)
        on error -> fix the mdx or carto.json it names, then run sync + validate again
```

Never leave an invocation until `carto validate` exits 0.

## The carto CLI (exactly seven commands)

There are **no** fine-grained mutation commands (no add-node, no set-parent). You
edit `carto.json` directly; `sync` and `validate` are the guardrails.

| Command | When you run it |
|---|---|
| `carto init` | Once per doc root, only if `carto.json` is absent. Scaffolds `carto.json` and `docs/`. Refuses if `carto.json` exists. |
| `carto status` | First thing every invocation. Read-only; prints each node's freshness — unsynced / stale / missing / fresh. A non-fresh source also prints the full anchor commit it was last synced at (`stale a.ts (was 44cc03e…)`), the base for a `git diff`. Use it to choose refresh targets. Exits non-zero if any node is not fresh. |
| `carto sync` | After you edit `carto.json`. The only deterministic write: recomputes and writes every source hash, stamps each source with the current git `HEAD` (skipped outside a repo), and refreshes `updated_at`. |
| `carto coverage` | Optional, detection-only. Lists files under the doc root that no node's `sources` tracks — the orphans that new code introduces. Read-only, never generates; exits 0 by default (`--fail-on-uncovered` makes it a CI gate). Respects `.gitignore` and `.cartoignore`; carto's own outputs (`carto.json`, `docs/`, `dist-site/`), `.git/`, `node_modules/`, and the ignore files themselves are always excluded. |
| `carto validate` | After `sync`. Read-only full check: schema, id uniqueness, sibling-slug uniqueness, parent cycles, one mdx per locale, every `carto:` link resolves. Fix and repeat on any error; exits non-zero on error. |
| `carto dev` | Optional. Preview the rendered site locally. |
| `carto build` | Optional. Produce the static site. |

## The carto.json manifest you write

One `carto.json` per doc root equals one site. It holds structure and source
tracking only — **no prose**. Shape:

```json
{
  "version": 1,
  "locales": ["en", "zh"],
  "defaultLocale": "en",
  "updated_at": "2026-07-08T00:00:00Z",
  "home": "overview",
  "nodes": [
    {
      "id": "payments",
      "slug": "billing",
      "parent": "api",
      "sources": [
        { "file": "packages/api/src/payment.ts" }
      ]
    }
  ]
}
```

Field rules:

- `version` is always `1`.
- `locales`: non-empty list of unique short codes. `defaultLocale` MUST be one of
  them.
- `updated_at`: ISO 8601. `carto sync` refreshes it, so you may leave it as-is.
- `home`: optional node `id` the site root `/` redirects to (and each locale
  root, e.g. `/zh/`). It may point at **any** node, not only a root. Omit it and
  the root falls back to the first root node in array order; when there are no
  nodes at all, the build renders an empty-state landing page instead of a
  redirect. `carto validate` errors if `home` names an id that does not exist.
- `federated`: optional array wiring in other doc-sets so pages can link across
  them with `carto:<alias>/<id>`. Omit it for an ordinary single doc-set (the
  default) — nothing changes. Each entry is `{ "alias", "type", ... }`:
  - `type: "file"` — `{ "alias": "web", "type": "file", "path": "../web-docs" }`;
    `path` is relative to this `carto.json`'s directory and points at another doc
    root (a directory holding its own `carto.json` + `docs/`).
  - `type: "git"` — `{ "alias", "type": "git", "url", "ref", "subdir"? }`; the
    shape is accepted but **not yet implemented** (the build errors). Use `file`.
  - `alias`: same id pattern as node ids; the label authors write in
    `carto:<alias>/<id>`. Must be unique within this manifest, and `self` is
    reserved (the build mounts your own pages under `/self/`). Aliases are local
    to the manifest that declares them — a referenced doc-set never needs to know
    who federates it.
  - The build loads the whole federation graph, dedupes a doc-set referenced more
    than once, and mounts each under a URL prefix `/<alias>-<hash>/`. Cross-links,
    the sidebar, staleness banners, and locale fallback all work across doc-sets;
    each doc-set still owns its own `sync`/`status`.
- `nodes[].id`: **required, globally unique, immutable.** Pattern
  `^[a-z0-9][a-z0-9-]*$` — lowercase letters, digits, hyphens; no `.`, no `/`.
  This is the link target (`carto:payments`). Never rename an id.
- `nodes[].slug`: optional URL/display segment (default = id); same pattern;
  unique among siblings (nodes sharing the same parent). Slugs are cheap to
  change — links target the id, not the slug.
- `nodes[].parent`: optional; the `id` of the parent node. **Omit the key** to
  make a node a root — do not write `parent: null` (the schema types `parent`
  as an optional string, so `null` fails validation). A parent id that does not
  exist yet is a **warning, not an error** — you may generate from the middle
  of the tree. A cycle or a self-parent is an error.
- `nodes[].sources`: the files whose behavior this page describes. Write **`file`
  only** — a path relative to the directory containing `carto.json`. Leave `hash`
  and `commit` out; `carto sync` fills both — `hash` is the content fingerprint,
  `commit` the git `HEAD` at sync time (the diff base a later refresh compares
  against). The array may be empty for a pure-orientation page. Sibling
  display/nav order equals array order (there is no `order` field).

Writing `file` without `hash` is the normal **unsynced** state: legal on disk,
reported by `carto status`, and rejected by `carto validate` until you run
`carto sync`.

## carto: links and code anchors

Link between pages by **logical id**, never by file path or slug. Inside `.mdx`,
write a normal Markdown link whose target is `carto:<id>`:

```
[Payments](carto:payments)
[Refund flow](carto:payments#refunds)
[](carto:payments)
```

- `carto:<id>` — link to a node by its immutable id.
- `carto:<id>#<anchor>` — link to a heading anchor within that node.
- `[](carto:<id>)` — empty label: the build fills in the target node's title in
  the current locale.
- `carto:<alias>/<id>` — **federation link** to a node in another doc-set that this
  manifest references under `<alias>` in its `federated` array (see the field
  rules above). The build rewrites it to the target doc-set's prefixed URL; the
  empty-label form fills in the target node's title. `carto validate` errors if
  the alias is not declared or the id does not exist in that doc-set.
- Because ids forbid `.` and `/`, the separators are unambiguous: `#` is an
  in-page anchor, `/` is the federation boundary between alias and id.

**Code anchors are a different concept.** To point a reader at source, write a
plain-text `path:line` mention in prose, for example
`packages/api/src/payment.ts:42`. In the MVP these render as plain text — no
permalink. They are for the reader's eye and are **separate** from
`nodes[].sources`, which is the machine-tracked staleness set. In practice both
should point at the same load-bearing code.

## Structuring the node tree

**Read the `documenting-strategy` skill first** — it is the tool-agnostic doctrine
for how to split a system into mental-model pages, layer them for the audience
(lead with the user, not the architecture), give every user-facing tree a
getting-started page, pick each page's type and section order, and hold every page
to a content floor. Everything below is only how that doctrine maps onto carto's
nodes and `sources`.

- **One mental model = one node.** The doctrine's "one page = one mental model,
  never one file per page" becomes a carto node: an `id`, an optional `parent`,
  and a `sources` list. A getting-started page becomes a node with id
  `getting-started` or `usage`.
- **A node's `sources` is its evidence set — the staleness crosshair.** Register
  only the files whose behavior the node actually describes. Too broad triggers
  false "stale" churn; too narrow lets real changes go undetected. This precision
  is what makes carto's freshness tracking trustworthy; it is carto's own concern,
  not part of the general doctrine.
- **Generate top-down or from the middle.** A root node is recommended but not
  required — a node whose `parent` does not exist yet is only a warning, so you may
  generate a subtree before its parent. A cycle or a self-parent is an error.

## Starlight syntax worth reaching for

Pages render as MDX through Starlight, so plain Markdown is not your only
tool. Reach for the following when they genuinely serve the mental model.
The same restraint that governs mermaid applies: prose is the default,
structure earns its place — this is seasoning, not the meal.

- **Asides (callouts)** — `:::note`, `:::tip`, `:::caution`, `:::danger`,
  optionally titled `:::caution[Gotcha]`. The natural home for a constraint,
  an invariant, or a footgun you want to flag without derailing the prose.
  No import needed.
- **Code-block titles and highlights** (Expressive Code, on by default) —
  open a fenced code block with `title="src/foo.ts"` after the language, and
  draw the eye to the load-bearing lines with `{4-7}` or a term with `"handleX"`.
  This is the visual partner of a `path:line` anchor: name the block with the file,
  highlight the exact lines your prose points at.
- **`<Steps>`** — wraps an ordered list into a numbered walkthrough, which is
  what a getting-started or usage node's steps want to be. Import it from
  `@astrojs/starlight/components`.
- **`<details><summary>`** — collapse secondary detail so the page leads with
  value and keeps the digression out of the reader's way. Plain HTML, no
  import.

Components are safe, but keep every `carto:` link in a plain Markdown link
target as described above — a `carto:` target placed inside a JSX prop is
invisible to the validator and the build-time rewriter.

## Verification disciplines (non-negotiable)

The `documenting-strategy` skill carries the general evidence rules — comments are
assumptions not evidence, every claim needs a `path:line` anchor, run-throughs
trace a real code path. One discipline is carto-specific:

- **Generate all locales together.** Write `defaultLocale` first, then each
  translation. Translations preserve every `carto:` link and every `path:line`
  anchor **verbatim** — translate the prose, never the identifiers or link
  targets. Every node must have an `.mdx` for every declared locale, or
  `carto validate` fails.

## Recovering from a failed validate

`carto validate` names what is wrong. Common cases:

- **unsynced source / missing hash** — run `carto sync`.
- **duplicate id or duplicate sibling slug** — change the slug (never the id), or
  merge the nodes.
- **unresolved `carto:` link** — fix the id in the link, or add the missing node.
- **missing locale mdx** — write the absent `docs/<id>/<locale>.mdx`.
- **federation `/` link error** — the alias is not declared in this manifest's
  `federated` array, or the id does not exist in the referenced doc-set. Add the
  `federated` entry, or fix the alias/id.

Fix, re-run `carto sync` then `carto validate`, and repeat until it exits 0.
