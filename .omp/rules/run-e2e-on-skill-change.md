---
description: Re-run the carto agent e2e after editing the injected skill
condition: skills/**
---

Editing anything under `skills/` (the doc-authoring `skills/carto/SKILL.md`)
changes the
instructions the carto agent e2e feeds to a live agent — it launches the agent
with `--append-system-prompt skills/carto/SKILL.md` and asserts the full
generate -> validate -> build -> refresh authoring loop. A skill edit can silently
break that loop without touching any TypeScript.

So after you edit any file under `skills/`, you MUST run the real agent e2e before
claiming the change is verified:

```sh
cp .env.example .env.e2e   # sets CARTO_E2E=1
pnpm build                 # the carto bin must exist for the test
pnpm test:e2e
```

`pnpm test` / `pnpm typecheck` passing is NOT sufficient — only `pnpm test:e2e`
exercises the skill against a live agent (it is skipped by default and costs a
live model run). Do not report a `skills/` change as done or verified until
`pnpm test:e2e` exits 0.
