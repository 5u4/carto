# Presenting code in Carto pages

This presentation palette adapts Markdown-native code views from HumanLayer's `show-me` skill:

- Source: https://github.com/humanlayer/skills/blob/3c2629142c5d437428269b1b722b08c0b87f574d/plugins/show-me/skills/show-me/SKILL.md
- Fixed upstream commit: `3c2629142c5d437428269b1b722b08c0b87f574d`
- License: MIT, Copyright (c) 2026 HumanLayer. See [LICENSE.show-me](../LICENSE.show-me) for the full license text.

## Build the view spine

Before drafting a locale, build a locale-neutral **view spine**. It maps each
load-bearing supporting subquestion involving sequence, branch, state,
relationship, contract comparison, change surface, or reproduced behavior to
the smallest verified view. Choose prose-only only when a view adds no value,
and record why.

Record the spine as a coverage map with one row per supporting subquestion:

- supporting subquestion;
- reader takeaway;
- chosen view or prose-only reason;
- exact executable evidence.

Let the mapped subquestions determine the views. Prefer a verified text code
shape over prose that reconstructs the same calls, branches, files, or states.
Use prose to orient the reader, connect implications, and state evidence. Remove
a view when it repeats prose, duplicates another view, inventories code without
explaining it, or answers a neighboring node's question.

Keep views inline in the Carto Markdown/MDX page. Use Markdown/MDX-native
structures such as fenced text, code, diff, Mermaid, and tables. Keep each view
only as large as its subquestion requires. Do not create standalone HTML, SVG,
image, or generated-diagram artifacts.

The examples here show presentation shapes, not evidence about the repository
being documented. Verify every authored label, edge, path, code fragment, state
transition, and example against that repository.

## Test the spine

Test every coverage-map row before locale authoring:

- The chosen view carries the stated takeaway and preserves the executable
  shape that matters to the supporting subquestion.
- Its form is the smallest one that keeps the verified order, branches,
  relationships, states, contract cases, or reproduced values legible.
- Adjacent prose explains the implication instead of narrating the view, and a
  neighboring view does not carry the same purpose.
- The view is repository-specific. Its labels and structure could not describe
  an unrelated codebase unchanged.
- Every visible claim and relationship has exact executable evidence. Apply the
  evidence rules below when authoring the page.

Replace a view that fails these tests, or choose prose-only and record the
reason in the map.

## Text code shapes

Text shapes are the default when code structure is the explanation. They stay readable in source, diffs, terminals, and every Carto rendering surface.

### Pseudocode

Use pseudocode for an algorithm, decision sequence, precedence rule, or state transition when incidental syntax would obscure it.

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

Preserve branch direction, ordering, and terminal behavior from executable code. Do not add conventional start, success, or failure states that the repository does not define.

### Call tree

Use a call tree to show runtime ownership or control flow. Begin at a verified entry point and stop when deeper calls no longer answer the subquestion.

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

### Component tree

Use a component tree for UI ownership, composition, hooks, or state boundaries.

```tsx
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

### File responsibility tree

Use a shallow file tree when ownership across files is the point. Label responsibilities rather than inventorying a directory.

```text
src/
├── commands/       parses user actions
├── sessions/       owns session state
└── transport/      sends API requests
```

### Contract table

Use a compact Markdown table when the subquestion compares a bounded set of inputs, outputs, guarantees, or failure cases. Every row must correspond to a verified contract; avoid tables that merely reformat prose.

### Diff

Use a fenced diff when a change surface, migration, or old-to-new contract is the question. Include enough stable context to preserve ownership and order. A current-state explanation uses a current-state shape instead.

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
```

### Complete code

Show complete real code when readers need a copyable contract or when omitted context would hide ownership, ordering, or cleanup. Keep the block to the smallest complete unit that proves the point. Use pseudocode or a tree when exact syntax adds noise.

### Reproduced behavior

Use real `input → output` or `command → output` when runtime behavior answers the subquestion more directly than implementation shape. Include the exact reproduced values and enough invocation context to make the evidence meaningful.

## Mermaid

Use Mermaid only when spatial relationships make an interaction, control flow, or data flow clearer than a text tree or pseudocode.

Use `flowchart TD` for every Mermaid flowchart. Direction is part of the explanation, not decoration.

A Mermaid view has failed when readers must trace dense crossings, scan oversized labels, decode a crowded legend, or zoom to follow the main path. Replace it with one or more of:

- a call tree, file tree, component tree, or pseudocode view;
- multiple smaller Mermaid views, each answering one subquestion;
- a narrower page or a separate node when the diagram exposes a second primary question.

Sequence and state diagrams follow the same evidence standard. Include only participants, states, branches, and transitions established by code. In state diagrams, omit conventional `[*]` start or end markers unless executable evidence defines those lifecycle facts.

## Keep evidence adjacent

Keep source anchors out of diagrams and other views. Put a short prose statement
immediately before or after each view that names its subquestion, explains the
relevant implication, and carries the complete repository-relative anchors
supporting it. Never put a source anchor in a standalone paragraph. A view does
not prove itself: audit its labels, edges, order, grouping, code, and omissions
against the adjacent anchors and the broader executable path. Cite evidence for
the relationship being shown, not merely for the existence of each named
symbol.

## Align locales structurally

Every locale keeps an equivalent set of view purposes and verified relationships in the same role within the page. Localize labels and surrounding prose natively, and adapt syntax examples only when the locale or documented interface requires it. Do not let one locale gain an unsupported edge, lose a contract case, or replace a code shape with a materially different explanation.
