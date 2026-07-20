# CLAUDE.md

## Commit messages

Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) format:
`<type>(<optional scope>): <description>`.

- **type** is one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope** is optional and names the affected area, e.g. `feat(discord): ...`.
- **description** is a concise, imperative, lowercase summary with no trailing period.
- Breaking changes get a `!` before the colon (`feat!: ...`) or a `BREAKING CHANGE:` footer.

## No comments in code

Write zero comments in code. No `//`, no `///` / `//!` doc comments, no `/* */`.
No "what" or "why" notes, no `TODO`/`NOTE`, no section-header banners, no
restating the code. Carry intent in names, types, and structure instead.

The only allowed comments:

- an `SPDX-License-Identifier` header, where one is legally required.
- a `/* @vite-ignore */` marker on a runtime-only dynamic `import()`, where Vite
  cannot statically analyze the specifier.
- a `/** @type {...} */` JSDoc annotation, used to type a `.mjs`/`.js` value
  where a top-level `import type` is unavailable.

A pre-commit + CI gate (`scripts/lint-comments.sh`) fails any diff that adds any
other comment. Do not bypass it, and do not reintroduce comments that were
removed.
