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

## Two modes

- **document `<dir|files>`** — new coverage. Read the code, invent a node subtree,
  write the pages, register the sources.
- **refresh `[<id>]`** — regenerate existing pages after code changed. Run
  `carto status` to see which nodes are non-fresh. `refresh` with no id covers
  every non-fresh node; `refresh <id>` targets one node and its subtree. Re-read
  the sources and rewrite the affected pages.

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

## The carto CLI (exactly six commands)

There are **no** fine-grained mutation commands (no add-node, no set-parent). You
edit `carto.json` directly; `sync` and `validate` are the guardrails.

| Command | When you run it |
|---|---|
| `carto init` | Once per doc root, only if `carto.json` is absent. Scaffolds `carto.json` and `docs/`. Refuses if `carto.json` exists. |
| `carto status` | First thing every invocation. Read-only; prints each node's freshness — unsynced / stale / missing / fresh. Use it to choose refresh targets. Exits non-zero if any node is not fresh. |
| `carto sync` | After you edit `carto.json`. The only deterministic write: recomputes and writes every source hash and refreshes `updated_at`. |
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
  out; `carto sync` fills it. The array may be empty for a pure-orientation page.
  Sibling display/nav order equals array order (there is no `order` field).

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
- Do NOT use `carto:<alias>/<id>` (the `/` federation form) — it is reserved for
  v2 and `carto validate` rejects it as an error.
- Because ids forbid `.` and `/`, the separators are unambiguous: `#` is an
  in-page anchor, `/` is the reserved federation boundary.

**Code anchors are a different concept.** To point a reader at source, write a
plain-text `path:line` mention in prose, for example
`packages/api/src/payment.ts:42`. In the MVP these render as plain text — no
permalink. They are for the reader's eye and are **separate** from
`nodes[].sources`, which is the machine-tracked staleness set. In practice both
should point at the same load-bearing code.

## How to split into nodes

A node is **one mental model**, readable in one sitting.

- A node = "one thing you'd explain on a whiteboard": a subsystem, a flow, a core
  concept. **Never one file per node** — mirroring the file tree is exactly what
  carto avoids.
- Split a node when its `sources` list balloons or more than about 5 independent
  concepts pile up.
- Shape the tree top-down: the top is orientation ("what is this, how do the
  pieces fit"); deeper nodes are subsystems, then flows. Starting from a root is
  recommended but not required — middle generation is legal (a dangling parent is
  only a warning).
- Keep `sources` precise: register only the files whose behavior the node
  actually describes. Too broad triggers false "stale" churn; too narrow lets
  real changes go undetected. This is the staleness crosshair.
- **Audience layering — lead with the user, not the architecture.** If the code
  is a tool, library, product, or anything with users, the tree MUST open with a
  user-facing layer that answers "as a user, how do I actually use this?": what it
  is and who it's for, how you invoke or call it, and the main loop or workflow
  you drive. Internal architecture (how the packages/modules are built) belongs in
  **deeper** nodes aimed at contributors — never as the top of the tree. A pure
  package-dependency diagram is not orientation; it is architecture wearing an
  overview's hat.
- **Every user-facing tree needs a getting-started node.** Add a dedicated node
  (id such as `getting-started` or `usage`) that walks a first-time user from zero
  to a working result: prerequisites, the exact invocation, what happens at each
  step, and one complete run they can reproduce. This node is required whenever the
  documented thing has users; skip it only for purely internal code nobody invokes
  directly.

**Pick each node's type — it fixes the section order.** Most carto nodes are
Explanation; that is the "one node = one mental model" shape.

| Node type | Reader goal | Typical carto node | Section order |
|---|---|---|---|
| Explanation | build a mental model | subsystem, core concept | concept → context → mechanism → tradeoffs → example |
| Tutorial | working result from zero | getting-started, usage | goal → prerequisites → steps → verification → next |
| Reference | look up exact behavior | CLI/API entry node | overview → signature → parameters → returns → examples → edge cases |

Deeper contributor nodes are almost always Explanation — resist letting them
decay into step-by-step tutorials.

## What each node contains

Do not force one fixed shape on every node. First pick the node's type (above) —
that fixes the section order. Then apply four principles that hold across all
types:

- **Value first.** Open with what the reader gains: what this thing is, what you
  can do after reading. Push background and internal architecture below the fold.
- **Overview before detail.** The first lines state the node's value plus any
  prerequisites or constraints; never open with deep background unless the
  background *is* the value.
- **Concrete over vague.** Every claim is observable — real commands, real inputs
  and outputs, version and environment constraints — not "handles caching
  appropriately". Replace a vague adjective with the condition that proves it.
- **Sufficient background.** Define an unfamiliar concept the first time it
  appears, near the point of use, not in a detached glossary.

**Hard floor, regardless of type:** Intent (the problem it solves and its role in
the system) + a mental-model view (3 to 5 core concepts, their relations, one
mermaid diagram) + a `path:line` code anchor on every load-bearing claim. On any
**user-facing node** (getting-started, usage, or a node documenting a command or
API a reader calls), one **real, reproducible worked example** — real commands
with their real output, or real inputs mapped to real outputs — is also part of
the floor. An idealized or invented example does not count; a user node without
one has not met the floor.

## Verification disciplines (non-negotiable)

1. **Comments, docstrings, and names are assumptions, not evidence.** Use them as
   hints about intent, but verify every claim against actual code behavior, and
   never copy them verbatim into the docs — comments drift out of sync with code.
2. **Every claim must be supportable by code behavior and carry a `path:line`
   anchor.** If you cannot confirm it from the code, do not write it — mark the
   gap as an explicit TODO instead of inventing a fact.
3. **Run-throughs trace a real code path** with inputs and outputs the code can
   actually produce — no imagined or idealized examples.
4. **Generate all locales together.** Write `defaultLocale` first, then each
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
- **federation `/` link** — remove it; not supported in the MVP.

Fix, re-run `carto sync` then `carto validate`, and repeat until it exits 0.
