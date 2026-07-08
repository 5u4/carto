# Plan 005: Author the distributable carto skill (`skill/SKILL.md`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 442f9de..HEAD -- skill/`
> If `skill/SKILL.md` already exists or changed since this plan was written,
> compare the "Current state" excerpts against the live file before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 002 (conceptual — this file documents the schema and CLI
  contract that plan 002 defines; the CLI itself is plan 003. No code from
  those plans needs to exist for you to write this file, but the facts inlined
  below MUST match what 002/003 ship.)
- **Category**: docs
- **Planned at**: commit `442f9de`, 2026-07-08

## Why this matters

carto's whole workflow is: a user points their own LLM/agent at a codebase, the
agent invokes **the carto skill**, and the skill drives the agent to read code,
write `.mdx` pages, and edit one `carto.json` manifest — while a tiny CLI does the
two things an LLM can't do reliably (hash files, validate structure/links). This
file, `skill/SKILL.md`, **is that skill** — it is the product's brain. If it is
vague, the generated docs mirror the file tree, copy stale comments, invent
examples, or leave the manifest in a broken state. A weak model with zero context
must be able to run the full generation loop from this one file. The bar is
executor-proof precision, not prose polish.

## Current state

Greenfield repo. It currently contains only `AGENTS.md`, `.gitignore`, and
`.agents/skills/`. There is **no `skill/` directory yet** — you create it.

You are writing a single new file: `skill/SKILL.md`. It is a Markdown file with
YAML frontmatter, in the same shape as the existing skills under
`.agents/skills/*/SKILL.md`. The two facts you need from those exemplars:

- Frontmatter is a YAML block delimited by `---` lines, with at least
  `name:` and `description:` keys. Minimal valid example (from
  `.agents/skills/skill-creator/SKILL.md`):

  ```
  ---
  name: skill-creator
  description: Create new skills, modify and improve existing skills, ...
  ---
  ```

  The `description` is the trigger text — it must say, in one or two sentences,
  *when* an agent should reach for this skill.
- After the frontmatter, the body is plain Markdown headings + prose. No build
  step, no schema — it is read verbatim by the invoking agent.

**Authoritative contract this file must document** (inline; the executor has no
other source). These are FIXED — do not paraphrase them into different names or
add commands/fields:

- **The carto CLI has exactly six commands** (binary name `carto`, built with
  citty): `init`, `status`, `sync`, `validate`, `dev`, `build`. There are **no
  fine-grained mutation commands** (no `add-node`, `set-parent`, …). The LLM
  edits `carto.json` directly; `sync` + `validate` are the guardrails.
- **The mdx file layout is `docs/<id>/<locale>.mdx`** (one file per node per
  locale; id-based paths so refactors move no files).
- **`carto.json` schema** (defined once with zod in `@carto/core`), field rules,
  the `carto:<id>` link syntax, the node-splitting heuristic, the layered content
  checklist, and the four verification disciplines — all reproduced in full in
  Step 2 below. That block is the source of truth for what goes into the file.

Repo conventions that apply (from `AGENTS.md`):

- **Zero code comments** anywhere — including inside any fenced code block in
  `skill/SKILL.md`. No `//`, `/* */`, no TODO/NOTE banners. The JSON and the
  flow diagram in Step 2 are already comment-free; keep them that way. A gate,
  `scripts/lint-comments.sh` (created by plan 001), enforces this.
- **English only** for everything repo-facing (this file included).
- Simplicity / surgical scope: create exactly this one file, nothing else.

## Commands you will need

| Purpose   | Command          | Expected on success              |
|-----------|------------------|----------------------------------|
| Install   | `pnpm install`   | exit 0                           |
| Build     | `pnpm build`     | exit 0 (no package to compile here — stays green) |
| Typecheck | `pnpm typecheck` | exit 0 (no TS in this plan — stays green) |
| Tests     | `pnpm test`      | all pass (no tests added here)   |
| Lint      | `pnpm lint`      | exit 0 (comment gate; must stay green) |

This is a pure-docs plan: no package compiles or tests change. Your real
verification is the **grep checklist** in "Test plan" plus `pnpm lint` (the
comment gate). Run `pnpm lint` after writing the file to confirm no code comment
slipped into a fenced block.

## Scope

**In scope** (the only file you create):
- `skill/SKILL.md` (create; and the `skill/` directory)

**Out of scope** (do NOT touch):
- `plans/README.md` — a reviewer maintains the index; update only your own row
  if instructed.
- Any package under `packages/*`, `scripts/`, root configs — this plan writes no
  code and depends on no package existing.
- Do NOT invent CLI commands, schema fields, or link forms beyond the fixed
  contract inlined here.

## Git workflow

- Branch: `advisor/005-carto-skill`
- One commit; Conventional Commits style, imperative, lowercase, no trailing
  period. Example: `docs(skill): add carto generation skill`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the `skill/` directory

Create the directory `skill/` at the repo root (sibling of `packages/` and
`docs/`).

**Verify**: `test -d skill && echo ok` → prints `ok`.

### Step 2: Write `skill/SKILL.md` verbatim

Write the file below **exactly** to `skill/SKILL.md`. The outer four-backtick
fence is only a container for this plan — do NOT include that outer fence in the
file; the file starts at the `---` frontmatter line and ends at the last line of
the "Recovering from a failed validate" section. Every inner three-backtick
fence and every table IS part of the file.

Do not add, drop, or reword sections: the "Done criteria" greps below assume the
exact headings and tokens written here. You MAY tighten prose only if every
grep in "Done criteria" still matches.

````markdown
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
- `nodes[].id`: **required, globally unique, immutable.** Pattern
  `^[a-z0-9][a-z0-9-]*$` — lowercase letters, digits, hyphens; no `.`, no `/`.
  This is the link target (`carto:payments`). Never rename an id.
- `nodes[].slug`: optional URL/display segment (default = id); same pattern;
  unique among siblings (nodes sharing the same parent). Slugs are cheap to
  change — links target the id, not the slug.
- `nodes[].parent`: optional; the `id` of the parent node. **Omit the key** to
  make a node a root — do not write `parent: null` (the schema types `parent`
  as an optional string, so `null` fails validation). A parent id that does not
  exist yet is a **warning, not an error** — you may generate from the middle of
  the tree. A cycle or a self-parent is an error.
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

A node is **one page = one mental model**, readable in one sitting.

- A node = "one thing you'd explain on a whiteboard": a subsystem, a flow, a core
  concept. **Never one file per node** — mirroring the file tree is exactly what
  carto avoids.
- Split a page when its `sources` list balloons or more than about 5 independent
  concepts pile up.
- Shape the tree top-down: the top is orientation ("what is this, how do the
  pieces fit"); deeper nodes are subsystems, then flows. Starting from a root is
  recommended but not required — middle generation is legal (a dangling parent is
  only a warning).
- Keep `sources` precise: register only the files whose behavior the page
  actually describes. Too broad triggers false "stale" churn; too narrow lets
  real changes go undetected. This is the staleness crosshair.

## What each page contains (a checklist, not a template)

Layer the content; do NOT force a rigid six-section shape — forcing all six
invites filler. Include a layer when the "Required when" column says so:

| Layer | Content | Required when |
|---|---|---|
| Intent | the problem it solves and its role in the system | always — most valuable, hardest to read from code |
| Mental model | 3 to 5 core concepts, their relations, one mermaid diagram | always |
| Run-through | a real input traced through the code to its output | flow and subsystem pages |
| Contract | public interface, inputs and outputs, invariants, error modes | pages with an outward face |
| Gotchas | counterintuitive bits, edge cases, "why is this weird" | when they exist |
| Code anchors | `path:line` on every load-bearing claim | always — jump-to-source and staleness crosshair |

**Hard floor: Intent + Mental model + Code anchors.** Add the rest as the page
warrants.

## Verification disciplines (non-negotiable)

1. **Comments, docstrings, and names are assumptions, not evidence.** Use them as
   hints about intent, but verify every claim against actual code behavior, and
   never copy them verbatim into the docs — comments drift out of sync with code.
2. **Every claim must be supportable by code behavior and carry a `path:line`
   anchor.** If you cannot confirm it from the code, do not write it.
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
````

**Verify**: `test -f skill/SKILL.md && head -1 skill/SKILL.md` → prints `---`
(the frontmatter opener).

### Step 3: Confirm the comment gate stays green

Run the comment lint over the new file.

**Verify**: `pnpm lint` → exit 0. (If plan 001's `scripts/lint-comments.sh` is
not present yet, run the fallback in "Test plan" instead.)

## Test plan

This is a prose deliverable; the "tests" are grep-based section/keyword checks
plus a self-review. Run the whole block; every line must succeed (each `grep -q`
exits 0 on a match).

```
grep -qx "name: carto" skill/SKILL.md
grep -q "^description:" skill/SKILL.md
grep -qF "## Two modes" skill/SKILL.md
grep -qF "## The generation loop" skill/SKILL.md
grep -qF "## The carto CLI (exactly six commands)" skill/SKILL.md
grep -qF "## The carto.json manifest you write" skill/SKILL.md
grep -qF "## carto: links and code anchors" skill/SKILL.md
grep -qF "## How to split into nodes" skill/SKILL.md
grep -qF "## What each page contains" skill/SKILL.md
grep -qF "## Verification disciplines" skill/SKILL.md
grep -qF "carto init" skill/SKILL.md
grep -qF "carto status" skill/SKILL.md
grep -qF "carto sync" skill/SKILL.md
grep -qF "carto validate" skill/SKILL.md
grep -qF "carto dev" skill/SKILL.md
grep -qF "carto build" skill/SKILL.md
grep -qF "document \`<dir|files>\`" skill/SKILL.md
grep -qF "refresh \`[<id>]\`" skill/SKILL.md
grep -qF '"version": 1' skill/SKILL.md
grep -qF '"defaultLocale": "en"' skill/SKILL.md
grep -qF '^[a-z0-9][a-z0-9-]*$' skill/SKILL.md
grep -qF "carto:<id>" skill/SKILL.md
grep -qF "carto:<id>#<anchor>" skill/SKILL.md
grep -qF "path:line" skill/SKILL.md
grep -qF "Never one file per node" skill/SKILL.md
grep -qF "one page = one mental model" skill/SKILL.md
grep -qF "Intent + Mental model + Code anchors" skill/SKILL.md
grep -qF "assumptions, not evidence" skill/SKILL.md
grep -qF "real code path" skill/SKILL.md
grep -qF "Generate all locales together" skill/SKILL.md
grep -qF "fine-grained mutation commands" skill/SKILL.md
! grep -nE "//|/\*|\*/" skill/SKILL.md
```

Notes:
- The last line asserts **no code comment tokens** exist anywhere in the file
  (no `//`, `/*`, `*/`). It must print nothing and exit 0. If it matches, you
  introduced a comment — remove it. (Single `/` in paths like
  `packages/api/src/payment.ts` and in `no `.`, no `/`` is fine; only double
  slash and block-comment delimiters are flagged.)
- If `pnpm lint` is unavailable (plan 001 not landed), the fallback comment check
  is exactly that last grep line.

**Self-review** (a fresh reader must be able to execute the loop from this file
alone): confirm the file, read top to bottom by someone with zero context,
answers all of — (1) the six CLI commands and when to run each; (2) that the LLM
writes `carto.json` directly with `file` and no `hash`, then `carto sync` fills
hashes; (3) the exact schema fields and the id/slug/parent/sources rules;
(4) how to write and where a `carto:<id>` link points (immutable id, not
path/slug); (5) how to decide node boundaries; (6) what layers a page needs;
(7) the four verification disciplines. If any answer requires outside knowledge,
the file is not self-contained — fix it.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `skill/SKILL.md` exists with valid YAML frontmatter: `grep -qx "name: carto" skill/SKILL.md` and `grep -q "^description:" skill/SKILL.md` both exit 0.
- [ ] All heading greps in "Test plan" pass (generation loop, both modes, schema, link syntax, node-splitting, layered checklist, four disciplines, six CLI commands section).
- [ ] All six command names appear: `carto init/status/sync/validate/dev/build`.
- [ ] Schema tokens present: `"version": 1`, `"defaultLocale": "en"`, id pattern `^[a-z0-9][a-z0-9-]*$`, and `"file"` written without `"hash"` in the example.
- [ ] Link + anchor tokens present: `carto:<id>`, `carto:<id>#<anchor>`, `path:line`.
- [ ] Discipline tokens present: `assumptions, not evidence`, `real code path`, `Generate all locales together`, `Intent + Mental model + Code anchors`.
- [ ] `! grep -nE "//|/\*|\*/" skill/SKILL.md` — zero code comments in any embedded code fence.
- [ ] `pnpm lint` exits 0 (comment gate green).
- [ ] No file outside `skill/SKILL.md` is created or modified (`git status`).
- [ ] `plans/README.md` status row updated (unless a reviewer owns the index).

## STOP conditions

Stop and report back (do not improvise) if:

- The carto CLI is described anywhere (in the repo, in a landed `@carto/cli`, or
  by the operator) as having a command set **different** from the fixed six —
  `init`, `status`, `sync`, `validate`, `dev`, `build`. Do NOT invent
  `add-node`, `set-parent`, or any fine-grained mutation command; the manifest is
  edited directly. If the contract genuinely differs, STOP.
- The landed `@carto/core` schema (plan 002) uses field names or rules that
  contradict the schema inlined in Step 2 (e.g. a renamed `defaultLocale`, an
  `order` field, a different id pattern). The file must match the shipped schema;
  a mismatch is a STOP condition, not something to reconcile by guessing.
- `scripts/lint-comments.sh` flags `skill/SKILL.md` and you cannot see which
  token it objects to.
- The verification greps fail twice after a reasonable fix attempt.

## Maintenance notes

For whoever owns this file next:

- **This file mirrors two frozen contracts: the `carto.json` schema and the CLI
  command surface.** Any change to the schema (a new field, a changed id pattern,
  the reserved `refs` federation block) or to the CLI (a renamed/added command,
  a changed default) MUST be reflected here in the same PR, and the affected grep
  checks in "Test plan"/"Done criteria" updated to match. A reviewer should
  diff this file against `@carto/core`'s zod schema and `@carto/cli`'s command
  list.
- The `carto:<alias>/<id>` federation link form and the `refs` manifest block are
  **v2**; the file deliberately tells the model NOT to use them. When federation
  lands, update the link section rather than adding it silently.
- The four verification disciplines and the node-splitting heuristic are the
  quality core — resist diluting them into generic "write good docs" advice; they
  are what keep generated docs grounded and staleness-trackable.
- If plan 006 (e2e smoke) reveals the loop is ambiguous in practice, tighten the
  wording here first — this file is the single lever on generation quality.
