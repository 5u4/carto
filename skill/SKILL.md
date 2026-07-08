---
name: carto
description: Generate and maintain a carto learning site for a codebase — write the ir.json structure tree and per-node MDX, then run the carto CLI to hash sources, report staleness, and build static HTML. Use when asked to document a codebase's architecture, drill into a component, or refresh a carto site after source changes.
---

# carto

carto turns a codebase into a human-readable static site: one page per component,
explaining its responsibility, key types, data flow, and how it relates to other
components. You (the agent) write the content; the `carto` CLI does the
deterministic work (hashing, staleness, static build). carto never calls a model —
you are the only intelligence in the loop.

The site is a **read surface**. It cannot call back into you. Drilling deeper
always means the user asks you, you write more nodes, and you rebuild.

## The two layers you write

**Structure — `content/ir.json`.** The single source of truth for the tree.

```jsonc
{
  "version": "1",
  "project": {
    "name": "pico",
    "root": "..",
    "generatedAt": "2026-07-07T00:00:00Z",
    "commit": "abc1234",
    "locales": ["en", "zh"],
    "defaultLocale": "en"
  },
  "nodes": {
    "scheduler": {
      "id": "scheduler",
      "name": "Scheduler",
      "parent": null,
      "children": ["scheduler.triggers"],
      "sources": [{ "file": "crates/core/src/schedule/mod.rs", "hash": "sha256:…" }]
    },
    "scheduler.triggers": {
      "id": "scheduler.triggers",
      "name": "Triggers",
      "parent": "scheduler",
      "children": [],
      "sources": [{ "file": "crates/core/src/schedule/trigger.rs", "hash": "sha256:…" }]
    }
  }
}
```

- `children` is the containment tree — the backbone that drives navigation. It can
  grow arbitrarily deep. **A node's presence in the tree is the only depth state.**
  A node with no `children` simply has not had its next level written yet.
- `sources` lists the source files a node describes, each with the file's hash at
  the time you last wrote the node. Set `hash` to `"sha256:pending"` when you add a
  node; `carto hash` fills in the real values. Multiple nodes may list the same file.
- `parent`/`id` must be consistent: `nodes["x"].id === "x"`, every `parent` and
  every `child` must reference an existing node id.
- Relationships other than containment (depends-on, data-flow, who-uses-this) are
  **not** encoded here. They live in the prose as inline links. Keep `ir.json` a
  pure tree.
- `ir.json` is language-neutral. Locale lives only in the content layer.

**Content — `content/nodes/<id>.<locale>.mdx`.** One flat file per node per locale.
The filename is the node id (dot/dash-segmented), never nested folders.

```mdx
---
id: scheduler
name: Scheduler
locale: en
contentHash: sha256:pending
---

# Scheduler

...
```

Frontmatter carries only `id`, `name`, `locale`, `contentHash`. Everything
structural (parent, children, sources) lives in `ir.json` only — do not mirror it
into frontmatter.

**Locale is atomic.** Languages are declared once in `project.locales`; each
language is a sibling MDX file. When you regenerate a node, regenerate **all** its
locales together — never leave one language behind. A node is fresh iff every
language is fresh.

## The CLI

Run from the directory holding `content/`. All commands are deterministic and
never call a model.

- `carto hash --content content --root <repo>` — recompute the hash of every source
  file listed in `ir.json` and write current values in. Run this after writing or
  editing nodes so the staleness anchor is accurate. `--root` is the repo the
  `sources` paths resolve against.
- `carto diff --content content --root <repo>` — list source files whose current
  hash differs from `ir.json` (or that are missing).
- `carto stale --content content --root <repo>` — map changed files to the node ids
  that describe them. **This is a report, not an instruction.** It tells you which
  pages *might* be out of date; whether and when to rewrite them is your call.
- `carto build --content content --root <repo> --out <dir>` — compile `content/`
  into a static HTML site. It also runs the staleness check and marks stale pages
  with a hint in the output.

## Style contract (this is the real value)

Every page must read the same regardless of which node or session wrote it.

- **Section skeleton, in order:** responsibility → key types/functions → data flow →
  relationships → examples (only if they clarify). Keep the voice consistent.
- **Link to other pages by node id, never by file path.** Use an inline Markdown
  link whose href is `/<locale>/<node-id>/`, e.g.
  `see [Triggers](/en/scheduler.triggers/)`. Never write a bare source path as a
  link.
- **Data flow is an ordered narrative** — walk the code path step by step (1 → 2 →
  3), never a diagram. Never emit raw HTML, CSS, or SVG.
- **Code examples only when they clarify** — skip trivial glue. Reference the source
  file and line when you show code.

## The loop, in practice

1. To seed a site: decide the top-level components, write their nodes in `ir.json`
   and one MDX per locale each, then `carto hash` and `carto build`.
2. To drill into a component: add its `children` to `ir.json`, write each child's
   nodes, `carto hash`, `carto build`. Growing the tree one level deeper is the
   same act as seeding — there is no separate "deep-dive" mode.
3. After source changes: `carto stale` to see what the change touched, then rewrite
   the nodes you judge worth refreshing (all their locales together), `carto hash`,
   `carto build`.

To keep context bounded on a large drill, generate a node (or a subtree) in a fresh
subagent/session.

## What this skill deliberately does not tell you

Generation strategy is entirely your judgment, weighed per node against accuracy
and cost:

- how many levels to seed on first creation;
- how deep to read source before writing a page;
- whether to leave a node as a shallow placeholder and fill it later;
- whether to rewrite a page whose sources have not changed (allowed anytime —
  `stale` never gates you).

How to split a codebase into components is also yours: cluster by responsibility and
data-flow boundaries, do not treat a god-file as one thing, and do not assume
crate/directory structure is the component structure. If a split turns out wrong,
edit `ir.json` directly — no regeneration needed.
