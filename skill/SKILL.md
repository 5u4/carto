---
name: carto
description: Generate and grow a carto knowledge vault — a densely cross-linked static site built from one or many codebases plus free-standing concept notes. You write ir.json (the node forest) and per-node bilingual MDX; the carto CLI hashes sources against named anchors, reports staleness, and builds the static site. Use this whenever the user wants to document a codebase's architecture, drill into a component, start or extend a personal knowledge base / wiki / "second brain" spanning several repos, attach a dependency's internals to their own docs, or refresh a carto site after source changes — even if they don't say the word "carto".
---

# carto

carto turns source you care about into a growing, human-readable static site: one page
per node, densely cross-linked, that you can keep extending in any direction. You (the
agent) write the content; the `carto` CLI does the deterministic work (hashing, staleness,
static build). carto never calls a model — you are the only intelligence in the loop.

A carto site is a **vault**, not a single repo's manual. A vault can describe exactly one
codebase, or it can be a personal knowledge base that spans many repos and free-standing
concept notes and grows over years. The same primitives cover both; you choose the scope by
how many **anchors** you declare and how wide you let the **forest** grow.

The site is a **read surface**. It cannot call back into you. Drilling deeper always means
the user asks you, you write more nodes, and you rebuild.

## The two layers you write

**Structure — `content/ir.json`.** The single source of truth for the vault.

```jsonc
{
  "version": "1",
  "vault": {
    "name": "my-brain",
    "anchors": { "self": "..", "pico": "/Users/sen/Workspaces/pico" },
    "generatedAt": "2026-07-08T00:00:00Z",
    "locales": ["en", "zh"],
    "defaultLocale": "en"
  },
  "nodes": {
    "pico": {
      "id": "pico", "name": "Pico", "parent": null,
      "children": ["pico.scheduler"], "sources": []
    },
    "pico.scheduler": {
      "id": "pico.scheduler", "name": "Scheduler", "parent": "pico", "children": [],
      "sources": [{ "anchor": "pico", "file": "crates/core/src/schedule/mod.rs", "hash": "sha256:…" }]
    }
  }
}
```

- `children` is the containment tree — the backbone that drives navigation. It can grow
  arbitrarily deep. **A node's presence in the tree is the only depth state.** A node with no
  `children` simply has not had its next level written yet.
- `sources` lists the source files a node describes. Each cites an **anchor** (which root the
  file lives under) plus a repo-relative `file`, with the file's hash at the time you last
  wrote the node. Set `hash` to `"sha256:pending"` when you add a source; `carto hash` fills in
  the real values. The same `file` under two different anchors is two distinct sources.
- `parent`/`id` must be consistent: `nodes["x"].id === "x"`, every `parent` and every `child`
  must reference an existing node id, and every `source.anchor` must exist in `vault.anchors`.
- Relationships other than containment (depends-on, data-flow, who-uses-this) are **not**
  encoded here. They live in the prose as inline links. Keep `ir.json` a pure forest.

**Content — `content/nodes/<id>.<locale>.mdx`.** One flat file per node per locale. The
filename is the node id (dot/dash-segmented), never nested folders.

```mdx
---
id: pico.scheduler
name: Scheduler
locale: en
contentHash: sha256:pending
---

# Scheduler

...
```

Frontmatter carries only `id`, `name`, `locale`, `contentHash`. Everything structural
(parent, children, sources) lives in `ir.json` only — do not mirror it into frontmatter.

**Locale is atomic.** Languages are declared once in `vault.locales`; each language is a
sibling MDX file. When you regenerate a node, regenerate **all** its locales together — never
leave one language behind. A node is fresh iff every language is fresh.

## Anchors — how a vault reaches source

An anchor is a named root that `sources` resolve against. This is what frees a vault from a
single repo. Anchor paths resolve **relative to the directory that holds `ir.json`** (the
content dir), so a relative anchor like `".."` is portable and an absolute one reaches
anywhere on disk.

- **One repo** → one anchor, e.g. `{ "self": ".." }` when you run carto at the repo root with
  content in `content/`. This is the whole story for a single-codebase site.
- **A knowledge base across projects** → many anchors, each pointing at a repo or checkout
  you want to describe: `{ "pico": "/Users/sen/Workspaces/pico", "carto": "../carto" }`.
- **Attaching a dependency** → add the dependency's checkout as another anchor and write nodes
  about the parts you actually use. You are describing its internals from your vault; you do
  not import its docs (see cross-vault linking below).

`carto hash` resolves `anchors[source.anchor]` then the file beneath it, and records the hash.
No file path may escape its anchor with `..`, but anchors themselves are user-declared roots,
so absolute anchors are expected and fine.

## The forest — roots are dimensions

`ir.json` is a **forest**: every node with `parent: null` is a separate top-level entry, and
navigation lists them all. There is no mandatory single "overview" root. Use the roots as the
top-level dimensions of the vault:

- a single-repo site may still have one root (the project) with everything under it;
- a knowledge base has one root per repo *and* per free-standing theme, side by side;
- you add a new direction to the vault simply by adding a new `parent: null` node.

## Concept nodes — the wiki glue

A node with `sources: []` describes an idea, not a file: a design principle, a cross-cutting
pattern, a glossary entry, a "how these three services talk" narrative. Concept nodes are
never stale (they anchor to no source), and they are what turns a pile of per-file pages into
a wiki — they give you somewhere to link *to* when the relationship you're explaining doesn't
live in any single file. Reach for them freely.

## The CLI

Run from the directory holding `content/`. All commands are deterministic and never call a
model. Anchors come from the vault — there is no `--root` flag.

- `carto hash --content content` — resolve every source against its anchor, recompute its
  hash, and write current values into `ir.json`. Run this after writing or editing nodes so
  the staleness anchor is accurate.
- `carto diff --content content` — list sources whose current hash differs from `ir.json` (or
  that are missing), as `anchor:file`.
- `carto stale --content content` — map changed sources to the node ids that describe them.
  **This is a report, not an instruction.** It tells you which pages *might* be out of date;
  whether and when to rewrite them is your call.
- `carto build --content content --out <dir>` — compile `content/` into a static HTML site.
  It also runs the staleness check and marks stale pages with a hint in the output.

## Style contract (this is the real value)

Every page must read the same regardless of which node, session, or repo it came from.

- **Section skeleton, in order:** responsibility → key types/functions → data flow →
  relationships → examples (only if they clarify). Keep the voice consistent.
- **Link to other pages by node id, never by file path.** Use an inline Markdown link whose
  href is `/<locale>/<node-id>/`, e.g. `see [Triggers](/en/pico.scheduler/)`. This is how the
  vault becomes densely connected — link generously to related nodes and concept nodes. Never
  write a bare source path as a link.
- **Data flow is an ordered narrative** — walk the code path step by step (1 → 2 → 3), never a
  diagram. Never emit raw HTML, CSS, or SVG.
- **Code examples only when they clarify** — skip trivial glue. Reference the source file (and
  line) when you show code.

## Cross-vault linking

Two separate vaults (say a library's own carto site and yours) connect by **prose links
only** — a normal Markdown link to the other site's published URL. A vault never mounts
another vault's `ir.json`, and its own pages are only ever addressed by node id within itself.
When you want to browse *into* a dependency's internals from your own vault, don't try to
absorb its vault — add the dependency as an anchor and write your own nodes about it.

## The loop, in practice

1. **Seed a vault:** decide the anchors (one for a single repo; several for a knowledge base),
   decide the top-level roots, write their nodes in `ir.json` and one MDX per locale each, then
   `carto hash` and `carto build`.
2. **Drill into a node:** add its `children` to `ir.json`, write each child's nodes, `carto
   hash`, `carto build`. Growing the tree one level deeper is the same act as seeding — there
   is no separate "deep-dive" mode.
3. **Add a direction:** to bring a new repo or theme into the vault, add its anchor (if it is
   source-backed), add a new root node, and seed under it. The rest of the vault is untouched.
4. **After source changes:** `carto stale` to see what the change touched, then rewrite the
   nodes you judge worth refreshing (all their locales together), `carto hash`, `carto build`.

To keep context bounded on a large drill, generate a node (or a subtree) in a fresh
subagent/session.

## What this skill deliberately does not tell you

Generation strategy is entirely your judgment, weighed per node against accuracy and cost:

- how many anchors and roots to seed on first creation, and how many levels deep to go;
- how deep to read source before writing a page;
- whether to leave a node as a shallow placeholder and fill it later;
- whether to rewrite a page whose sources have not changed (allowed anytime — `stale` never
  gates you).

How to split source into nodes is also yours: cluster by responsibility and data-flow
boundaries, do not treat a god-file as one thing, and do not assume crate/directory structure
is the node structure. Concept nodes exist so you are never forced to pin an idea to a file it
does not live in. If a split turns out wrong, edit `ir.json` directly — no regeneration needed.
