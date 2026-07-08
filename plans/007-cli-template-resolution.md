# Plan 007: Make `carto build`/`dev` resolve the bundled template

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 69fa682..HEAD -- packages/cli/package.json packages/template/package.json packages/cli/src/commands/dev.ts
> ```
> If any of those three files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch (especially if the `dependencies`/`exports` blocks already differ),
> treat it as a STOP condition — the defect may already be fixed or the shape
> may have moved.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-cli-package.md (DONE), plans/004-astro-template.md (DONE)
- **Category**: bug
- **Planned at**: commit `69fa682`, 2026-07-08

## Why this matters

`carto build` and `carto dev` are two of the six shipped CLI commands, but
**both are dead on arrival**: they exit 1 with `@carto/template is not
available; run pnpm build first` even after a clean `pnpm build`. A user who
follows the documented flow (author docs → `carto build`) hits a hard wall and
cannot render a site at all. This was invisible until now because the CLI's
unit tests drive each command's `run` in temp dirs and never spawn the real
template resolution; the first genuine end-to-end `carto build` (plan 006)
surfaced it. Two independent packaging defects combine to break resolution;
this plan fixes both and adds the regression that would have caught them.

## Current state

The CLI locates the bundled template at runtime by resolving the template
package's `package.json`, then spawns the template's `build:site`/`dev` script
in that directory.

`packages/cli/src/commands/dev.ts:6-13` (the resolver — do NOT change this
file; it is correct, the packaging around it is not):
```ts
function templateDir(): string | null {
  try {
    const require = createRequire(import.meta.url)
    return dirname(require.resolve('@carto/template/package.json'))
  } catch {
    return null
  }
}
```
`runTemplateScript` (same file, lines 15-32) calls `templateDir()`; when it
returns `null` it prints `@carto/template is not available; run pnpm build
first` and exits 1. `build.ts` and `dev.ts`'s `devCommand` both go through this
path.

Two defects make `require.resolve('@carto/template/package.json')` throw:

**Defect A — the CLI does not depend on the template.**
`packages/cli/package.json:20-23` today:
```json
  "dependencies": {
    "@carto/core": "workspace:*",
    "citty": "^0.2.2"
  },
```
There is no `@carto/template` entry. Under pnpm's isolated (non-hoisted)
`node_modules`, a package can only resolve modules it declares. Because the CLI
never declares `@carto/template`, `@carto/template` is not linked into
`packages/cli/node_modules`, so resolution fails with `MODULE_NOT_FOUND`. The
template is a genuine **runtime** dependency of the `build`/`dev` commands (an
end user running the published `carto` needs it installed), so it belongs in
`dependencies`, not `devDependencies`.

**Defect B — the template's `exports` map hides `package.json`.**
`packages/template/package.json:8-13` today:
```json
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
```
Node's `exports` field is an encapsulation boundary: once present, any subpath
not listed is unresolvable. So even after Defect A is fixed and the package is
linked, `require.resolve('@carto/template/package.json')` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED` — `./package.json` is not an exported subpath.
The fix is to add `"./package.json": "./package.json"` to the `exports` map (the
standard idiom for letting tooling resolve a package's own manifest).

Both fixes are required; fixing only one leaves `carto build` red (verified: A
alone → `ERR_PACKAGE_PATH_NOT_EXPORTED`; B alone → `MODULE_NOT_FOUND`; both →
builds 7 pages successfully).

**Repo conventions:**
- Workspace deps use `"workspace:*"` (see `packages/cli/package.json`'s
  `@carto/core` entry and `packages/template/package.json`'s `@carto/core`).
- Zero code comments (enforced by `pnpm lint` → `scripts/lint-comments.sh`).
  `package.json` files carry no comments; nothing to add here anyway.
- Adding a dependency regenerates `pnpm-lock.yaml`; commit it, never hand-edit.
- CI defaults `frozen-lockfile` on, so a plain `pnpm install` after editing a
  `package.json` may fail with `ERR_PNPM_OUTDATED_LOCKFILE`; use
  `pnpm install --no-frozen-lockfile` locally to refresh the lockfile.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (refresh lock) | `pnpm install --no-frozen-lockfile` | exit 0 |
| Build all packages | `pnpm build` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit tests | `pnpm test` | all pass |
| Comment lint | `pnpm lint` | exit 0 |
| Probe resolution | see Step 3 | prints the resolved path |

## Scope

**In scope** (the only files you create/modify):
- `packages/cli/package.json` (add one `dependencies` entry: `@carto/template`)
- `packages/template/package.json` (add one `exports` subpath: `./package.json`)
- `pnpm-lock.yaml` (regenerated by `pnpm install`; commit, do not hand-edit)
- `packages/cli/src/commands/dev.test.ts` **or** an existing CLI test file — add
  the regression test described in "Test plan" (create the file only if there is
  no existing `dev`/`build` command test to extend)

**Out of scope** (do NOT touch, even though they look related):
- `packages/cli/src/commands/dev.ts` and `build.ts` — the resolver logic is
  correct; the bug is in packaging, not code. Do not change the resolver, the
  error string, or add fallback path-guessing.
- `packages/template/src/**`, `astro.config.mjs`, the template's other scripts.
- `carto.json`, `docs/**`, `scripts/**`, the root `package.json` — owned by
  other plans.
- `@carto/core`.

## Git workflow

- Branch: `advisor/007-cli-template-resolution`
- Commit per logical unit; Conventional Commits, imperative, lowercase, no
  trailing period — e.g.
  `fix(cli): depend on @carto/template so carto build can resolve it` and
  `fix(template): export package.json for runtime resolution`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Declare the template as a CLI runtime dependency (Defect A)

In `packages/cli/package.json`, add `@carto/template` to the **`dependencies`**
object (not `devDependencies`), mirroring the existing `@carto/core` entry:

```json
  "dependencies": {
    "@carto/core": "workspace:*",
    "citty": "^0.2.2",
    "@carto/template": "workspace:*"
  },
```

**Verify**: `grep -q '"@carto/template": "workspace:\*"' packages/cli/package.json && echo ok` → `ok`.

### Step 2: Export `package.json` from the template (Defect B)

In `packages/template/package.json`, add a `./package.json` subpath to the
`exports` object:

```json
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
```

**Verify**: `node -e "const e=require('./packages/template/package.json').exports; process.exit(e['./package.json']?0:1)" && echo ok` → `ok`.

### Step 3: Reinstall, rebuild, and confirm resolution

```
pnpm install --no-frozen-lockfile
pnpm build
```
Both exit 0. Then probe that the CLI's runtime resolver can now find the
template manifest (this reproduces exactly what `dev.ts:templateDir()` does):

```
node --input-type=module -e "import{createRequire}from'node:module';import{pathToFileURL}from'node:url';const r=createRequire(pathToFileURL(process.cwd()+'/packages/cli/dist/commands/dev.js'));console.log(r.resolve('@carto/template/package.json'))"
```

**Verify**: the probe prints an absolute path ending in
`packages/template/package.json` and exits 0 (no `ERR_PACKAGE_PATH_NOT_EXPORTED`
/ `MODULE_NOT_FOUND`).

### Step 4: End-to-end confirmation with a real `carto build`

The CLI needs a doc root with a `carto.json` to build. Use the template's own
fixture, which is a complete mini doc set:

```
cd packages/template/tests/fixtures/mini
pnpm exec carto build
cd -
```

(If `pnpm exec carto` is not found from that directory, run instead from the
repo root: `node packages/cli/dist/index.js build` with the fixture as cwd — but
the fixture dir is inside the workspace, so `pnpm exec carto build` should
resolve the bin.)

**Verify**: `carto build` exits 0 and prints Astro's `[build] Complete!` after
rendering pages. If it still exits 1 with `@carto/template is not available`,
**STOP** — one of the two fixes did not take; re-check Steps 1–3.

### Step 5: Add the regression test

Add a test that asserts the template package is resolvable from the CLI's
runtime module context — the exact thing both defects broke. Model it on the
existing CLI command tests under `packages/cli/src/commands/*.test.ts` (same
vitest style, `describe`/`it`, temp-dir helpers if present). The test must:

- resolve `@carto/template/package.json` via `createRequire` anchored at the
  built `dev.js` (or at `import.meta.url` of a module inside `@carto/cli`), and
  assert it returns a path — failing loudly with `ERR_PACKAGE_PATH_NOT_EXPORTED`
  or `MODULE_NOT_FOUND` if either defect regresses.

If the test needs the packages built first, note that in a comment-free way the
test itself can't express — instead make the test resolve against source
(`import.meta.resolve` / `createRequire(import.meta.url).resolve`) so it does not
depend on `dist/` existing. Keep the assertion about resolvability, not about
spawning a full Astro build (too slow/heavy for unit tests).

**Verify**: `pnpm test` → all pass, including the new test. Confirm the test
actually fails if the fix is absent by reasoning about it (do not commit a
broken state) — the assertion must reference `@carto/template/package.json`
resolution, not a trivially-true check.

### Step 6: Final gates

```
pnpm typecheck   # exit 0
pnpm test        # all pass incl. new regression
pnpm lint        # exit 0 (no comments)
```

**Verify**: all exit 0; `git status` shows only the in-scope files changed.

## Test plan

- **New regression**: a resolvability test in the CLI package (extend an
  existing `packages/cli/src/commands/*.test.ts` or create
  `packages/cli/src/commands/template-resolution.test.ts`). It asserts
  `require.resolve('@carto/template/package.json')` succeeds from the CLI's
  module context. This is the smallest check that fails when either Defect A
  (missing dep) or Defect B (missing export) regresses.
- **Existing suite**: `pnpm test` must stay green — the packaging change should
  not affect any current test.
- **Manual E2E** (not a unit test): `carto build` against
  `packages/template/tests/fixtures/mini` renders a site (Step 4). Plan 006's
  `pnpm e2e` becomes the standing end-to-end guard once this unblocks it.
- **Verification**: `pnpm test` → all pass including the new test.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -q '"@carto/template": "workspace:\*"' packages/cli/package.json` (in `dependencies`)
- [ ] `packages/template/package.json` `exports` has a `"./package.json"` subpath
- [ ] `pnpm build` exits 0
- [ ] The Step 3 resolution probe prints an absolute path to
      `packages/template/package.json` and exits 0
- [ ] `carto build` against `packages/template/tests/fixtures/mini` exits 0 and
      completes an Astro build
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm lint` all exit 0; a new regression
      test asserting template resolvability exists and passes
- [ ] `pnpm-lock.yaml` reflects the new CLI→template link
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (unless a reviewer owns the index)

## STOP conditions

Stop and report back (do not improvise) if:

- After both fixes and a clean `pnpm build`, `carto build` still exits 1 with
  `@carto/template is not available` — there is a third resolution layer this
  plan did not anticipate; report the probe output from Step 3.
- The `dependencies`/`exports` blocks in the two `package.json` files do not
  match the "Current state" excerpts (the code drifted; the fix may already be
  in place — verify before editing).
- Adding the export or dependency breaks an existing test (`pnpm test` was green
  before, red after) — report which test and why; do not delete or weaken it.
- The fix appears to require editing `dev.ts`/`build.ts` resolver logic or any
  other out-of-scope file.

## Maintenance notes

For whoever owns this after it lands:

- **Why a runtime `dependency`, not `devDependency`:** the published `carto`
  binary spawns the template's `build:site`/`dev` scripts at run time, so an end
  user's install must include `@carto/template`. If the CLI is ever published to
  npm, confirm `@carto/template` is published too (or bundled), or `carto build`
  breaks for external users exactly as it did here.
- **The `./package.json` export is load-bearing:** any future rewrite of the
  template's `exports` map must keep the `"./package.json"` subpath, or runtime
  resolution regresses. The Step 5 test guards this.
- **Reviewer scrutiny:** confirm the dep landed in `dependencies` (not
  `devDependencies`), the export subpath is present, `pnpm test` is green with
  the new regression, and no resolver code in `dev.ts`/`build.ts` was touched.
- This plan unblocks **plan 006** (its `carto build` / `pnpm e2e` step). Run 006
  to completion after this lands.
