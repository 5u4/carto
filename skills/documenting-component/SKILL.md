---
name: documenting-component
description: Write one focused component page for a codebase — delineate what a single component is, read widely enough to place it in the whole system, then write a page that stays on that component. Use when documenting an individual module, subsystem, or flow as its own page, especially when only part of a larger system is being covered at a time.
---

# Documenting a component

You write **one component page at a time**. A component is one mental model —
one subsystem, one flow, one thing you would explain on a whiteboard — not one
file. You do not assume the rest of the documentation tree already exists or plan
it here; you are responsible only for the component in front of you.

## Read wide, write narrow

A component is never an island — it earns its meaning by combining with others.
So to understand it you **must read past its own files**: what calls it, what it
calls, the shared types and contracts it lives inside. Writing a component page
from only the component's own source produces a blind-men-and-the-elephant page.

But the page itself stays **narrow**. Focus strictly on this component;
everything outside it appears only as the context that makes this component make
sense — how it plugs into the whole — never as a second subject you document by
the way.

Before writing, **draw the component's boundary**: decide what belongs to this
component and what belongs to a neighbour. Let the boundary follow one mental
model, not the file tree. A helper that exists only to serve this component is
part of it; a thing several components share is its own component. This is a
single-page judgement — what this one page covers — and it is yours to make; the
skill gives you the principle, not a rule table.

## The floor

Below these, the page is not done:

- **Intent** — what problem the component solves and the role it plays in the
  system. A complete intent names how the component relates to its neighbours;
  this is what the wide reading is for.
- **Mental model** — the few core concepts or mechanisms inside the component and
  how they relate.
- **A `path:line` anchor on every load-bearing claim.** If you cannot confirm a
  claim from the code, do not write it. Comments and names are assumptions, not
  evidence; verify behaviour against the code itself.

## Examples earn their place through behaviour

A concrete example is driven by **behaviour**, not by page type. When a
component's behaviour is hard to convey in prose but a specific `input → output`
(or a real `command → output`) makes the reader *get it*, include one — a real
worked run makes the behaviour visible in a way an abstract description cannot.

Not every component needs one: a purely structural or definitional component (a
set of types, a config schema) gains nothing from a forced example, and adding
one is noise. But any example you do include **must be real and reproducible** —
real inputs mapped to real outputs, or a real command with its real output. An
invented or idealised example is worse than none.
