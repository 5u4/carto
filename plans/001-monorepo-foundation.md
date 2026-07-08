# Plan 001: Stand up the carto pnpm + TypeScript monorepo skeleton (tooling green, no feature logic)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 442f9de..HEAD -- package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts scripts packages .gitignore`
> This is a greenfield build: at commit `442f9de` the repo contains only
> `AGENTS.md`, `.gitignore`, `skills-lock.json`, and `.agents/skills/`. None of
> the in-scope paths above (except `.gitignore`) exist yet. If the diff shows any
> of `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
> `vitest.config.ts`, `scripts/`, or `packages/` already present, someone has
> already started the foundation — STOP and reconcile with the live tree before
> proceeding. The pre-existing `.gitignore` appearing in the diff is expected.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `442f9de`, 2026-07-08

## Why this matters

carto is a from-scratch TypeScript monorepo (three internal packages —
`@carto/core`, `@carto/cli`, `@carto/template` — plus a distributable skill). Every
other plan (002–006) adds real logic *inside* skeletons this plan creates, and
each depends on a fixed set of root scripts (`build`, `typecheck`, `test`,
`lint`) being present and green. If the skeleton, the shared TypeScript config,
the vitest wiring, or the comment-lint gate is wrong or missing, every downstream
plan is blocked or builds on sand. This plan produces a **working, empty**
workspace: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and
`pnpm lint` all exit 0, `@carto/cli` resolves `@carto/core` across the workspace,
and **zero feature logic** exists — only placeholder exports. That gives 002–006
a verified starting line and a comment gate that keeps the repo rule enforced from
commit one.

## Current state

The repo is essentially empty. It contains only:

- `AGENTS.md` — the engineering rules every executor must honor (see the two hard
  rules inlined below).
- `.gitignore` — already populated (full content inlined in Step 8).
- `skills-lock.json` — skill tooling metadata; **out of scope, do not touch**.
- `.agents/skills/` — advisor tooling; **out of scope, do not touch**.

There is **no** `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`,
`packages/`, `scripts/`, or `vitest.config.ts` yet. You are creating all of them.

### Authoritative target (the fixed design you must build toward)

This is the settled, frozen design for this repo. Treat every name, path, and
command below as fixed — do not invent alternatives.

**Tech stack (fixed):** TypeScript single stack; Node ≥ 20; package manager
**pnpm** (workspace); tests with **vitest** (`*.test.ts` beside sources). Internal
packages: `@carto/core` (shared library), `@carto/cli` (binary `carto`, later
built with `citty`), `@carto/template` (later an Astro 7 + Starlight site). This
plan creates only empty skeletons of the three — **no** citty, Astro, or Starlight
dependencies yet (those arrive in plans 003 and 004).

**Target monorepo layout after this plan (only the parts this plan creates):**

```
carto/                          (repo root = pnpm workspace root)
├── package.json                (private root; scripts: build/typecheck/test/lint)
├── pnpm-workspace.yaml         (packages: "packages/*")
├── tsconfig.base.json          (shared compiler options; packages extend it)
├── vitest.config.ts            (root vitest config; includes packages/**/*.test.ts)
├── .gitignore                  (already present; verify in Step 8)
├── scripts/
│   └── lint-comments.sh        (the comment gate; full body in Step 3)
└── packages/
    ├── core/                   (@carto/core)
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tsconfig.build.json
    │   └── src/
    │       ├── index.ts        (placeholder: export const version = '0.0.0')
    │       └── index.test.ts   (the trivial vitest smoke test)
    ├── cli/                    (@carto/cli; bin name: carto)
    │   ├── package.json        (bin.carto -> dist/index.js; deps @carto/core)
    │   ├── tsconfig.json
    │   ├── tsconfig.build.json
    │   └── src/
    │       └── index.ts        (imports version from @carto/core — proves resolution)
    └── template/               (@carto/template)
        ├── package.json
        ├── tsconfig.json
        ├── tsconfig.build.json
        └── src/
            └── index.ts        (placeholder: export const version = '0.0.0')
```

**Canonical root scripts (exact — later plans depend on these names):**

| Script      | Definition                          | Meaning                                   |
|-------------|-------------------------------------|-------------------------------------------|
| `install`   | (implicit — `pnpm install`)         | install workspace deps                    |
| `build`     | `pnpm -r build`                     | build every package (topological order)   |
| `typecheck` | `pnpm -r typecheck`                 | each package runs `tsc --noEmit`          |
| `test`      | `vitest run`                        | run all `*.test.ts`                        |
| `lint`      | `bash scripts/lint-comments.sh`     | the comment gate                          |

### Repo conventions that apply here (inlined from AGENTS.md — the executor has not read it)

- **Zero comments in code.** No `//`, no `///` / `//!` doc comments, no `/* */`.
  No `TODO`/`NOTE`, no section-header banners, no restating the code. Carry intent
  in names, types, and structure. The **only** allowed comment is an
  `SPDX-License-Identifier` header line where one is legally required (none are
  required in this plan). The `scripts/lint-comments.sh` gate you create in Step 3
  enforces this on `*.ts`/`*.mjs`/`*.js` under `packages/` and `scripts/`. Every
  code file you write in this plan MUST contain zero comments.
- **Commit messages:** Conventional Commits — `<type>(<scope>): <desc>`,
  imperative, lowercase, no trailing period. Types: `feat`/`fix`/`docs`/`style`/
  `refactor`/`perf`/`test`/`build`/`ci`/`chore`/`revert`.
- **English everywhere** in the repo (code, identifiers, strings, test names).
- **Simplicity / surgical / no speculative abstraction.** Write the minimum that
  makes the five commands green. Do not add feature logic, extra dependencies, or
  configuration knobs beyond what is specified here.

## Commands you will need

| Purpose   | Command                          | Expected on success            |
|-----------|----------------------------------|--------------------------------|
| Node ver  | `node --version`                 | prints `v20.x` or higher       |
| pnpm ver  | `pnpm --version`                 | prints a version (pnpm present)|
| Install   | `pnpm install`                   | exit 0                         |
| Build     | `pnpm build`                     | exit 0 (all packages build)    |
| Typecheck | `pnpm typecheck`                 | exit 0, no errors              |
| Tests     | `pnpm test`                      | exit 0, ≥1 test passes         |
| Lint      | `pnpm lint`                      | exit 0                         |

These are the exact commands this repo standardizes on. Do not invent variants.

## Scope

**In scope** (the only files you create/modify):

- `package.json` (create)
- `pnpm-workspace.yaml` (create)
- `tsconfig.base.json` (create)
- `vitest.config.ts` (create)
- `scripts/lint-comments.sh` (create)
- `packages/core/package.json`, `packages/core/tsconfig.json`,
  `packages/core/tsconfig.build.json`, `packages/core/src/index.ts`,
  `packages/core/src/index.test.ts` (create)
- `packages/cli/package.json`, `packages/cli/tsconfig.json`,
  `packages/cli/tsconfig.build.json`, `packages/cli/src/index.ts` (create)
- `packages/template/package.json`, `packages/template/tsconfig.json`,
  `packages/template/tsconfig.build.json`, `packages/template/src/index.ts` (create)
- `.gitignore` (verify only; edit only if a required line is missing — see Step 8)
- `plans/README.md` (status row only, at the end — unless a dispatcher owns the index)

**Out of scope** (do NOT create or touch):

- Any feature logic: no zod schema, no `hashFile`, no manifest read/write, no
  resolver, no CLI commands, no Astro/Starlight config, no remark plugin. Those
  belong to plans 002/003/004. Files created here contain **placeholder exports only**.
- `citty`, `zod`, `astro`, `@astrojs/starlight`, or any runtime dependency — do
  not add them. The only dependencies in this plan are `typescript` and `vitest`
  (dev), and the internal `@carto/core` workspace link.
- `skill/`, `docs/`, and the `packages/core/src/{schema,manifest,hash,tree,resolver,status}.ts`
  files named in the design — later plans create those.
- `skills-lock.json`, `.agents/`, `AGENTS.md` — do not modify.

## Git workflow

- Branch: `advisor/001-monorepo-foundation`.
- Commit per logical unit (e.g. one for root config, one for the comment gate,
  one per package skeleton), or a single `chore: scaffold pnpm + typescript
  monorepo` commit — your choice, but use Conventional Commits, imperative,
  lowercase, no trailing period. Example: `chore(repo): add pnpm workspace and
  shared tsconfig`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify prerequisites (pnpm + Node)

Run:

```
node --version
pnpm --version
```

- `node --version` MUST print `v20.` or higher (major ≥ 20). If it is lower, this
  is a STOP condition.
- `pnpm --version` MUST print a version. If `pnpm` is not found, this is a STOP
  condition (do not fall back to `npm`/`yarn` — the workspace is pnpm-only).

Note the exact pnpm version printed; you will use it in Step 2.

**Verify**: both commands print versions; Node major ≥ 20.

### Step 2: Create root workspace files

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

Create `package.json` (private root). Set `packageManager` to the pnpm version
Step 1 printed (shown here as `9.15.4` — **replace `9.15.4` with your exact
`pnpm --version` output**):

```json
{
  "name": "carto",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "lint": "bash scripts/lint-comments.sh"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

Create `tsconfig.base.json` (strict TS; ES2022; bundler resolution). Packages
extend this:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

Notes for the executor (do not add these as file comments — they are guidance):
- `module: ESNext` is required for `moduleResolution: Bundler`; do not change one
  without the other.
- Each package carries **two** tsconfigs. `tsconfig.json` (`include: ["src"]`, no
  `noEmit`) is what `typecheck` (`tsc --noEmit`) uses — it type-checks all of
  `src`, **including `*.test.ts`**. `tsconfig.build.json` extends it and adds
  `exclude: ["dist","node_modules","**/*.test.ts"]`; `build`
  (`tsc -p tsconfig.build.json`) uses it so the emitted `dist/` holds only real
  sources, never compiled test files. A child tsconfig's `exclude` replaces the
  parent's; `include` is inherited.
- The base does **not** set `types`, so any package that later adds
  `@types/node` gets Node globals automatically (not needed in this plan).

**Verify**: `test -f package.json && test -f pnpm-workspace.yaml && test -f tsconfig.base.json && echo ok` → prints `ok`.

### Step 3: Create the comment gate `scripts/lint-comments.sh`

This is the AGENTS.md-mandated gate. It scans **tracked** `*.ts`/`*.mjs`/`*.js`
files under `packages/` and `scripts/`, and fails (non-zero) with `file:line` on
any `//`, `///`, `//!`, or `/* */` comment, except a line containing an
`SPDX-License-Identifier` header. It is deliberately simple (POSIX sh + grep).

Create `scripts/lint-comments.sh` with **exactly** this body:

```sh
#!/bin/sh
set -eu

hits=""

while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    *.ts|*.mjs|*.js) ;;
    *) continue ;;
  esac
  file_hits=$(grep -nHE '(^|[^:])//|/\*|\*/' "$file" 2>/dev/null | grep -v 'SPDX-License-Identifier' || true)
  if [ -n "$file_hits" ]; then
    hits="${hits}${file_hits}
"
  fi
done <<EOF
$(git ls-files -- packages scripts)
EOF

if [ -n "$hits" ]; then
  echo "lint-comments: disallowed comments found (see AGENTS.md 'No comments in code'):" >&2
  printf '%s' "$hits" >&2
  exit 1
fi

exit 0
```

How it works (for your understanding — do not paste into the file):
- `git ls-files -- packages scripts` lists tracked files under those dirs, fed one
  path per line into the `while IFS= read -r file` loop; the `case` glob keeps only
  `.ts`/`.mjs`/`.js` sources. Reading line by line (not `xargs`) means paths that
  contain spaces or tabs are handled correctly instead of being word-split. The
  gate script itself is `.sh`, so it is **not** scanned (that is why the `//` and
  `/*` in its own regex are safe).
- `grep -nHE '(^|[^:])//|/\*|\*/'` flags a `//` at line start or after a
  non-colon char (so `http://`, `https://`, `file://` protocol URLs are **not**
  flagged, because their `//` follows a `:`), plus any `/*` or `*/` block-comment
  marker.
- `grep -v 'SPDX-License-Identifier'` drops the one allowed comment form.

Make it executable:

```
chmod +x scripts/lint-comments.sh
```

**Verify**: `bash scripts/lint-comments.sh; echo "exit=$?"` → prints `exit=0`
(no tracked package/script sources exist yet, so it exits 0 immediately).

### Step 4: Create the `@carto/core` skeleton

Create `packages/core/package.json`:

```json
{
  "name": "@carto/core",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

The `exports["."].types` points at `./src/index.ts` on purpose: this is the
"types from source" pattern so that `@carto/cli` can typecheck against
`@carto/core` **without** a prior build. Do not point it at `dist`.

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`packages/core/tsconfig.json` is what `typecheck` (`tsc --noEmit`) uses; it
type-checks `src` including `index.test.ts`. Create
`packages/core/tsconfig.build.json`, which `build` uses to emit a clean `dist/`
(the child `exclude` replaces the parent's; `include: ["src"]` is inherited):

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

Create `packages/core/src/index.ts`:

```ts
export const version = '0.0.0'
```

Create `packages/core/src/index.test.ts` (the smoke test):

```ts
import { describe, expect, it } from 'vitest'
import { version } from './index'

describe('@carto/core', () => {
  it('exposes the placeholder version', () => {
    expect(version).toBe('0.0.0')
  })
})
```

**Verify**: `test -f packages/core/src/index.ts && test -f packages/core/src/index.test.ts && echo ok` → prints `ok`. (Full build/test runs in Step 9.)

### Step 5: Create the `@carto/cli` skeleton

Create `packages/cli/package.json`. It declares the `carto` bin (pointing at its
built entry) and depends on `@carto/core` via `workspace:*` — this is what proves
workspace resolution:

```json
{
  "name": "@carto/cli",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "bin": {
    "carto": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@carto/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

Create `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

Create `packages/cli/tsconfig.build.json` (build uses it; excludes tests so no
test files land in the shipped `carto` bin's `dist/`):

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

Create `packages/cli/src/index.ts` (imports from `@carto/core` — this is the
resolution proof; do not add a shebang or citty here, that is plan 003):

```ts
import { version } from '@carto/core'

export const cliVersion = version
```

**Verify**: `test -f packages/cli/src/index.ts && echo ok` → prints `ok`.

### Step 6: Create the `@carto/template` skeleton

Create `packages/template/package.json` (no Astro/Starlight yet — plan 004 adds them):

```json
{
  "name": "@carto/template",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

Create `packages/template/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

Create `packages/template/tsconfig.build.json` (build uses it; excludes tests):

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

Create `packages/template/src/index.ts`:

```ts
export const version = '0.0.0'
```

**Verify**: `test -f packages/template/src/index.ts && echo ok` → prints `ok`.

### Step 7: Create the root `vitest.config.ts`

Create `vitest.config.ts` at the repo root. It lives at the root (outside
`packages/` and `scripts/`), so its glob string containing `/*` is **not** seen by
the comment gate — keep globs here rather than inside scanned package source. The
`resolve.alias` entry maps `@carto/core` to its **source** entry so that a test in
any package (e.g. a future `@carto/cli` test doing
`import { readManifest } from '@carto/core'`) resolves to `packages/core/src`
directly — **`pnpm test` never requires `@carto/core` to be built first**. Without
this alias, vitest would follow `@carto/core`'s `exports.import` to
`./dist/index.js` and the test would fail unless `pnpm build` ran first, coupling
`test` to build order. The alias covers `@carto/core` only (the one package
imported as a library); `@carto/cli`/`@carto/template` are a bin and a site, not
imported by other packages' tests:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@carto/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['packages/**/*.test.ts']
  }
})
```

**Verify**: `test -f vitest.config.ts && echo ok` → prints `ok`.

### Step 8: Verify `.gitignore` covers build artifacts

The repo already has a `.gitignore`. Read it and confirm it contains at least the
following lines (it currently does — this is the full existing content):

```
node_modules/
dist/
dist-site/
.astro/
astro/.astro/
*.tsbuildinfo
.DS_Store
*.log
.env
.env.*
```

This already covers `node_modules`, `dist`, Astro's `.astro/` and its build
output — so **no change is expected**. Only if a required line
(`node_modules/`, `dist/`, `.astro/`, or the Astro build output `dist-site/`) is
missing, append it. Do not reorder or reformat the existing file.

**Verify**: `grep -qE '^node_modules/?$' .gitignore && grep -qE '^dist/?$' .gitignore && grep -q '.astro/' .gitignore && echo ok` → prints `ok`.

### Step 9: Install and run every canonical command

Run, in order:

```
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Expected:
- `pnpm install` → exit 0. **Note:** on the *first* install, pnpm may print a
  warning that it cannot link the `carto` bin because `packages/cli/dist/index.js`
  does not exist yet. This is benign — install still exits 0, and the bin symlink
  is created after `pnpm build`. If (and only if) `pnpm install` actually exits
  **non-zero** because of the missing bin target, run `pnpm build` first, then
  `pnpm install` again.
- `pnpm build` → exit 0. `pnpm -r build` builds `@carto/core` before `@carto/cli`
  (topological order) and emits `dist/` in each package. Each package's `build`
  runs `tsc -p tsconfig.build.json`, which excludes `**/*.test.ts`, so no compiled
  test files appear in any `dist/` — `packages/core/dist/` holds only `index.js`
  and `index.d.ts`.
- `pnpm typecheck` → exit 0, no errors. `@carto/cli` resolves `@carto/core`'s
  types from source via the `exports.types` entry — this is the workspace
  resolution proof.
- `pnpm test` → exit 0; the run reports **1 passed** test (the core smoke test).
- `pnpm lint` → exit 0 (the placeholder sources contain zero comments).

**Verify**: all five commands exit 0; `pnpm test` shows `1 passed`.

## Test plan

- **New test:** `packages/core/src/index.test.ts` — the single trivial smoke test
  created in Step 4. It imports `version` from `./index` (relative import, so it
  needs no workspace resolution) and asserts `version === '0.0.0'`. Its only job
  is to make `pnpm test` green so later plans inherit a working vitest setup. It
  is the structural pattern that plans 002/003 copy for real tests (`*.test.ts`
  beside the source, explicit `describe`/`it`/`expect` imports from `vitest`).
- **Runner:** root `vitest.config.ts` includes `packages/**/*.test.ts`; `vitest run`
  discovers and runs it. Its `resolve.alias` maps `@carto/core` to
  `packages/core/src/index.ts`, so any package's test that imports `@carto/core`
  resolves to source — `pnpm test` needs no prior `pnpm build`. (The 001 smoke
  test imports `./index` relatively and does not exercise the alias; it exists so
  cross-package tests in plans 002/003/004 work without a build step.)
- **Verification:** `pnpm test` → exit 0, output contains `1 passed` and
  `Test Files  1 passed`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm install` exits 0.
- [ ] `pnpm build` exits 0 (all three packages emit `dist/`).
- [ ] No compiled test files leak into `dist/`:
      `test -e packages/core/dist/index.test.js && echo LEAK || echo clean` prints
      `clean` (build uses `tsconfig.build.json`, which excludes `**/*.test.ts`).
- [ ] `pnpm typecheck` exits 0 with no errors (proves `@carto/cli` resolves
      `@carto/core` across the workspace).
- [ ] `pnpm test` exits 0 and reports exactly 1 passing test.
- [ ] `pnpm lint` exits 0.
- [ ] `bash scripts/lint-comments.sh; echo $?` prints `0` and the script exists
      and is executable.
- [ ] No feature logic exists: `packages/core/src/index.ts`,
      `packages/cli/src/index.ts`, and `packages/template/src/index.ts` contain
      only placeholder exports (`version`/`cliVersion`); the only other `.ts` file
      is `packages/core/src/index.test.ts`. The files
      `schema.ts`/`manifest.ts`/`hash.ts`/`tree.ts`/`resolver.ts`/`status.ts`,
      `commands/`, `astro.config.mjs`, and `src/plugins/` do **not** exist.
- [ ] Zero comments anywhere in created sources: `grep -REn '(^|[^:])//|/\*|\*/' packages scripts --include='*.ts' --include='*.mjs' --include='*.js'`
      returns no matches (the `.sh` gate is excluded by the include filters).
- [ ] No files outside the in-scope list are modified (`git status` shows only
      in-scope paths; `AGENTS.md`, `skills-lock.json`, `.agents/` untouched).
- [ ] `plans/README.md` status row updated (unless a dispatcher owns the index).

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm` is not installed / not on PATH.
- `node --version` reports a major version below 20.
- After setting `packageManager` to your exact `pnpm --version` output,
  `pnpm install` still aborts with a package-manager version mismatch error (e.g.
  a corepack version-enforcement failure).
- The drift check shows any in-scope path other than `.gitignore` already exists
  at HEAD (the foundation was partially started elsewhere).
- Any of the five canonical commands cannot be made green **without adding
  feature code or dependencies beyond `typescript`/`vitest`** — that means a fact
  in this plan is wrong; report it rather than adding logic to force it green.
- `vitest run` cannot discover `packages/core/src/index.test.ts`, or the test
  fails to resolve `vitest`/`./index`.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

For whoever builds on this skeleton (plans 002–006) and the PR reviewer:

- **Later plans fill these skeletons with real logic.** Plan 002 replaces
  `packages/core/src/index.ts` with the zod schema, `hashFile`, manifest,
  tree/resolver/status modules; 003 turns `packages/cli` into the citty `carto`
  binary (adds a shebang + `citty` dependency + `commands/`); 004 turns
  `packages/template` into the Astro 7 + Starlight site (adds `astro.config.mjs`,
  `src/plugins/remark-carto-links.ts`, Astro deps). The **root scripts, package
  names, `tsconfig.base.json`, and the comment gate must stay as-is** — those are
  the shared contract.
- **Keep the comment gate green.** No `//`, `///`, `//!`, or `/* */` in any
  `*.ts`/`*.mjs`/`*.js` under `packages/` or `scripts/`; the only exception is an
  `SPDX-License-Identifier` header line. Do not bypass or weaken
  `scripts/lint-comments.sh`.
- **Comment-gate known limitation (grep-based, intentionally simple):** it flags
  any `//` (except after a `:`) and any `/*` / `*/`, so a string literal
  containing those sequences — e.g. `'//'`, or a glob like `'src/*'` — would be a
  false positive. Protocol URLs (`https://`, `file://`) are already safe because
  their `//` follows a `:`. Keep glob strings in root config files (like
  `vitest.config.ts`), which are outside the gate's scan set, rather than in
  scanned package source. If a scanned source genuinely needs such a literal,
  refactor to avoid it (build the string from parts) rather than editing the gate.
  A leading `#!/usr/bin/env node` shebang (which plan 003 adds as the first line
  of `packages/cli/src/index.ts` for the `carto` bin) is **not** flagged — it
  contains only single slashes, no `//`/`/*`/`*/` — so `pnpm lint` stays green
  with it present; no whitelist needed.
- **Cross-package type resolution uses "types from source"**
  (`exports["."].types → ./src/index.ts`). This is why `typecheck` works without
  a prior build. Do not repoint `types`/`exports.types` at `dist`, or you
  reintroduce a build-order dependency for `typecheck`.
- **Tests resolve `@carto/core` to source, not `dist`.** Root `vitest.config.ts`
  has `resolve.alias['@carto/core'] = packages/core/src/index.ts`, so `pnpm test`
  runs against core's TypeScript source and does **not** require `@carto/core` to
  be built first (verified: a `@carto/cli` test importing `@carto/core` passes
  with no `packages/core/dist` present). Keep this alias when adding cross-package
  tests in 002–006. If a later package is imported by another package's tests via
  a subpath (e.g. `@carto/core/xyz`), add a matching alias entry; the current
  single entry covers root-specifier imports (`from '@carto/core'`), which is all
  the design uses. Do not remove the alias to "test the built output" — build
  output is exercised by `pnpm build` + the e2e smoke (plan 006), not by unit tests.
- **Two tsconfigs per package (typecheck vs. build).** `tsconfig.json`
  (`include: ["src"]`) is used by `typecheck` (`tsc --noEmit`) and type-checks the
  whole tree **including `*.test.ts`**, so a type error in a test fails
  `pnpm typecheck`. `tsconfig.build.json` extends it and adds
  `exclude: ["dist","node_modules","**/*.test.ts"]`; `build`
  (`tsc -p tsconfig.build.json`) uses it so `dist/` never contains compiled test
  files. A child tsconfig's `exclude` replaces the parent's while `include` is
  inherited. Keep this split in every package (002–006): tests live beside sources
  as `*.test.ts`, run by root vitest, are typechecked by `tsconfig.json`, and are
  omitted from `dist` by `tsconfig.build.json`. Do not add `exclude` to
  `tsconfig.json` (that stops tests being typechecked) and do not build with
  `tsconfig.json` (that leaks test files into `dist`).
- **Module resolution.** The base uses `moduleResolution: Bundler` +
  `module: ESNext`. If a later package must run under Node ESM at runtime with
  cross-package imports and hits extension-resolution issues, it may override its
  own `module`/`moduleResolution` (e.g. `NodeNext`) in its package `tsconfig.json`
  while still `extends`-ing the base — do not change the base default for
  everyone.
- **Emitted ESM needs explicit `.js` on relative imports.** Because packages are
  `"type": "module"` and build with plain `tsc` (no bundler to rewrite
  specifiers), any **intra-package relative import** in a later plan's real source
  MUST carry an explicit `.js` extension so the emitted `dist` runs under Node ESM
  — e.g. `import { schema } from './schema.js'` (not `'./schema'`), even though
  the file on disk is `schema.ts`. `moduleResolution: Bundler` accepts the
  `.js`→`.ts` mapping, so `typecheck` stays green either way; the failure only
  appears at Node runtime, which `pnpm typecheck` will not catch. This does not
  affect **cross-package** imports: `import { version } from '@carto/core'` uses
  the bare package specifier and resolves via the `exports` map. The placeholder
  sources in this plan have no intra-package relative runtime imports (the only
  relative import is `./index` inside `index.test.ts`, resolved by vitest, not
  Node), so this is guidance for 003/004, not an action here.
- **`@types/node`.** Packages that start using Node built-ins (`fs`, `crypto`,
  `process`) should add `@types/node` as a devDependency; because the base leaves
  `types` unset, TS auto-includes it. This plan needs none.
- **What a reviewer should scrutinize:** that no feature logic slipped in; that
  the three `src/index.ts` files are pure placeholders; that all five commands are
  actually green (not skipped); and that `packages/cli` really depends on
  `@carto/core` via `workspace:*` (the resolution proof).
