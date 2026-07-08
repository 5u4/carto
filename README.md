# carto

Agent-driven tool that turns a codebase into a human-readable, incrementally-maintainable static site: component responsibilities, data flow, and on-demand drill-down.

carto contains **zero LLM-provider code**. A host agent (e.g. omp) drives it through two interfaces — a skill it reads and a CLI it runs — while carto supplies deterministic structure-hashing, staleness reporting, and a static-site build.

## Status

Phase 1 (deterministic core: shared Zod schema + `hash`/`diff`/`stale`) and Phase 2
(the skill + Astro template + `carto build`) are implemented. See
[`design.md`](./design.md) for the full design baseline.

## Layout

Single package. The CLI and the Astro template share one `ir` schema (`src/ir.ts`),
consumed by both — no cross-language schema drift.

- `src/` — the `carto` CLI: `ir.ts` (Zod schema), `core.ts` (hashing/diff/stale),
  `io.ts` (ir + file IO), `build.ts` (astro shell-out), `cli.ts` (citty commands).
- `astro/` — the static-site template. Reads the user's content directory via
  `CARTO_CONTENT_DIR`, validates `ir.json` with the same `src/ir.ts` schema, and
  rebuilds the tree, sidebar, and locale-routed pages from it.
- `skill/SKILL.md` — the single skill a host agent (omp) reads: CLI usage + the
  documentation style contract.
- `example-content/` — a sample `ir.json` + MDX used as the build fixture.

## Stack

- TypeScript on plain Node.js (widest ecosystem, no extra runtime to install)
- pnpm (via Node's corepack)
- Zod as the single schema source (CLI validation + Astro content collection)
- Astro static build for rendering

## CLI

Run from the directory holding `content/`:

- `carto hash` — recompute source-file hashes into `ir.json`
- `carto diff` — list source files changed since last hash
- `carto stale` — map changed files to affected doc nodes (report only)
- `carto build` — compile `content/` to a static HTML site

## License

MIT
