---
name: carto
description: Document a codebase with the carto CLI, or refresh existing carto docs after code changes. Use when the user asks to build, update, or maintain documentation with carto.
---

# Carto

You document a codebase with **carto**: a sustainably-evolving map that helps a
human build a mental model of what the code does and why. It is **not** API
reference and **not** a line-by-line transcription. The differentiator is
sustainability — every page carries machine-checkable anchors back to the code it
describes, so tooling can tell which pages went stale when code changed and
regenerate only those.

You (the agent) do the judgement: read code, write `.mdx` pages, and write the
config plus one small `node.json` per page. A small CLI does only what you can't
do reliably — hash files and validate structure/links. An Astro/Starlight
template renders the result. This skill tells you how to drive the loop.

## Before you start

Three prerequisites, in order. Stop and resolve each before generating.

1. **The `carto` CLI must be on PATH.** Run `carto --help`. If it is not found,
   tell the user and stop — do not try to install it yourself. There are many
   reasons it might be missing (no pnpm, not built, not linked), and which fix
   is right is the user's call.
2. **Know the available commands.** `carto --help` lists them; run
   `carto <command> --help` for a command's flags. Never assume a command or
   flag exists — check.
3. **The current directory must be a carto doc root** — it holds a `carto.json`
   config and a `docs/` directory. If `carto.json` is absent, run `carto init`
   once to scaffold both (`init` refuses if `carto.json` already exists).

This skill drives carto — the CLI, the config, the `node.json` files, the link
and anchor rules, and how a page maps onto carto's node tree. What makes a page
*good* (splitting a system into mental-model pages, layering them for the
audience, holding each to a content floor) is documenting judgement: load the
`documenting-component` skill for that.

## The generation loop

Every run starts from a **scope**. Generation (writing or refreshing docs) MUST
have a scope — the user tells you what to document or refresh ("the auth
module", "I just changed payment.ts"). Never invent one: if the user asks to
generate without saying what, ask. Pure **inspection** ("which docs are
stale?", "what code is undocumented?") needs no scope — just run `carto status`
/ `carto coverage` and report.

Given a scope:

```
1. Turn the scope into concrete targets.
   - carto status    -> which nodes are stale (candidates to refresh)
   - carto coverage  -> which source files no node covers (candidates to add)
   Intersect the user's scope with these facts. If the intersection is empty
   (e.g. the auth docs are already fresh), say so and stop — do not rewrite
   pages that do not need it.

2. Confirm with the user. List the exact pages you intend to write or create
   (node id + docs/<id>/<locale>.mdx path) and wait for the go-ahead before
   reading code and editing. This is a deliberate checkpoint, not a formality.

3. Write the node.json files for the in-scope nodes only, and touch no others.

4. Write the .mdx pages: docs/<id>/<locale>.mdx for every in-scope node and
   every declared locale.

5. carto sync <id> [<id> ...]   Bless exactly the nodes you just wrote — the CLI
   recomputes their source hashes and stamps the current commit. Naming the ids
   is what keeps every other page's freshness untouched.

6. carto validate   Checks schema, tree, and links, and that in-scope pages are
   synced. On error, fix the mdx or node.json it names, then sync + validate
   again. Leftover stale pages outside your scope are expected and reported as
   warnings — not your job this run.

7. carto status   Confirm every id you set out to write or refresh is now
   `fresh`. If one is still `stale`, you edited its prose but forgot to
   `carto sync <id>` it — do that and re-check. A green validate alone does not
   catch this, because validate is silent about stale pages.
```

Never leave a run until `carto validate` exits 0 **and** `carto status` reports
every node you touched as `fresh`. This second half matters on a refresh:
`carto validate` is silent about stale pages (they are a legitimate state), so a
green validate does **not** prove your edit landed. After you rewrite a stale
page's prose you MUST `carto sync <id>` it — otherwise its source stays stale,
validate still passes, and your work is only half done. Check `carto status`
and confirm the ids you set out to refresh come back `fresh`.

**Why name ids on `sync`.** Bare `carto sync` blesses only *unsynced* sources
(pages you just wrote that have no hash yet) and deliberately leaves *stale*
sources alone. `carto sync <id>` is how you say "I have personally regenerated
these pages — stamp them." This is the core of scoped updates: on a doc set of
hundreds of pages you refresh three and run `carto sync a b c`, and the other
pages keep both their freshness signal and their diff anchor.

**Refreshing a stale page — diff first.** `carto status` prints the commit a
stale source was last synced at (`stale a.ts (was 44cc03e…)`). Run
`git diff <commit> -- <file>` to see exactly what changed and make a targeted
edit, rather than re-reading and rewriting the whole page. Fall back to a full
re-read when there is no anchor, the source is not in git, or the anchor commit
is unreachable (rebased/squashed away — `git diff` errors).

**`sources` follows the code, not the freshness state.** A node's `sources` is
the set of load-bearing files the page describes. Change it only when that set
genuinely changes (a file split, a responsibility moved). Never delete a source
just to silence a stale warning — that dismantles the staleness crosshair
instead of updating the page.

## What you write on disk

Two kinds of file. The CLI never invents structure — it only hashes and checks.

### carto.json — one thin config per doc root

```json
{
  "version": 1,
  "locales": ["en", "zh"],
  "defaultLocale": "en",
  "home": "overview",
  "federated": []
}
```

- `version` is always `1`.
- `locales`: non-empty list of unique short codes. `defaultLocale` MUST be one
  of them.
- `codeRoot`: optional path (relative to this carto.json) to the code being
  documented; source `file` paths are relative to it. Defaults to `.`.
- `home`: optional node `id` the site root `/` redirects to (and each locale
  root, e.g. `/zh/`). It may point at **any** node. Omit it and the root falls
  back to the first root node in id order; with no nodes, the build renders an
  empty-state landing page. `carto validate` errors if `home` names an id that
  does not exist.
- `federated`: optional array wiring in other doc-sets so pages can link across
  them with `carto:<alias>/<id>`. Omit it for an ordinary single doc-set. Each
  entry is `{ "alias", "type", ... }`:
  - `type: "file"` — `{ "alias": "web", "type": "file", "path": "../web-docs" }`;
    `path` is relative to this carto.json's directory and points at another doc
    root.
  - `type: "git"` — accepted but **not yet implemented** (the build errors). Use
    `file`.
  - `alias`: same id pattern as node ids; the label authors write in
    `carto:<alias>/<id>`. Unique within this manifest; `self` is reserved.

carto.json carries **no `nodes` array and no `updated_at`** — nodes live in
their own directories, and per-source hashes are the freshness truth.

### docs/&lt;id&gt;/node.json — one per page

The node's **id is its directory name** — `docs/payments/node.json` is the node
`payments`. The id is the immutable link target (`carto:payments`); renaming it
means `git mv`-ing the directory (and every `carto:` link to it, or
`carto validate` will flag the now-dangling links). The file itself holds only:

```json
{
  "parent": "api",
  "sources": [
    { "file": "packages/api/src/payment.ts" }
  ]
}
```

- `parent`: optional; the `id` of the parent node. **Omit the key** for a root
  node (do not write `parent: null`). A parent id that does not exist yet is a
  **warning, not an error** — you may generate from the middle of the tree. A
  cycle or self-parent is an error.
- `sources`: the files whose behavior this page describes. Write **`file` only**
  — a path relative to `codeRoot`. Leave `hash` and `commit` out; `carto sync`
  fills them — `hash` is the content fingerprint, `commit` the git `HEAD` at
  sync time (the diff base a later refresh compares against; absent outside a
  git repo). The array may be empty for a pure-orientation page. Ids sort
  alphabetically for sibling nav order.

Writing `file` without `hash` is the normal **unsynced** state: legal on disk,
reported by `carto status`, and rejected by `carto validate` until you run
`carto sync`.

### docs/&lt;id&gt;/&lt;locale&gt;.mdx — the prose

One per node per locale. Each **MUST begin with a YAML frontmatter block**
carrying a `title:` field (translated per locale), and MAY add a
`description:`. Everything after the frontmatter is the page's prose — this is
where all prose lives.

## carto: links and code anchors

Link between pages by **logical id**, never by file path. Inside `.mdx`, write a
normal Markdown link whose target is `carto:<id>`:

```
[Payments](carto:payments)
[Refund flow](carto:payments#refunds)
[](carto:payments)
```

- `carto:<id>` — link to a node by its immutable id.
- `carto:<id>#<anchor>` — link to a heading anchor within that node.
- `[](carto:<id>)` — empty label: the build fills in the target node's title in
  the current locale.
- `carto:<alias>/<id>` — **federation link** to a node in another doc-set this
  manifest references under `<alias>` in its `federated` array. The build
  rewrites it to the target's prefixed URL. `carto validate` errors if the alias
  is not declared or the id does not exist there.
- Because ids forbid `.` and `/`, the separators are unambiguous: `#` is an
  in-page anchor, `/` is the federation boundary between alias and id.

**Code anchors are a different concept.** To point a reader at source, write a
plain-text `path:line` mention in prose, e.g. `packages/api/src/payment.ts:42`.
In the MVP these render as plain text — no permalink. They are for the reader's
eye and are **separate** from `node.json` `sources`, which is the
machine-tracked staleness set. In practice both should point at the same
load-bearing code.

## Structuring the node tree

How to split a system into good mental-model pages is documenting judgement (see
the `documenting-component` skill). This section is only how those pages map onto
carto's nodes and `sources`.

- **One mental model = one node** — a directory `docs/<id>/` with a `node.json`
  (an optional `parent`, a `sources` list) and one `.mdx` per locale.
- **A node's `sources` is its evidence set — the staleness crosshair.** Register
  only the files whose behavior the node actually describes. Too broad triggers
  false "stale" churn; too narrow lets real changes go undetected.
- **Generate top-down or from the middle.** A node whose `parent` does not exist
  yet is only a warning, so you may generate a subtree before its parent. A cycle
  or a self-parent is an error.

## Locale discipline

- **Generate all locales together.** Write `defaultLocale` first, then each
  translation. Translations preserve every `carto:` link and every `path:line`
  anchor **verbatim** — translate the prose, never the identifiers or link
  targets. Every node must have an `.mdx` for every declared locale, or
  `carto validate` fails.

## Recovering from a failed validate

`carto validate` names what is wrong. It fails (exit non-zero) on structure and
on the pages you touched, but **not** on pre-existing staleness. Common cases:

- **unsynced source / missing hash** — run `carto sync <id>` for the pages you
  wrote.
- **stale source** — reported as a **warning**, exit 0. It means a source
  changed and its page has not been refreshed; refreshing it is a deliberate
  scoped run (`carto status` to find it), not something this validate blocks on.
- **duplicate id** — two directories cannot share a name; this cannot happen on
  disk, but a malformed `node.json` id is rejected.
- **unresolved `carto:` link** — fix the id in the link, or add the missing node.
- **missing locale mdx** — write the absent `docs/<id>/<locale>.mdx`.
- **federation `/` link error** — the alias is not declared in this manifest's
  `federated` array, or the id does not exist in the referenced doc-set.
- **missing source file** — a `sources` entry points at a file that no longer
  exists; fix the path or drop the entry.

Fix, re-run `carto sync` then `carto validate`, and repeat until it exits 0.

## Starlight syntax worth reaching for

Pages render as MDX through Starlight, so plain Markdown is not your only
tool. Reach for the following when they genuinely serve the mental model.
Prose is the default, structure earns its place — this is seasoning, not the
meal.

- **Asides (callouts)** — `:::note`, `:::tip`, `:::caution`, `:::danger`,
  optionally titled `:::caution[Gotcha]`. The natural home for a constraint,
  an invariant, or a footgun. No import needed.
- **Code-block titles and highlights** (Expressive Code, on by default) —
  open a fenced code block with `title="src/foo.ts"` after the language, and
  draw the eye with `{4-7}` or a term with `"handleX"`. The visual partner of a
  `path:line` anchor.
- **`<details><summary>`** — collapse secondary detail so the page leads with
  value. Plain HTML, no import.

Components are safe, but keep every `carto:` link in a plain Markdown link
target as described above — a `carto:` target placed inside a JSX prop is
invisible to the validator and the build-time rewriter.
