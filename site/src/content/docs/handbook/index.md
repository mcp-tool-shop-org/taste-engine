---
title: Taste Engine Handbook
description: Complete guide to the canon-and-judgment system for creative and product work.
sidebar:
  order: 0
---

Taste Engine is a **canon-and-judgment system** that helps teams maintain alignment between their stated doctrine (what they say they believe) and their produced artifacts (what they actually ship).

## The Problem

Creative and product teams accumulate doctrine over time — thesis statements in READMEs, design rules in architecture docs, anti-patterns in post-mortems. But as artifacts multiply, drift creeps in. A feature brief contradicts the product thesis. A naming convention slides. A design rule gets quietly ignored.

Taste Engine closes this gap by:

1. **Extracting** canon statements from your existing doctrine
2. **Curating** those statements through human review
3. **Reviewing** new artifacts against curated canon
4. **Repairing** drifted work with targeted suggestions
5. **Gating** workflows to prevent drift from shipping
6. **Scaling** governance across an entire portfolio

## How It Works

The engine runs **locally** against [Ollama](https://ollama.ai/). No paid API. No cloud calls. Your doctrine stays on your machine.

The pipeline flows through these stages:

```
Source docs → Extract → Curate → Freeze → Review → Repair → Gate
                                                         ↓
                                              Portfolio → Org → Watchtower
```

Each stage has dedicated CLI commands under `taste <group>`.

## Key Design Decisions

- **Rules beat the model.** The verdict ladder is deterministic — the LLM scores dimensions, but rules synthesize the final verdict. The model cannot talk itself into a pass.
- **Human curation is required.** Extracted canon is always "proposed" until a human accepts it. No auto-accept path exists.
- **4 dimensions, not 1.** Every review scores thesis preservation, pattern fidelity, anti-pattern collision, and voice/naming fit independently before synthesis.
- **3 repair modes.** Drift severity determines the repair path: surface patch, structural repair, or goal redirection.

## Handbook Contents

- [Getting Started](./getting-started/) — Install, configure Ollama, run your first review
- [Extraction & Curation](./extraction/) — How canon gets extracted and curated
- [Review & Verdicts](./review/) — The 4-dimension scoring and verdict synthesis
- [Repair & Redirection](./repair/) — Fixing drifted artifacts
- [Workflow Gate](./gate/) — Enforcement modes and CI integration
- [Portfolio & Org](./portfolio/) — Multi-repo governance
- [CLI Reference](./reference/) — All 68 commands
