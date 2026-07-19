---
name: documenting-strategy
description: Decide what a piece of technical documentation should contain and how to structure it — how to split a codebase or system into readable mental-model pages, layer them for the right audience, pick each page's type and section order, and hold every claim to a verifiable floor. Tool-agnostic writing doctrine. Use when planning or reviewing docs, architecture or onboarding pages, a code map, or any explanatory technical content, regardless of the generator or site framework.
---

# Documenting strategy

This is the **content doctrine** for technical documentation: how to decide what
a page is, how big it should be, who it's for, and what counts as good enough. It
is tool-agnostic — it says nothing about any particular generator, manifest, or
site framework. Pair it with whatever tooling renders and tracks your pages.

The target is a **mental-model map**: docs that help a human understand what a
system does and why, not an API reference and not a line-by-line transcription of
the code.

## How to split into pages

A page is **one mental model**, readable in one sitting.

- A page = "one thing you'd explain on a whiteboard": a subsystem, a flow, a core
  concept. **Never one file per page** — mirroring the file tree is exactly what
  a mental-model map avoids.
- Split a page when it starts describing more than about 5 independent concepts,
  or the set of source files behind it balloons.
- Shape the tree top-down: the top is orientation ("what is this, how do the
  pieces fit"); deeper pages are subsystems, then flows.
- **Audience layering — lead with the user, not the architecture.** If the thing
  documented is a tool, library, product, or anything with users, the tree MUST
  open with a user-facing layer that answers "as a user, how do I actually use
  this?": what it is and who it's for, how you invoke or call it, and the main
  loop or workflow you drive. Internal architecture (how the packages/modules are
  built) belongs in **deeper** pages aimed at contributors — never as the top of
  the tree. A pure package-dependency diagram is not orientation; it is
  architecture wearing an overview's hat.
- **Every user-facing tree needs a getting-started page.** Add a dedicated page
  that walks a first-time user from zero to a working result: prerequisites, the
  exact invocation, what happens at each step, and one complete run they can
  reproduce. This page is required whenever the documented thing has users; skip
  it only for purely internal code nobody invokes directly.

**Pick each page's type — it fixes the section order.** Most pages in a
mental-model map are Explanation; that is the "one page = one mental model" shape.

| Page type | Reader goal | Typical page | Section order |
|---|---|---|---|
| Explanation | build a mental model | subsystem, core concept | concept → context → mechanism → tradeoffs → example |
| Tutorial | working result from zero | getting-started, usage | goal → prerequisites → steps → verification → next |
| Reference | look up exact behavior | CLI/API entry page | overview → signature → parameters → returns → examples → edge cases |

Deeper contributor pages are almost always Explanation — resist letting them
decay into step-by-step tutorials.

## What each page contains

Do not force one fixed shape on every page. First pick the page's type (above) —
that fixes the section order. Then apply five principles that hold across all
types:

- **Value first.** Open with what the reader gains: what this thing is, what you
  can do after reading. Push background and internal architecture below the fold.
- **Overview before detail.** The first lines state the page's value plus any
  prerequisites or constraints; never open with deep background unless the
  background *is* the value.
- **Concrete over vague.** Every claim is observable — real commands, real inputs
  and outputs, version and environment constraints — not "handles caching
  appropriately". Replace a vague adjective with the condition that proves it.
- **Sufficient background.** Define an unfamiliar concept the first time it
  appears, near the point of use, not in a detached glossary.
- **Prefer prose to diagrams.** Convey the mental-model view — the core concepts
  and how they relate — as a sequential narrative or a short labelled list by
  default. A `mermaid` diagram is optional and earns its place only when a small
  set of nodes and edges genuinely reads more clearly as a picture; keep any
  diagram to roughly 5 to 7 nodes. Never emit a large auto-generated graph — a
  full package/module dependency dump or an every-edge flow. Past ~10 nodes a
  mermaid diagram degrades into an unreadable tangle and renders especially
  badly on the mobile screens many readers use. When in doubt, write the
  relationships out in words.

**Hard floor, regardless of type:** Intent (the problem it solves and its role in
the system) + a mental-model view (3 to 5 core concepts and how they relate) +
a `path:line` code anchor on every load-bearing claim. On any **user-facing page**
(getting-started, usage, or a page documenting a command or API a reader calls),
one **real, reproducible worked example** — real commands with their real output,
or real inputs mapped to real outputs — is also part of the floor. An idealized or
invented example does not count; a user page without one has not met the floor.

## Verification disciplines (non-negotiable)

1. **Comments, docstrings, and names are assumptions, not evidence.** Use them as
   hints about intent, but verify every claim against actual code behavior, and
   never copy them verbatim into the docs — comments drift out of sync with code.
2. **Every claim must be supportable by code behavior and carry a `path:line`
   anchor.** If you cannot confirm it from the code, do not write it — mark the
   gap as an explicit TODO instead of inventing a fact.
3. **Run-throughs trace a real code path** with inputs and outputs the code can
   actually produce — no imagined or idealized examples.
