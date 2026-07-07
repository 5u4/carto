# carto — design baseline

An agent-driven tool that turns a large codebase into a human-readable, incrementally-maintainable static site explaining its architecture, data flow, and component responsibilities — with on-demand, unbounded drill-down.

Status: design baseline for review. Nothing built yet.

## 1. Goals and non-goals

### Goals

- Produce a **human-readable static HTML site** for learning a large codebase: component responsibilities, data flow, cross-component relationships, examples where they help.
- **Lazy, on-demand depth.** No full-repo upfront build. The LLM decides how broad/deep to seed on first creation; any component can then be drilled into, arbitrarily many levels deep, when asked. Depth is where the tree has grown, not a per-node flag.
- **Incremental.** When source changes, the tool reports which pages depend on the changed files; regeneration is the LLM's/user's call, not automatic (see §6).
- **Clean content/presentation split.** The LLM writes only structured content (a small structure IR + Markdown/MDX prose + Mermaid text). A compiler (Astro) renders the HTML. Re-theming never re-invokes the LLM.
- **Bring-your-own-LLM.** carto ships **a skill + a deterministic CLI + an Astro template** and contains **zero LLM-provider code** — no model SDK, no knowledge of any provider. It adapts to the host agent (omp) through just two interfaces: a skill omp reads and a CLI omp runs (see §8). The agent supplies the model, LSP, file tools, and subagents; carto never calls an LLM.

### Non-goals

- **No RAG, no embeddings, no vector store.** Deliberately dropped — see §2.
- **No bundled model provider / gateway.** Dropped — the host agent provides the model.
- **No runtime server.** Output is static; the agent is the only "backend" (see §7).
- **No interactive-in-page generation.** The HTML is a read surface; drill-down is triggered by talking to the agent, not by clicking a button that calls back into an LLM.

## 2. Why no RAG

A retrieval/embedding approach earns its place only when you must (a) compress an arbitrarily large repo into a bounded prompt by pulling top-k similar chunks per page, or (b) answer free-text semantic queries across the whole repo. Both assume a full-repo build up front and a vector store over every chunk.

This design needs neither:

- **Bounded context comes from the component graph, not similarity search.** To write/drill a component, the agent is fed *that component's source files + the signatures of its direct graph neighbors* — precise, structural, deterministic. This is more accurate and cheaper than fuzzy top-k retrieval, and needs zero embeddings.
- **Navigation replaces free-text semantic search.** The user drills through the containment tree; there is no "which parts handle auth?" free-text query path, so the one scenario where retrieval earns its place is absent.

Consequence: no embedding step at all — the CPU-embedding cost that makes retrieval-based tools impractical on a small box simply does not exist here.

## 3. The two-layer IR

The LLM produces two separated layers, tuned for document-first reading: structure and content are generated and stored apart.

### Structure layer — `ir.json` (small, strict, machine-parsed)

The single source of truth for hierarchy, relationships, and staleness. It is the anchor for incremental invalidation and the input to the Astro build.

```jsonc
{
  "version": "1",
  "project": { "name": "pico", "root": "…", "generatedAt": "ISO", "commit": "sha", "locales": ["en", "zh"], "defaultLocale": "en" },
  "nodes": {
    "scheduler": {
      "id": "scheduler",
      "name": "Scheduler",
      "parent": null,
      "children": ["scheduler.triggers", "scheduler.store"],
      "sources": [
        { "file": "crates/core/src/schedule/mod.rs", "hash": "sha256:…" }
      ],
      "refs": [
        { "to": "discord-engine", "kind": "data_flow" },
        { "to": "config", "kind": "depends_on" }
      ],
      "content": {
        "en": { "contentHash": "sha256:…" },
        "zh": { "contentHash": "sha256:…" }
      }
    }
  }
}
```

Field notes:

- `children` — the **containment tree** (the backbone). Drives navigation, sidebar, routing, and the drill hierarchy. Can grow arbitrarily deep. This is the "tree" half. **A node's presence in the tree is the only depth state there is — no `stub`/`deep`/`expanded` flag.** A node either exists (fully written, or a placeholder at the LLM's discretion) or it doesn't. "How deep is this explored" = "how far has the tree grown here". A node with no `children` simply hasn't had its next level generated yet.
- `refs` — **cross-reference edges** overlaid on the tree, expressing what the tree can't: `depends_on` and `data_flow` (only these two — see §10). A cross-cutting node (error handling, logging, config) is referenced by many nodes via `refs` while living at exactly one place in the tree. This is the "graph" half. Rendered as in-page "→ related" links and Mermaid diagrams.
- `sources` — the files this node's page describes, each with a content hash. Multiple nodes may list the same file. When a source hash changes, the tool *reports* the node as possibly-stale — this is **information, not a regeneration trigger** (see §6).
- `content.<locale>.contentHash` — hash of the generated MDX body per locale, to detect manual edits. **Language is a content-layer property; everything above (`id`/`children`/`refs`/`sources`) is language-neutral** — component structure does not change per language. Adding a locale = adding content, never touching structure.

Why tree **and** graph (not pure tree): code dependencies are a graph, not a tree. A pure tree cannot express a component depended on from many places, nor a data-flow path that crosses branches (Discord msg → engine → omp host). So: **tree is the backbone (navigation + file layout + drill); a thin edge layer is overlaid for relationships.** They are independent — `children` says "where things live", `refs` says "how things connect".

### Content layer — MDX per (node, locale) (LLM writes naturally, diffs cleanly)

One MDX file per node per locale. Body is Markdown prose + code examples (with source file + line refs) + Mermaid text for data-flow diagrams. Frontmatter carries `locale` + the per-node structured metadata mirrored from `ir.json`. The LLM never emits HTML/CSS/SVG — Mermaid text is rendered to SVG by the compiler.

## 4. On-disk layout — flat, id-addressed storage

**Key decoupling: where a file lives ≠ where it sits in the tree.** Hierarchy lives only in `ir.json`; the filesystem is flat, stable storage.

```
content/
  ir.json                         # the only structural truth: tree + edges + hashes (language-neutral)
  nodes/
    scheduler.en.mdx
    scheduler.zh.mdx
    scheduler.triggers.en.mdx
    scheduler.triggers.cron.en.mdx
    discord-engine.en.mdx
    config.en.mdx
```

- **Filename = `<node-id>.<locale>.mdx`** (id dot/dash-segmented, human-scannable), NOT nested directories. One MDX per (node, locale).
- **Node metadata lives once in `ir.json`** (language-neutral). MDX frontmatter mirrors the per-node fields plus its own `locale` + per-locale `contentHash`.
- **Hierarchy lives only in `ir.json`.** Astro rebuilds the tree, sidebar, and locale-routed pages from it at build time. The folder is flat; the navigation is hierarchical; locales are sibling files.

Why not flat-with-no-ids / why not folder-mirrors-tree:

- **Flat with plain names** collides (`config` in two subsystems) and throws away hierarchy signal.
- **Folders mirroring the tree** means rename/move = move file = broken links + messy git history; deep drill grows very deep paths; a multi-parent cross-cutting node can only live in one folder (the pure-tree problem again); regeneration drifts paths and breaks hash matching.
- **Flat + id-addressing** gives: reorganize = edit `children` pointers in `ir.json` (no file moves, no broken links); multi-parent cross-cutting node = one file, referenced by many ids; arbitrarily deep drill without path explosion; stable filenames so hash-based regeneration just overwrites the same file with a clean diff.

## 5. The single skill

One skill, not several. There is **no distinction between "overview" and "deep-dive"** — generating a top-level component and drilling into a sub-component are the same act, differing only in where on the tree they happen. The skill governs **how to use the tools** and **the documentation style contract** — nothing about generation strategy.

Skill contents:

- **Tool usage** — when/how to call the CLI (`carto hash|diff|stale|build`), the `ir.json` format, and what each frontmatter field means / how to keep MDX frontmatter consistent with `ir.json`.
- **Style contract (the real value)** — the rules that keep output uniform and readable regardless of which node or session generated it:
  - Link components by IR `id` cross-reference, never by bare file path.
  - Data flow expressed as Mermaid; relationships surfaced as "→ related component" links from `refs`.
  - Consistent voice and a consistent section skeleton per page (responsibility → key types/functions → data flow → relationships → examples-if-needed).
  - Include a code example only when it clarifies (not for trivial glue).

**Deliberately NOT in the skill (all left to the LLM):** how many levels to generate on first creation; how deep to read source before writing; whether to read code at all; whether to leave a placeholder and fill it later; whether to rewrite a page whose sources haven't changed. The tool does not preset generation strategy — the LLM weighs accuracy vs cost per node and decides.

The generation loop, in practice: on first creation the LLM decides how broad/deep to seed the tree and writes those component nodes. Drilling means the LLM discovers/generates a node's `children` — growing another level on the tree, each child a fully-written node (or a placeholder, at the LLM's discretion). A fresh session/subagent per drill keeps context bounded (omp's `task`/subagent + `--session-dir --continue` fits this).

## 6. Incremental invalidation — information, not a trigger

Whole-file content hashing. Crucially, **`stale` is a signal the tool surfaces, not an instruction it enforces.** The tool never decides *when* to regenerate; it only reports what changed. Whether/when to rewrite a page is the LLM's (or your) call — a page may also be rewritten with unchanged sources.

Two distinct change kinds the tool distinguishes:

- **Content change** (file body edited): hash-diff → nodes whose `sources` include the changed file are reported stale. The page's rendered "may be out of date" hint turns on. Regeneration happens if/when the LLM or user chooses.
- **Structure change** (files added / removed / moved): the component set itself may change → the LLM revisits the affected part of the tree and updates `ir.json` (add/remove/re-parent nodes). No fixed "re-run Pass 1" step — the LLM decides scope.

CLI support (deterministic, zero LLM — pure fact-reporting):

- `carto hash` — recompute source + content hashes, write into `ir.json`.
- `carto diff` — compare current source hashes to `ir.json`; list changed files.
- `carto stale` — map changed files → affected node ids (via `sources`); report what changed. Reporting only — issues no regeneration.
- `carto build` — compile `content/` → static HTML.

The agent calls these to learn what changed; the skill's style contract governs how a regenerated page reads, but nothing forces regeneration.

## 7. Control plane vs read surface

Static HTML cannot call back into the agent. So:

- **The HTML is a pure read/output surface.** A node with no `children` in the IR renders a "no sub-components generated yet — ask pico to dig in" marker; a node whose `sources` changed renders a "source has changed since this was written — may be out of date" hint. Both are informational, not action buttons.
- **The agent (omp/pico) is the control plane.** Drill-down is triggered by talking to the agent in Discord/omp — the agent generates the new nodes and rebuilds. No in-page button triggers generation (that would require a server and violate the "light" goal).

## 8. Component boundaries and packaging

The tool is intentionally thin — skills + a small deterministic CLI + an Astro theme. **carto contains zero LLM-provider code** — it imports no model SDK and knows nothing about OpenAI/Copilot/Anthropic. It adapts to the host agent (omp) through exactly two interfaces:

- **① a skill** — the markdown procedure + style contract (§5) that omp's agent reads to learn how to use the CLI, the `ir.json` format, and the documentation conventions.
- **② a CLI** — the `carto` binary: `carto hash|diff|stale|build`. Pure, deterministic, no LLM, no network. The agent calls it; carto never calls the agent.

There is no API, config, or provider handshake between carto and omp — the coupling is just "a skill omp reads + a command omp runs". The agent supplies the model, the file/LSP tools, and the subagents; carto supplies structure-hashing, staleness reporting, and the Astro build.

- **Astro template** — structure layer = a content collection with a Zod-validated schema (frontmatter: id/name/parent/children/sources+hashes/refs/locale); content layer = MDX bodies; Mermaid via an Astro rehype plugin; i18n via Astro's built-in locale routing.

## 9. Known risks

1. **Component clustering is entirely the LLM's judgment (accepted, not mitigated by constraint).** How to split components — by responsibility cohesion, data-flow boundaries, not treating a god-file as one thing — is left to the LLM; the skill does NOT impose directory/crate boundaries as a hard prior. The one safety valve is that the component map lives in `ir.json` and is **hand-editable**: if a split is wrong, edit the json directly, no LLM re-run. This is "make the result correctable", not "assume the LLM clusters badly".
2. **Graph-edge accuracy is pushed onto the model (deliberate trade).** The skill does NOT mandate a parser (LSP / tree-sitter / grep) — it states the goal ("figure out what this component depends on, how data flows, what it exposes") and lets the LLM choose its means. It does NOT assume the host has an LSP. Cost: at the current model tier, edges may miss or mis-direct vs a precise LSP extraction. The bet is that models get better at this on their own — accepted, not a bug.
3. **Breadth-scan bound on huge repos (low, deferred).** Fine for pico/rift-scale repos. If a repo is large enough that even enumerating structure strains one pass, batch by top-level directory/crate and merge — future work, not now.

## 10. Resolved decisions

- **Hashing granularity: whole-file.** Line-range hashing is more precise but brittle under reformatting (rustfmt / bulk import edits shift every range → false stale). Whole-file + a `contentHash` short-circuit (regenerated MDX identical to old → don't rewrite, don't ripple) is cheaper and stable. Line-range permanently deferred unless non-reformat small-edit churn becomes a real problem.
- **`refs` edge kinds: `depends_on` + `data_flow` only.** `calls` was dropped — it overlaps `depends_on` (A calls B ≈ A depends on B) and would make the LLM waver on which to tag, hurting style uniformity. `data_flow` stays because directional flow is a distinct axis from dependency. `implements`/`configures` are NOT added preemptively — new edge kinds are driven by "the docs can't explain something", not by upfront design.
- **No node depth states, no `expanded`.** Dropped entirely (see §3). A node either exists (fully generated) or doesn't. Depth is the tree's shape, not a per-node flag.
- **Regeneration is never gated on source change.** `stale` is information, not a trigger (see §6). The LLM may rewrite any page anytime — even with unchanged sources — and may leave placeholders. Generation strategy is entirely the LLM's call and is deliberately NOT encoded in the skill.
- **Compiler: Astro + Zod-validated content collections.** Decisive reason: the structure-layer schema (id/sources/hashes/refs/parent/children/locale) is directly a Zod schema, validated at build time. MDX first-class, Mermaid via rehype, componentized sidebar. mdBook (all-Rust) rejected: its "structured Markdown directory" input model fights the flat-id + ir.json-rebuilt-tree + graph-edges + Zod-validation approach, needing more glue.
- **i18n: language is a content-layer property; the structure layer is language-neutral.** See §3/§4.

## 11. Implementation stack

- **Language: TypeScript.** Both halves — the `carto` CLI and the Astro template — are TS. One language means the structure schema is a single Zod definition consumed by both the CLI (validating `ir.json`) and the Astro content collection, eliminating any cross-language schema drift.
- **Runtime: plain Node.js.** Chosen over Bun/Deno for the widest ecosystem and lowest install friction — the tool is meant to be handed to others, who almost certainly already have Node and should not need to install a second runtime. Astro, MDX, and the rehype/Mermaid plugins are all first-class on Node with the densest community validation. (Bun would match pico's omp-host runtime and Deno would give a read-only sandbox, but neither advantage outweighs "users don't install anything extra".)
- **Package manager: pnpm.** Strict, content-addressed store, fast, good monorepo/workspace support if the CLI and Astro template end up as separate packages.
- **Schema: Zod as the single source of truth.** One `ir` schema module exported once: the CLI calls `.parse()` on `ir.json`; Astro's content collection imports the same schema. Define once, validate in both places.
- **CLI: light.** Four subcommands (`hash|diff|stale|build`) — a minimal arg parser or a small unjs-style CLI helper, not a heavy framework. Hashing via Node's `node:crypto`, file IO via `node:fs` — no third-party deps for the deterministic core.
- **Astro build: static only.** `carto build` shells out to `astro build` producing static HTML — no SSR, no server adapter (Astro as a static site builder needs no adapter). This is the most-validated Astro path.
- **Engineering conventions (ported from the Rust projects' spirit).** Strict `tsconfig` (`strict`, `noUncheckedIndexedAccess`); validate all external input at the boundary with Zod (TS's stand-in for Rust's type guarantees); pick one error-handling convention up front (throw at boundaries, TS-idiomatic) and hold it — TS drifts loose without this discipline set at project start.
