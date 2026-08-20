# Auditing the in-scope Carto presentation

Read this reference only after the correctness audit is clean and before the
first sync. It defines one presentation review. It does not re-audit facts.

## Inputs and contract

Audit the complete in-scope doc set in one pass. The reviewer receives:

- every exact in-scope `.carto/docs/<id>/node.json` path;
- every in-scope MDX path in every declared locale;
- each node's locale-neutral evidence plan and view spine coverage map;
- [presenting-code.md](presenting-code.md) and this rubric.

Use a fresh read-only reviewer who did not perform the correctness audit. Use
the node paths only to delimit scope, then inspect the supplied plans, maps, and
pages. Return findings only. Do not edit, sync, or reopen source code to check
factual accuracy. When delegation is unavailable, the parent performs the same
work as a new distinct pass.

## Presentation scope

Report only these defects:

1. A load-bearing sequence, branch, state, relationship, contract comparison,
   change surface, or reproduced behavior lacks a view, and its coverage-map row
   has no sound prose-only reason.
2. A view is decorative, duplicates prose or another view, or answers no mapped
   supporting subquestion.
3. A front-loaded token visual delays the node's developer question or first
   useful takeaway without carrying a mapped purpose.
4. Prose makes the reader reconstruct a code shape that a mapped view should
   carry.
5. A view is repository-generic because its labels or structure could describe
   an unrelated codebase unchanged.
6. Locales drift in view purpose, omit a verified relationship, or substitute a
   materially different explanation for the mapped takeaway.

Do not report factual correctness, source membership, anchor accuracy,
relationship truth, control-flow truth, reproduced-output truth, node
boundaries, or prose style. The correctness audit owns those checks.

## Finding format

Each finding must name:

- the exact page and line or range, plus the corresponding locale page and line
  for locale drift;
- one presentation category from the list above;
- the supporting subquestion and reader takeaway from the coverage map, or the
  missing row that should account for them;
- how the current presentation fails that purpose;
- the smallest presentation change that resolves the defect without adding a
  factual claim.

## Parent handling

The parent resolves every finding before the first sync. For an accepted
finding, update the coverage map first, then apply the correction to every
locale while preserving the mapped purpose, verified relationships, and exact
adjacent source anchors. Reject a finding only with exact coverage-map and page
evidence that the current choice passes the view spine tests.

A presentation finding does not authorize a factual correction. If resolving it
exposes a factual doubt, run that doubt through the correctness rubric before
changing the claim. Do not ask the presentation reviewer to re-audit facts.

**Review complete when:** every coverage-map row, every in-scope page, and every
cross-locale view purpose has been inspected and all presentation findings have
been returned. The pre-sync gate passes when the parent has resolved every
finding under the rules above.
