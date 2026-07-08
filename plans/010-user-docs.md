# Plan 010: Rebuild carto's self-docs around the user journey

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: this plan depends on plan 009 (the improved
> skill). Before starting, confirm 009 landed and the pipeline works:
> ```
> git diff --stat deaaa50..HEAD -- skill/SKILL.md
> grep -qF "Audience layering" skill/SKILL.md && grep -qF "Worked example" skill/SKILL.md && echo skill-improved
> pnpm install && pnpm build && pnpm exec carto --help
> ```
> If `skill/SKILL.md` does NOT contain "Audience layering" / "Worked example",
> plan **009** has not landed — **STOP** (this plan documents against the improved
> skill). If `pnpm build` fails or `carto --help` does not list the six commands,
> STOP and report.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/009-skill-user-journey.md
- **Category**: docs
- **Planned at**: commit `deaaa50`, 2026-07-08

## Why this matters

carto's own self-docs (`docs/` + `carto.json`) are both the project's canary and
its living example of what a carto doc set looks like. Today they document the
three packages' **internals** — a contributor's architecture map — and never
answer the **user's** questions: what carto is for, how a user drives it
(BYO-LLM → invoke the skill → the generation loop), what each CLI command does
*for them*, and a real example to copy. A reader trying to learn how to *use*
carto currently cannot. This plan rebuilds the self-docs against the improved
skill (plan 009), leading with a user journey and worked examples, and demotes
package internals to a contributor-facing node. The result: a doc set a new user
can actually follow, and a faithful demonstration of the skill's new user-first
discipline on real source.

## Current state (verified at `deaaa50`)

**Existing self-docs** — 3 nodes, all architecture/internals-focused:
- `docs/overview/{en,zh}.mdx` — a package-dependency map (`@carto/core` ←
  `@carto/cli`/`@carto/template`), a build-wiring mermaid. No user journey.
- `docs/core/{en,zh}.mdx` — `@carto/core` internals (schema/hash/resolver lines).
- `docs/cli/{en,zh}.mdx` — CLI *implementation* view (`sync.ts:11`, `status.ts:20`
  delegating to core) — reads like package internals, not "what each command does
  for you."
- `carto.json` at repo root registers exactly these three nodes.

This plan **replaces** that set with the user-first tree below.

**The pipeline** (all run from the repo root = the doc root; verified working):
- `pnpm exec carto sync` → fills hashes, prints `synced N node(s)`.
- `pnpm exec carto status` → prints one `state id` line per node (e.g.
  `fresh cli`); exits non-zero if any node is not fresh.
- `pnpm exec carto validate` → prints `validate: ok`; non-zero on any error.
- `pnpm exec carto build` → renders into `dist-site/` (gitignored).
- `pnpm exec carto dev` → Astro dev server, logs
  `Dev server running at http://localhost:4321`; entry page is `/overview/`
  (default locale `en` unprefixed, `zh` under `/zh/...`).

**Authoring rules you MUST follow** — read `skill/SKILL.md` in full first; it is
the authoritative guide (improved by plan 009). Key floors:
- Every node: **Intent + Mental model (3–5 concepts + one mermaid) + Code anchors
  (`path:line` on load-bearing claims)**.
- **User-facing pages additionally require a Worked example** — a real,
  reproducible example with **real command output**, never invented. (This plan's
  `getting-started` and `cli` nodes are user-facing.)
- Verify every claim against code behavior; never copy comments verbatim.
- Generate **all locales together**; translations keep every `carto:` link and
  every `path:line` anchor **verbatim** (translate prose only).

**`carto.json` / mdx mechanics** (from `skill/SKILL.md`, inlined):
- Each node: `docs/<id>/<locale>.mdx`; `id` matches `^[a-z0-9][a-z0-9-]*$`,
  globally unique. `parent` omitted = root (do NOT write `parent: null`).
- `sources[]` list `file` only (no `hash`); `carto sync` fills hashes. Paths are
  relative to the repo root.
- Link between pages with `[label](carto:<id>)`; `[](carto:<id>)` auto-fills the
  target title. Never use the `carto:<alias>/<id>` `/` form (validate rejects it).
- Every node needs an mdx per declared locale (`en`, `zh`) or `validate` fails.

## Target node tree (this is the load-bearing design — build exactly this)

Six nodes. All non-root nodes have `parent: overview`. Register them in
`carto.json` in this array order (order = sidebar/nav order).

| id | parent | audience | Covers | `sources` (real files — verify each exists) |
|---|---|---|---|---|
| `overview` | (root) | user | What carto is, who it's for, the problem it solves, and the user journey at a glance. Mermaid = the **user flow** (you + your LLM → skill → `docs/*.mdx` + `carto.json` → `carto` CLI → rendered site), NOT a package-dependency graph. Links to `carto:getting-started`, `carto:skill`, `carto:cli`, `carto:concepts`. | `skill/SKILL.md` |
| `getting-started` | `overview` | user | The zero-to-result journey: prerequisites (BYO-LLM/agent, the `carto` CLI on PATH), `carto init` to scaffold, invoke the skill with a scope, what the skill does at each step (the `read code → write mdx → edit carto.json → sync → validate` loop), then a **complete worked example** run with real output. | `skill/SKILL.md`, `packages/cli/src/commands/init.ts` |
| `skill` | `overview` | user | The authoring skill as carto's primary interface: the BYO-LLM model (you bring the agent; carto is the skill + CLI + template), the two modes (`document` / `refresh`), how the agent decides node structure and what each page must contain, and the non-negotiable verification disciplines. This is the node that answers "what do I actually invoke, and what does it do?" | `skill/SKILL.md` |
| `cli` | `overview` | user | The six `carto` commands as a **user reference**: for each of `init`, `status`, `sync`, `validate`, `dev`, `build` — what it does *for you*, when you run it, and an **example invocation with its real output**. Frame around usage, not internal delegation. | `packages/cli/src/commands/init.ts`, `.../status.ts`, `.../sync.ts`, `.../validate.ts`, `.../dev.ts`, `.../build.ts` |
| `concepts` | `overview` | user | The vocabulary a user needs: the `carto.json` manifest (nodes, `id` vs `slug` vs `parent`), the four staleness classes (fresh / stale / unsynced / missing) and how hashing drives them, and `carto:` links + `path:line` code anchors. | `packages/core/src/schema.ts`, `packages/core/src/status.ts`, `packages/core/src/resolver.ts`, `packages/core/src/tree.ts` |
| `internals` | `overview` | contributor | For people hacking on carto itself: how the three packages are built — `@carto/core` (the library), `@carto/cli` (citty wiring over core), `@carto/template` (materialize id-based docs → Astro/Starlight routing). This absorbs the old `core`/`cli` internal detail, explicitly marked as contributor-facing. | `packages/core/src/index.ts`, `packages/cli/src/index.ts`, `packages/template/src/materialize.ts`, `packages/template/src/site-config.ts` |

Notes:
- The old `core` node id is **retired** (its content moves into `concepts` +
  `internals`). Delete `docs/core/`.
- `overview` and `cli` ids are **kept but their content is rewritten** to the
  audience/coverage in the table.
- Every `sources[].file` above exists at `deaaa50`; if any path differs, find the
  real equivalent by reading `packages/`, or STOP if you cannot.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install / build | `pnpm install && pnpm build` | exit 0; `carto` bin usable |
| Fill hashes | `pnpm exec carto sync` | `synced 6 node(s)`, exit 0 |
| Freshness | `pnpm exec carto status` | all six `fresh`, exit 0 |
| Validate | `pnpm exec carto validate` | `validate: ok`, exit 0 |
| Build site | `pnpm exec carto build` | exit 0; `dist-site/` produced |
| Preview (capture output) | `pnpm exec carto dev` | logs `http://localhost:4321`; STOP it after |
| E2E regression | `pnpm e2e` | exit 0 |
| Comment lint | `pnpm lint` | exit 0 |

(All `carto` commands run from the repo root.)

## Suggested executor toolkit

- Read `skill/SKILL.md` fully before writing — it is the authoritative,
  plan-009-improved checklist (audience layering, getting-started node, worked
  examples on user pages).
- Read the real source for each node's `sources` before writing its anchors —
  cite real line numbers, verified against the files, not guesses.
- To capture **real** worked-example output, actually run the commands in this
  worktree (it is built) and paste their true output — e.g. `carto sync` →
  `synced 6 node(s)`, `carto status` → the `fresh <id>` lines, `carto validate`
  → `validate: ok`. Never invent output.

## Scope

**In scope** (create/modify only these):
- `carto.json` (rewrite the `nodes` array to the six-node tree above; `sources`
  = `file` only, no hash — `sync` fills them)
- `docs/overview/{en,zh}.mdx` (rewrite)
- `docs/getting-started/{en,zh}.mdx` (create)
- `docs/skill/{en,zh}.mdx` (create)
- `docs/cli/{en,zh}.mdx` (rewrite)
- `docs/concepts/{en,zh}.mdx` (create)
- `docs/internals/{en,zh}.mdx` (create)
- Delete `docs/core/en.mdx` and `docs/core/zh.mdx` (retired node)

**Out of scope** (do NOT touch):
- `packages/**`, `skill/SKILL.md`, `scripts/**`, `package.json`, `pnpm-lock.yaml`,
  `README.md` (do not edit or register it as a source — it is not present on this
  branch; reference it in prose only if needed).
- The template's HTML/routing — if `carto build` fails on well-formed mdx, STOP
  and report; never hand-author HTML.
- `plans/**` beyond your own status row.

## Git workflow

- Branch: `advisor/010-user-docs` (you are already on it if dispatched).
- Commit per logical unit (manifest + user pages, then contributor page), or a
  single `docs(self): rebuild self-docs around the user journey` — Conventional
  Commits, imperative, lowercase, no trailing period.
- `carto sync` rewrites `carto.json`'s `updated_at`/hashes each run; commit the
  synced manifest. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm dependency 009 + working pipeline

Run the drift-check block. `skill/SKILL.md` must contain "Audience layering" and
"Worked example"; `pnpm build` and `carto --help` must succeed.

**Verify**: skill improved + build green + six commands. If not, **STOP** (009
incomplete or the build is broken).

### Step 2: Write `carto.json` with the six-node tree

Rewrite the `nodes` array to exactly the six nodes in the target-tree table
(ids, parents, sources as listed; `sources` carry `file` only). Keep `version`,
`locales` (`["en","zh"]`), `defaultLocale` (`en`).

**Verify**: `pnpm exec carto status` → exits **non-zero**, lists all six nodes as
**unsynced** (no hashes yet). This is expected pre-sync.

### Step 3: Author the 12 mdx pages (6 nodes × en/zh)

Following `skill/SKILL.md`, write each node per its audience/coverage in the
target-tree table. Rules that MUST hold:
- Every page: `title` frontmatter, Intent + Mental model (one mermaid) + Code
  anchors with **real** `path:line` numbers (verify against source).
- `overview`, `getting-started`, `skill`, `cli`, `concepts` are **user-facing**;
  `getting-started` and `cli` MUST each contain a **Worked example with real
  command output** (run the commands; paste true output). `overview` links to
  `carto:getting-started`, `carto:skill`, `carto:cli`, `carto:concepts`.
- `internals` is contributor-facing — say so in its Intent.
- zh pages: translate prose + `title`; keep every `carto:` link and `path:line`
  anchor verbatim.
- At least one `carto:<id>` link and multiple `path:line` anchors across the set.

**Verify**: `ls docs/overview docs/getting-started docs/skill docs/cli docs/concepts docs/internals` each shows `en.mdx` and `zh.mdx` (12 files); `docs/core` is gone.

### Step 4: Sync, validate, build

```
pnpm exec carto sync
pnpm exec carto status
pnpm exec carto validate
pnpm exec carto build
```

**Verify**:
- `sync` → `synced 6 node(s)`, exit 0; `grep -c '"hash"' carto.json` ≥ 12.
- `status` → all six `fresh`, exit 0.
- `validate` → `validate: ok`, exit 0 (a `carto:` link to a missing id fails here;
  fix the link/id and re-run sync+validate).
- `build` → exit 0, `dist-site/` produced. If build fails with a routing/content
  error on well-formed mdx, **STOP** (template issue) — do not hand-author HTML.

### Step 5: Regression + gates

```
pnpm e2e
pnpm lint
```

**Verify**:
- `pnpm e2e` → exit 0 (the smoke test still passes end to end with the new tree),
  and `git diff -- packages/` is empty afterward (the staleness demo restores its
  source).
- `pnpm lint` → exit 0 (no code comments; note fenced *shell* examples in mdx are
  Markdown, not linted code, but do not put `//` comments in any fenced **code**
  that the gate scans — mdx is not scanned, so this is informational).
- `git status` shows only in-scope files changed (`carto.json`, `docs/**`).

## Test plan

- No unit code. Verification is the pipeline: `sync` (6 nodes), `status` (all
  fresh), `validate` (`validate: ok`), `build` (`dist-site/`), and `pnpm e2e`
  green with the six-node manifest.
- Content check (the point of this plan): `getting-started` and `cli` each contain
  a real worked example. Machine-checkable proxy — the pages contain real output
  tokens the executor actually produced, e.g.:
  ```
  grep -qF "synced 6 node(s)" docs/getting-started/en.mdx || grep -qF "validate: ok" docs/getting-started/en.mdx
  ```
  (at least one real-output token present on each user page's example).
- Structural: `carto validate` is the authority that every node has both locales
  and every `carto:` link resolves.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `carto.json` has exactly six nodes: `overview` (root), `getting-started`,
      `skill`, `cli`, `concepts`, `internals` (last five `parent: overview`)
- [ ] `docs/{overview,getting-started,skill,cli,concepts,internals}/{en,zh}.mdx`
      all exist (12 files); `docs/core/` is deleted
- [ ] Every mdx has `title` frontmatter; the set has ≥1 `carto:<id>` link and
      multiple `path:line` anchors; zh pages preserve links/anchors verbatim
- [ ] `docs/getting-started/en.mdx` and `docs/cli/en.mdx` each contain a worked
      example with a **real** command-output token (e.g. `synced 6 node(s)`,
      `validate: ok`, a `fresh` status line, or `http://localhost:4321`)
- [ ] `pnpm exec carto sync` → `synced 6 node(s)`; `carto status` all `fresh`;
      `carto validate` → `validate: ok`; `carto build` exit 0 with `dist-site/`
- [ ] `pnpm e2e` exits 0; `git diff -- packages/` empty; `pnpm lint` exit 0
- [ ] No files outside the in-scope list changed (`git status`)
- [ ] `plans/README.md` status row updated (unless a reviewer owns the index)

## STOP conditions

Stop and report back (do not improvise) if:

- `skill/SKILL.md` lacks the plan-009 additions ("Audience layering" / "Worked
  example") → plan 009 is not DONE.
- `pnpm build` fails or `carto --help` lacks the six commands → the toolchain is
  broken (plans 003/004).
- `carto build` fails with a routing/content-collection error on well-formed mdx
  → template (plan 004) issue; report, do not hand-author HTML.
- A registered `sources[].file` does not exist and you cannot find the real
  equivalent.
- `carto validate` cannot be made to pass without inventing content or a link to a
  node you did not create.
- A verification fails twice after a reasonable fix.

## Maintenance notes

For whoever owns this after it lands:

- This is now the reference example of the plan-009 skill discipline: a user-first
  tree with worked examples. If the skill's floors change again, refresh these
  pages to match.
- `path:line` anchors and the worked-example output are plain text and are NOT
  validated — they drift as `packages/` lines move or CLI output wording changes.
  A reviewer should spot-check a couple against real files/output; refresh on
  regeneration.
- The self-docs are the canary: when carto's packages change, `carto status` goes
  stale on the affected nodes — re-invoke the skill (or hand-refresh) and re-sync.
- Reviewer scrutiny: confirm `getting-started`/`cli` examples use **real** output
  (run them), the zh pages preserve links/anchors verbatim, `internals` is clearly
  marked contributor-facing, and only in-scope files changed.
