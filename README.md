# carto

Agent-driven tool that turns a codebase into a human-readable, incrementally-maintainable static site: component responsibilities, data flow, and on-demand drill-down.

carto contains **zero LLM-provider code**. A host agent (e.g. omp) drives it through two interfaces — a skill it reads and a CLI it runs — while carto supplies deterministic structure-hashing, staleness reporting, and a static-site build.

## Status

Design baseline only — see [`design.md`](./design.md). Nothing implemented yet.

## Stack

- TypeScript on plain Node.js (widest ecosystem, no extra runtime to install)
- pnpm (via Node's corepack)
- Zod as the single schema source (CLI validation + Astro content collection)
- Astro static build for rendering

## CLI (planned)

- `carto hash` — recompute source + content hashes into `ir.json`
- `carto diff` — list source files changed since last hash
- `carto stale` — map changed files to affected doc nodes (report only)
- `carto build` — compile `content/` to static HTML

## License

MIT
