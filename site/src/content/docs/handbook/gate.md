---
title: Workflow Gate
description: Enforce canon alignment in CI with advisory, warn, or required modes, override receipts, and promotion doctrine.
sidebar:
  order: 5
---

## Enforcement Modes

The workflow gate runs `taste gate run` against changed files and returns an exit code based on the enforcement mode:

| Mode | Behavior | Exit Code |
|------|----------|-----------|
| **advisory** | Report verdicts, never block | Always 0 |
| **warn** | Report verdicts, exit 1 only for contradictions | 0 or 1 |
| **required** | Exit 1 for any verdict below `mostly_aligned` | 0 or 1 |

## Gate Policy

Each repo has a gate policy that controls enforcement per artifact type:

```bash
taste gate policy-init    # Create default policy
taste gate policy-show    # View current policy
```

The policy file (`.taste/gate-policy.json`) maps artifact types to enforcement modes:

```json
{
  "default_mode": "advisory",
  "surfaces": [
    { "artifact_type": "readme", "mode": "required", "globs": ["README.md"] },
    { "artifact_type": "feature_brief", "mode": "warn", "globs": ["docs/briefs/**"] },
    { "artifact_type": "architecture_note", "mode": "required", "globs": ["docs/arch/**"] }
  ]
}
```

## Running the Gate

```bash
# Review all changed files (uses git diff)
taste gate run

# Review specific files
taste gate run --files path/to/artifact.md

# In CI
taste gate run || exit 1
```

The gate detects artifact types automatically and applies the matching policy mode.

## Override Receipts

When a required-mode artifact fails but must ship anyway, record an override:

```bash
taste gate override --artifact path/to/file.md --reason "Shipping for deadline, will fix in follow-up"
```

Overrides create a **receipt** — a permanent record that includes:
- Who overrode
- When
- Why
- The verdict at time of override

```bash
taste gate report    # Rollout report including override history
```

## Promotion Doctrine

Repos typically start in `advisory` mode and promote surfaces to `warn` then `required` as canon matures:

1. **advisory** — Run reviews, build confidence in canon quality
2. **warn** — Block contradictions, let drift through with warnings
3. **required** — Full enforcement, overrides needed for exceptions

The promotion queue (in org mode) tracks which surfaces are ready for the next level based on:
- Canon confidence (enough curated statements)
- Review history (consistent verdicts)
- Override rate (low overrides = healthy canon)

## Rollout Report

```bash
taste gate report --dir /path/to/repo
```

Shows per-artifact-type breakdown:
- Current enforcement mode
- Review count and verdict distribution
- Override count and rate
- Promotion readiness assessment
