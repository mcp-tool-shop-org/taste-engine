---
title: Review & Verdicts
description: How Taste Engine scores artifacts across 4 dimensions and synthesizes deterministic verdicts.
sidebar:
  order: 3
---

## The Review Pipeline

When you run `taste review run artifact.md`, the engine executes this pipeline:

1. **Canon packet assembly** — Selects the most relevant canon statements for this artifact
2. **4-dimension scoring** — LLM scores each dimension independently (0-10)
3. **Deterministic verdict synthesis** — Rules combine scores into a final verdict
4. **Model synthesis** — LLM generates a human-readable explanation
5. **Persistence** — Results stored in SQLite for history and calibration

## Canon Packet Selection

Not every canon statement is relevant to every artifact. The engine uses **rule-led retrieval** to build a targeted packet:

1. **Hard thesis** — Always included (product identity is always relevant)
2. **Anti-patterns** — Priority inclusion (violations are high-signal)
3. **Artifact-type match** — Statements scoped to this artifact type
4. **Scope match** — Statements scoped to this area of the product
5. **Voice/naming** — Included when relevant
6. **Tag/lexical match** — Keyword overlap between statement and artifact

```bash
taste review packet artifact.md   # Preview the canon packet without running a full review
```

## 4 Scoring Dimensions

Each dimension is scored independently by the LLM using a dimension-specific prompt:

### Thesis Preservation (0-10)
Does the artifact serve the product's core thesis? A feature brief that builds on the product's stated purpose scores high. One that pulls the product in an unstated direction scores low.

### Pattern Fidelity (0-10)
Does the artifact follow established design patterns? If your canon says "all config goes in a single file," an artifact proposing per-module configs scores low.

### Anti-Pattern Collision (0-10)
Does the artifact violate any stated anti-patterns? This dimension is **inverted** — a high score means no collisions. Any collision with a hard anti-pattern floors this score.

### Voice & Naming Fit (0-10)
Does the artifact match naming conventions and tone? If your canon says "use imperative verbs for commands" and the artifact uses passive voice, this scores low.

## Verdict Synthesis

The final verdict is **deterministic** — rules combine the 4 dimension scores, not the LLM. The model cannot talk itself into a pass.

| Verdict | Meaning |
|---------|---------|
| **aligned** | All dimensions strong. Ship it. |
| **mostly_aligned** | Minor issues, not blocking. Suggestions offered. |
| **salvageable_drift** | Meaningful drift, but the goal is sound. Repairable. |
| **hard_drift** | Significant misalignment. Structural repair needed. |
| **contradiction** | Directly contradicts canon. Cannot ship. |

### Calibration Fixes

Four calibration rules prevent common scoring artifacts:

- **Salvageability gate** — If any dimension shows recoverable motion, verdict cannot be worse than `salvageable_drift`
- **Category-collapse detector** — If all dimensions cluster at the same score, the verdict is suspect and gets re-examined
- **Naming-law separation** — Voice/naming issues alone cannot push a verdict past `mostly_aligned`
- **Relaxed aligned threshold** — A single dimension at 7/10 with the rest at 9+ still qualifies as `aligned`

## Calibration Feedback

After reviews, you can provide feedback to tune the system:

```bash
taste calibrate feedback <review-id>   # Record feedback on a review
taste calibrate summary                # View calibration metrics
taste calibrate statements             # Per-statement accuracy
taste calibrate findings               # Identified calibration issues
```
