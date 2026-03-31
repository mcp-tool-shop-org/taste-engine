---
title: Extraction & Curation
description: How Taste Engine extracts canon statements from source documents and how humans curate them.
sidebar:
  order: 2
---

## Multi-Pass Extraction

Taste Engine doesn't analyze your documents in a single pass. Instead, it runs **8 specialized passes**, each tuned to extract a different type of canon truth:

| Pass | Extracts |
|------|----------|
| Core thesis | Product identity, purpose, what makes it unique |
| Design rules | Structural patterns, constraints, invariants |
| Anti-patterns | What to avoid, past mistakes, known traps |
| Voice & naming | Tone, terminology, naming conventions |
| Scope boundaries | What's in scope, what's explicitly out |
| Quality bars | Standards, acceptance criteria, definition of done |
| Process rules | How work flows, review requirements, release gates |
| Integration contracts | How components connect, API boundaries |

Each pass uses a specialized prompt that focuses the LLM on one dimension of truth.

## Consolidation

After all passes complete, the engine runs **Jaccard token similarity** across all extracted candidates to detect duplicates and near-duplicates. Candidates above the similarity threshold are flagged for merge during curation.

```bash
taste extract run              # Run all 8 passes
taste extract run --passes core_thesis,design_rules  # Run specific passes
taste extract status           # Summary of latest run
taste extract candidates       # List all candidates
taste extract exemplars        # High-quality examples from source docs
```

## Statement Properties

Every extracted candidate has:

- **type** — thesis, design_rule, anti_pattern, voice_convention, scope_boundary, quality_bar, process_rule, integration_contract
- **hardness** — hard (non-negotiable), strong (high priority), soft (guidance), experimental (try it)
- **text** — The canonical statement
- **evidence** — Quotes from source documents that support it
- **scope** — What artifact types or areas it applies to

## Curation Workflow

Extracted candidates are **proposed** — they need human review before entering canon.

### Queue Management

```bash
taste curate queue                    # Show all pending candidates
taste curate inspect <id>             # View full details
```

### Decisions

```bash
taste curate accept <id>              # Accept as-is
taste curate edit <id>                # Accept with modifications
taste curate reject <id>              # Reject with reason
taste curate defer <id>               # Defer for later review
taste curate merge <id1> <id2>        # Merge two candidates
taste curate accept-all               # Accept all remaining (use carefully)
```

### Contradiction Resolution

When two statements conflict, they're flagged as contradictions:

```bash
taste curate contradictions           # List detected contradictions
taste curate resolve-contradiction <id> --keep <winner-id>
```

### Freezing

Once curation is complete, freeze the canon:

```bash
taste curate freeze --tag v1
```

A frozen version is immutable. Reviews and gates always run against frozen canon. You can continue curating and freeze new versions without affecting existing reviews.

## Statement Lifecycle

```
proposed → accepted → (superseded | retired | disputed)
```

- **proposed** — Extracted, awaiting human review
- **accepted** — In active canon, used for reviews
- **superseded** — Replaced by a newer statement
- **retired** — No longer applicable
- **disputed** — Under review after feedback
