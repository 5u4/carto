---
name: documenting-component
description: Write one focused evidence-backed documentation page for a code module, subsystem, or flow, using diagrams or code-shape views when they clarify its mental model.
---

# Documenting a component

Produce exactly one page for one mental model. A component may be a module,
subsystem, or flow; it is not necessarily one file. Do not plan the rest of the
documentation tree or turn neighbouring components into additional subjects.

## Workflow

### 1. Fix the subject and destination

Identify the requested component, the repository's page location and format,
and the reader question this page must answer. Follow the existing documentation
conventions at that destination.

**Complete when:** one Markdown or MDX page and one reader question are fixed,
with no second page or documentation-tree plan in scope.

### 2. Read wide and establish evidence

Read the component's implementation and past its files: trace what calls it,
what it calls, and the shared types and contracts it lives inside. Verify
behaviour from executable code rather than trusting names or comments. Record a
literal, complete repository-relative `path/to/file:line` or
`path/to/file:start-end` anchor beside each claim it supports. Never shorten a
canonical citation to a basename.

For Carto MDX pages, authored MDX retains these literal anchors as the canonical
form for agents and LLMs. The built human site recognizes them and renders them
as localized native source footnotes; that transformation is rendering-only.
Source anchors are addresses, not source-host links or permalinks, and remain
separate from the page's `node.json` `sources` staleness set.

If a concrete `input → output` or `command → output` would make difficult
behaviour understandable, reproduce it with the repository's existing tooling
and retain the real input, command, and output. Treat the checkout as read-only
apart from the destination page: create no package files, dependencies, source
changes, or helper scripts. Use an external temporary directory for disposable
scratch work. A purely structural or definitional component does not need a
forced example.

**Complete when:** the component's intent, neighbours, internal mechanism, and
any useful reproducible example are understood from code, with evidence anchors
ready for every load-bearing claim.

### 3. Draw one mental-model boundary

Decide what belongs to this component and what belongs to a neighbour. Include a
helper that exists only to serve this component; treat a facility shared by
several components as a neighbour. Let the boundary follow the concept, not the
file tree. Neighbours appear only where their relationship makes this component
understandable.

**Complete when:** every mechanism the page will explain belongs to the same
mental model, and everything else has been excluded or reduced to neighbour
context.

### 4. Choose the smallest useful presentation

Now read [VISUALS.md](VISUALS.md) in full. Treat it as a palette, not a
checklist. Choose prose-only or exactly one Markdown-native view for the page.
Count each table, diagram, pseudocode block, tree, diff, and complete code-shape
block as a view. When reproducible output is requested, make that output the one
view and explain configuration and control flow in prose. Use exactly one fenced
diff as the sole view when the requested page documents a change or migration.
Embed the chosen view in the page; never create a separate artifact or use raw
HTML or JSX as a visual.

**Complete when:** the page has zero or one explanatory view, the choice fits the
reader question, and no competing view or separate artifact remains.

### 5. Write narrow

Explain the code-supported problem or constraint the component addresses and
its role in the system, including how it relates to its neighbours. Do not
invent product motivation that the repository cannot establish. Give the reader
a mental model of the few core concepts or internal mechanisms and how they
relate. Put one of these complete repository-relative source anchors beside
every load-bearing claim. Include a behavioural example only when it earns its
place; when included, use the reproduced real input and output or command and
output, never an invented or idealised result.

Keep the page focused strictly on this component. Place each selected view next
to the short text it supports, and keep only the labels, edges, code, state, and
boundaries needed to explain the component.

**Complete when:** the page contains the intent-and-neighbours view, the
internal-mechanism mental model, evidence for every load-bearing claim, and any
behavioural example needed to make hard behaviour concrete.

### 6. Audit the authored page

Run this preflight before finishing:

1. Inspect authored files. The destination page must be the only repository
   change made by this skill.
2. Count every Markdown table and fenced block in the page, including JSON
   output. A prose-only page has zero; a page with a view has exactly one. For a
   change or migration, that one block is the diff.
3. For each load-bearing claim, read the cited exact line or range and state
   privately what that expression proves. Cite the call, condition, or returned
   value itself, not a nearby declaration. Recheck transition direction,
   predicate polarity, ordering, arithmetic, and enumerated counts. Do not infer
   initial states, mutability, replaceability, or policy that the code does not
   establish.
4. Each caller, callee, or shared contract used in the mental model has at least
   one complete repository-relative source anchor beside the supported claim.
5. Recheck every visual label, edge, code fragment, and example against
   repository behaviour. Remove unsupported claims and context that starts
   documenting a neighbour as a second subject.

**Complete when:** exactly one focused evidence-backed Markdown or MDX page
remains; it is the only authored file, all anchors support their adjacent claims,
all examples are real and reproducible, and zero or one verified view serves one
mental model.
