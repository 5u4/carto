# Plan 008: Add a root README with setup, preview, and CLI usage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat deaaa50..HEAD -- package.json packages/cli/src/commands/dev.ts packages/template/package.json carto.json
> test -f README.md && echo README-EXISTS || echo no-README
> ```
> If `README.md` already exists at the repo root, or if the commands/behavior
> below no longer match the live code (the CLI command set, the dev server URL,
> the built route shape), treat it as a STOP condition and report — do not
> document a moving target.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (all packages already shipped and merged to `main`)
- **Category**: docs
- **Planned at**: commit `deaaa50`, 2026-07-08

## Why this matters

The repo has **no root `README.md`** (it was removed in `22ac689`). A new
contributor cloning carto has no single entry point telling them what it is, how
to install it, or how to preview the docs — and the install has a real,
non-obvious trap (below) that will make `pnpm exec carto` fail on a fresh clone
if they follow the naive `install → build` order. This README captures the exact
working setup + preview flow so nobody rediscovers the trap by hitting the error.

## Current state (all facts below verified against the live repo at `deaaa50`)

**No README exists.** `ls README*` at the repo root returns nothing.

**What carto is** (summarize, don't copy verbatim — source: `plans/README.md`
lines 9–19 and `skill/SKILL.md`): a tool that generates *sustainably-evolving*
documentation for a codebase — a top-down mental-model map (not API reference)
whose pages carry machine-checkable anchors back to source, so stale pages are
detectable and regenerable. TypeScript pnpm monorepo:
- `@carto/core` — zod schema + content hashing + node tree + `carto:` link resolver.
- `@carto/cli` — the `carto` binary (six citty commands), `packages/cli/`.
- `@carto/template` — bundled Astro 7 + Starlight site, `packages/template/`.

**Prerequisites**: Node ≥ 20 (no `engines` field pins it; the maintainer runs
v22), pnpm (repo pins `pnpm@10.13.1` via `packageManager` in `package.json`).

**The setup trap (the load-bearing reason this README exists — verified in a
clean worktree):** the `carto` bin target is `packages/cli/dist/index.js`
(`packages/cli/package.json` `bin.carto`). pnpm links a workspace package's bin
into the consumer's `node_modules/.bin` **at install time**, but on a fresh
clone `dist/` does not exist yet, so the first `pnpm install` silently skips the
bin link (benign warning) and does **not** retry after a later build. Result:
after `pnpm install && pnpm build`, `pnpm exec carto` fails with
`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "carto" not found`. A **second
`pnpm install`** (now that `dist/index.js` exists) links the bin. Verified clean
sequence that ends with a working `carto`:
```
pnpm install    # deps; carto bin NOT yet linked (dist/ absent)
pnpm build      # compiles core, cli, template -> creates packages/cli/dist
pnpm install    # links the carto bin now that its target exists
```
After the second install, `test -e node_modules/.bin/carto` succeeds and
`pnpm exec carto --help` lists the six commands.

**The CLI surface** (`packages/cli/src/index.ts` — six citty subcommands):
`init`, `status`, `sync`, `validate`, `dev`, `build`. `carto --help` prints:
`USAGE carto init|status|sync|validate|dev|build`. Each command reads
`carto.json` from `process.cwd()`, so **all `carto` commands must be run from the
doc root** (here, the repo root — the directory containing `carto.json`).

**Preview** (`carto dev`, `packages/cli/src/commands/dev.ts`): spawns the
template's `dev` script (`node ./dist/materialize.js && astro dev`) with
`CARTO_ROOT=process.cwd()`. The Astro dev server runs at
**http://localhost:4321** (`packages/template/astro.config.mjs` sets no custom
port). Verified live: the server logs
`Dev server running at http://localhost:4321`.

**Entry URL (verified against a real `carto build`):** the default locale (`en`)
is **unprefixed**; `zh` is prefixed. Bare `/` and `/en/` both 404. The real
routes are:
- `http://localhost:4321/overview/` — the overview page (en; this is the entry point)
- `http://localhost:4321/overview/core/`, `.../overview/cli/`
- `http://localhost:4321/zh/overview/` (+ `/zh/overview/core/`, `/zh/overview/cli/`)

URLs come from the `carto.json` slug chain (`overview` is the root node, `core`
and `cli` are its children), never from file paths.

**Production build** (`carto build`): renders the static site into
`./dist-site/` (gitignored). Preview a built site with
`pnpm --filter @carto/template exec astro preview`.

**Other CLI commands** (for the usage section — behavior verified in the code):
- `carto sync` — recompute + write every source hash; refresh `updated_at`.
- `carto status` — print each node's freshness; **non-zero exit if any node is
  not fresh**, 0 if all fresh.
- `carto validate` — zod schema + id/slug uniqueness + parent cycles + link
  resolution; non-zero on any error.
- `carto init` — scaffold a starter `carto.json` + `docs/`.

**Repo conventions to honor:**
- Zero code comments (`scripts/lint-comments.sh`, run via `pnpm lint`). A README
  is Markdown, not code, so it is unaffected — but do NOT add comments to any
  code/JSON while working.
- `pnpm-lock.yaml` is committed; this plan does not touch dependencies.
- Existing docs style: `plans/*.md` and `skill/SKILL.md` use plain GitHub
  Markdown with fenced code blocks and tables. Match that (no HTML, no badges
  unless trivially correct).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Build all packages | `pnpm build` | exit 0 |
| Link carto bin | `pnpm install` (second run, after build) | exit 0; `node_modules/.bin/carto` exists |
| CLI help | `pnpm exec carto --help` | lists the six commands |
| Preview | `pnpm exec carto dev` | Astro dev server at http://localhost:4321 |
| Comment lint | `pnpm lint` | exit 0 |
| Markdown render check | open `README.md` / eyeball | headings, code fences, tables render |

## Scope

**In scope** (the only file you create):
- `README.md` (create, at repo root)

**Out of scope** (do NOT touch):
- Every existing file. This plan adds one new Markdown file and nothing else.
- Do not modify `package.json` to "fix" the double-install trap — documenting it
  is this plan's job; changing the install flow is a separate concern with its
  own tradeoffs (a `prepare`/`postinstall` build hook changes CI behavior).
- `plans/**` beyond your own status row.

## Git workflow

- Branch: `advisor/008-readme` (you are already on it if a reviewer dispatched you).
- Single commit; Conventional Commits, imperative, lowercase, no trailing period —
  e.g. `docs(readme): add setup, preview, and cli usage guide`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `README.md`

Create `README.md` at the repo root with these sections, using the verified
facts from "Current state" (adapt wording; keep it tight and skimmable):

1. **Title + one-paragraph intro** — what carto is (mental-model docs anchored to
   source, staleness-detectable). One line naming the three packages.
2. **Prerequisites** — Node ≥ 20, pnpm (note the repo pins `pnpm@10.13.1`).
3. **Setup** — the exact three-command sequence, with a one-line note on WHY the
   second `pnpm install` is needed (bin links at install time; the `carto` bin
   target `packages/cli/dist/index.js` only exists after `pnpm build`). Include
   the exact error a reader sees if they skip it
   (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "carto" not found`) so it's
   greppable.
4. **Preview the docs** — `pnpm exec carto dev` run from the repo root, then open
   **http://localhost:4321/overview/** (note: default-locale `en` is unprefixed,
   `zh` lives under `/zh/overview/`; bare `/` 404s). One line that all `carto`
   commands must run from the repo root (the dir with `carto.json`).
5. **CLI commands** — a short table of the six commands (`init`, `status`,
   `sync`, `validate`, `dev`, `build`) with one-line descriptions and the
   `carto status` non-zero-when-stale note.
6. **Build the static site** — `pnpm exec carto build` → `./dist-site/`
   (gitignored); preview with `pnpm --filter @carto/template exec astro preview`.
7. **Project layout / where to look next** — a few bullets: `packages/core`,
   `packages/cli`, `packages/template`, `skill/SKILL.md` (the doc-authoring
   guide), `docs/` + `carto.json` (carto's own self-docs), `plans/` (the
   implementation plans). Mention `pnpm e2e` as the end-to-end smoke test.

Keep code blocks copy-pasteable and run from the repo root. Do not invent flags
or commands not listed above; if you think one is missing, verify it exists in
`packages/cli/src/commands/` first, and if unsure, leave it out.

**Verify**: `test -f README.md && echo ok` → `ok`; the file contains the strings
`pnpm exec carto dev`, `http://localhost:4321`, and all six command names.

### Step 2: Verify the documented setup actually works end to end

From a state where the repo is installed and built (the worktree you're in),
confirm each command block in the README runs as written:
- `pnpm exec carto --help` lists the six commands.
- `pnpm exec carto dev` starts and logs `http://localhost:4321` (then stop it:
  `pnpm --filter @carto/template exec astro dev stop`, or Ctrl-C / kill the
  process — do not leave a server running).
- `pnpm exec carto build` exits 0 and produces `dist-site/`.

If the fresh-clone setup sequence in the README does not actually yield a working
`carto` bin (e.g. the second `pnpm install` does not link it), **STOP** and
report — the documented flow must be real.

**Verify**: the three commands above behave as the README claims.

### Step 3: Final gate

```
pnpm lint    # exit 0 — you added no code comments
```

**Verify**: `pnpm lint` exits 0; `git status` shows only `README.md` added.

## Test plan

- No code, no unit tests. The "test" is Step 2: every command block in the README
  is executed and behaves as documented (help lists six commands; dev serves on
  4321; build produces `dist-site/`).
- Structural check: `pnpm lint` stays green (no comments introduced anywhere).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `README.md` exists at the repo root and is the only new/changed file
      (`git status`)
- [ ] It documents the three-step setup (`install` → `build` → `install`) with
      the reason for the second install, and contains the literal error string
      `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`
- [ ] It contains `pnpm exec carto dev`, `http://localhost:4321`, the entry URL
      `http://localhost:4321/overview/`, and all six command names
      (`init`, `status`, `sync`, `validate`, `dev`, `build`)
- [ ] Every command block runs from the repo root as written (verified in Step 2)
- [ ] `pnpm lint` exits 0
- [ ] `plans/README.md` status row updated (unless a reviewer owns the index)

## STOP conditions

Stop and report back (do not improvise) if:

- `README.md` already exists at the repo root (the repo changed since `deaaa50`).
- The documented fresh-clone setup does not actually produce a working `carto`
  bin, or `carto dev` does not serve on `http://localhost:4321` — the facts have
  drifted from what this plan verified; report the mismatch rather than writing
  around it.
- The CLI no longer exposes exactly the six commands listed.
- Writing the README appears to require editing any other file.

## Maintenance notes

For whoever owns this after it lands:

- **The setup trap is the fragile fact.** If the build/install flow ever changes
  (e.g. a `prepare` hook is added so a single `pnpm install` links the bin), the
  Setup section must be updated — and at that point the double-install note
  should be removed, not left stale.
- The entry URL and route shape (`/overview/`, `/zh/overview/`) come from
  `carto.json`'s slug chain. If the self-docs' node tree is restructured, the
  example URLs in the README will drift — refresh them from a real `carto build`
  route listing.
- Reviewer scrutiny: confirm every command block was actually run (not just
  transcribed), the port and entry URL are correct, and no code comments were
  introduced (`pnpm lint` green).
