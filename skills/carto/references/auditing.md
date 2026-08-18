# Auditing the in-scope Carto docs

Read this reference only after authoring and before the first sync. It defines
one focused correctness review, not an authoring or presentation pass.

## Inputs and contract

Audit the complete in-scope doc set in one pass. The reviewer receives:

- every exact in-scope `.carto/docs/<id>/node.json` path;
- every in-scope default-locale MDX path;
- every source path listed by those nodes and every file directly cited by the
  pages or needed to verify a cross-file relationship;
- this rubric.

The reviewer is fresh and read-only. Inspect the supplied pages and source code,
then return findings only. Do not edit files, inspect other locales, or sync any
node.

## Two correctness checks

Report only evidence-backed problems in these categories:

1. **Sources, anchors, and relationships:** a cited or invalidating file is
   missing from `node.json`, a listed source is not load-bearing, or a
   cross-file relationship is not supported by the cited expressions.
2. **Claims, flows, and examples:** executable code directly contradicts a
   factual claim, control/data/state flow, code-shaped view, or reproduced
   input/output.

## Finding format

Each finding must name:

- the exact default-locale page and line, or the `node.json` path and line when
  the defect exists only there;
- the correctness problem;
- the exact repository code evidence, with complete path and line or line
  range;
- the smallest factual correction that resolves the problem.

Do not report node granularity, locale parity, prose or style preferences,
heading or presentation choices, completeness suggestions, or terminology
preferences.

**Complete when:** the reviewer has returned all findings from this single
focused pass.
