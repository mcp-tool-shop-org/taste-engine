---
title: Repair & Redirection
description: Three repair modes for fixing drifted artifacts — from surface patches to full goal redirection.
sidebar:
  order: 4
---

## Repair Philosophy

Not all drift is the same. A naming inconsistency needs a different fix than a feature that contradicts the product thesis. Taste Engine provides **three repair modes** matched to drift severity:

| Mode | When | Command |
|------|------|---------|
| **Patch (1A)** | Surface drift — wording, naming, minor pattern violations | `taste revise run` |
| **Structural (1B)** | Deep drift — wrong concepts, misaligned architecture | `taste repair run` |
| **Redirect (2C)** | Irreparable — artifact's goal conflicts with canon | `taste redirect run` |

## Patch Revision (1A)

For `mostly_aligned` or mild `salvageable_drift` verdicts. The engine generates minimal edits:

```bash
taste revise run <review-id>
```

The revision engine:
1. Reads the original artifact and review feedback
2. Generates a **minimal revision** — fewest changes to fix the identified issues
3. Generates a **strong revision** — more thorough alignment improvements
4. **Re-reviews** each revision against the same canon packet
5. Reports whether the revision improved the verdict

You get two options: the minimal fix (lower risk of over-editing) and the strong fix (better alignment but more changes).

## Structural Repair (1B)

For `hard_drift` or severe `salvageable_drift` verdicts where the concepts themselves are wrong:

```bash
taste repair run <review-id>
```

The structural engine follows a 4-step pipeline:

1. **Goal extraction** — What was the artifact trying to accomplish?
2. **Fault diagnosis** — Where exactly does the artifact diverge from canon?
3. **Concept generation** — What replacement concepts would align with canon?
4. **Draft generation** — Produce a new draft using the replacement concepts

The re-review confirms whether the structural repair achieved alignment.

## Goal Redirection (2C)

For `contradiction` verdicts where the artifact's stated goal directly conflicts with canon:

```bash
taste redirect run <review-id>
```

The redirect engine:
1. **Preserves the goal** — Identifies what the artifact was trying to achieve
2. **Generates 2-3 directions** — Alternative approaches that achieve a similar goal while respecting canon
3. **Evaluates each direction** — Explains tradeoffs and expected alignment

Redirection briefs are not revised artifacts — they're strategic suggestions for the author to pursue a different approach entirely.

## Choosing the Right Mode

The review verdict maps directly to a repair path:

```
aligned           → No repair needed
mostly_aligned    → Patch (1A) if desired
salvageable_drift → Patch (1A) or Structural (1B)
hard_drift        → Structural (1B)
contradiction     → Redirect (2C)
```

The `taste gate run` command includes this mapping in its output, so CI pipelines can surface the recommended repair path alongside the verdict.
