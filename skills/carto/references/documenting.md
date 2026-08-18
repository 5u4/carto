# Documenting Carto nodes

Use this reference for every creation, refresh, or structural documentation run.
A Carto node is one bundle: `.carto/docs/<id>/node.json` plus
`.carto/docs/<id>/<locale>.mdx` for every locale declared in `carto.json`.

## 1. Fix the developer question

Give each node one primary developer question. Frame it with the code concepts that make the answer actionable:

- **ownership** — which boundary owns a responsibility or state;
- **entry point** — where a request, event, or command enters;
- **flow** — how control or data moves;
- **contract** — what callers provide and what they receive;
- **constraint** — which invariant or policy shapes the code;
- **change surface** — what must change together and where effects propagate.

Start with one end-to-end responsibility or flow and use the smallest useful
node set. Supporting subquestions contribute to that same answer. Split only
for an independently useful developer question with a meaningfully distinct
owner, entry point, contract, flow, invariant, or change surface and worthwhile
independent staleness or navigation. Do not mirror files, exports, modules, or
directories into nodes. Include a helper used only by the responsibility, and
treat genuinely shared facilities as neighboring nodes. An orientation parent
exists only to navigate durable child questions; code-derived topology or
behavior belongs in an evidenced node.

Before changing existing structure, distinguish an authoring improvement from a
node deletion, id rename, reparenting, or source reassignment. Apply the Carto
safety checkpoint before any structural operation that requires confirmation.

**Complete when:** every in-scope node has one stated primary developer question, a defined boundary, and a complete bundle destination.

## 2. Establish executable evidence

Read through the behavior, not just the named subject. Inspect:

1. the implementation that owns the behavior;
2. its real entry points and callers;
3. its callees and side effects;
4. shared types, configuration, protocols, and error contracts;
5. tests or runnable paths that establish externally observable behavior.

Trust executable code over names, comments, or assumed architecture. For a
refresh, use the last-sync diff to locate changes, then read enough surrounding
code and connected contracts to determine their effect on the whole node answer.

For each load-bearing factual claim or view, record a literal, complete
repository-relative `path/to/file:line` or `path/to/file:start-end` anchor and
place it in adjacent prose. Cite the call, condition, returned value, mutation,
or contract expression that proves the statement or view, not a nearby
declaration.

For every cross-module edge, cite evidence of the relationship itself: the call,
import plus use, value transfer, registration, or shared contract binding the
modules. A `carto:` link is navigation, not evidence. `node.json` `sources`
separately tracks the files whose changes could invalidate the page.

When a concrete `input → output` or `command → output` clarifies difficult
behavior, reproduce it with the repository's existing tooling and retain the
real input, command, and output. Keep source and package files unchanged; use an
external temporary directory for disposable work. Structural or definitional
explanations do not need a forced example.

**Complete when:** ownership, entry points, flows, contracts, constraints,
change surfaces, and any useful example are supported by inspected executable
evidence.

## 3. Design the node bundle

Build one locale-neutral evidence plan for each node before drafting any locale.
It must name:

- the primary developer question and supporting subquestions;
- the executable evidence needed to answer them, including relationships,
  examples, and views;
- the exact anchors for that evidence;
- relevant neighboring nodes and navigation-only `carto:` targets;
- the presentation views selected under [presenting-code.md](presenting-code.md).

Derive `node.json` `sources` from the evidence plan. Include every file whose
change could invalidate a claim, relationship, example, or view. Every source
must supply at least one exact anchor in every locale. Source overlap between
nodes is allowed when one file is load-bearing to both answers. Use an empty
`sources` array only when the page makes no code-derived claim and shows no
code-derived relationship, example, or view.

Neighbors appear only where their relationship helps answer this node's
question; do not turn them into additional subjects. Reapply the end-to-end
split gate after the evidence plan is complete: if the parts jointly answer one
developer task or runtime path, keep them together even when files or modules
differ.

**Complete when:** the plan answers one primary question and accounts for every
source, relationship, link, example, and view in the bundle.

## 4. Author every locale

Write one MDX page for every declared locale from the same evidence plan. Author
each page natively for its technical audience rather than translating sentence
by sentence.

Every locale must preserve the same primary question, supported facts, `carto:`
targets, exact source anchors, and presentation structure. Each `node.json`
source must appear in at least one exact anchor in each locale. Keep each view's
explanatory role and verified relationships aligned across locales while
localizing labels, terminology, headings, examples, and explanation order where
natural. Preserve any cross-locale heading anchor required by a
`carto:<id>#<anchor>` link.

Verify factual content and views introduced while drafting against executable
evidence. Add their exact adjacent anchors, and update `sources` when the
evidence introduces another file whose change could invalidate the page.

Explain only motivation or intent that repository evidence establishes. Prefer
the concrete code constraint and its effect when product motivation is
unavailable. Use reproduced examples exactly; never substitute an invented or
idealized result.

Place every load-bearing claim beside its complete source anchor; never place a
source anchor in a standalone paragraph. Keep views beside prose that states
what they show and supplies the exact anchors, including relationship evidence.
Use `carto:` links only for navigation between nodes and keep source anchors as
literal addresses, not source-host links.

**Complete when:** every locale answers the same question accurately, reads
idiomatically on its own, and has the same evidence and structural coverage.

