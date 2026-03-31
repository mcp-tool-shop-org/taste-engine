---
title: Getting Started
description: Install Taste Engine, configure Ollama, and run your first canon extraction and artifact review.
sidebar:
  order: 1
---

## Prerequisites

- **Node.js** >= 20
- **Ollama** running locally with a model pulled

```bash
# Install Ollama from https://ollama.ai
ollama pull qwen2.5:14b
```

The `qwen2.5:14b` model is proven for extraction and review. Smaller models (7b) work but produce less nuanced canon. Larger models (32b+) improve quality but require more VRAM.

## Install

```bash
npm install -g @mcptoolshop/taste-engine
```

Verify the installation:

```bash
taste --version    # 1.0.0
taste doctor       # Checks Ollama connectivity and project state
```

## Initialize a Project

```bash
cd /path/to/your/project
taste init my-project --name "My Project"
```

This creates a `.taste/` directory with:
- `taste.db` — SQLite database for working state
- `config.json` — Project configuration

And a `canon/` directory for exported JSON canon files.

## Ingest Source Documents

Point Taste Engine at your doctrine:

```bash
# Single files
taste ingest README.md docs/architecture.md

# Directories (scans recursively for .md files)
taste ingest docs/
```

The engine detects artifact types automatically: README, architecture note, design doc, feature brief, naming proposal, etc.

## Extract Canon

Run multi-pass extraction:

```bash
taste extract run
```

This runs 8 specialized passes covering core thesis, design rules, anti-patterns, voice conventions, scope boundaries, quality bars, process rules, and integration contracts.

```bash
taste extract status           # Run summary
taste extract candidates       # List extracted candidates
taste extract contradictions   # Show detected contradictions
```

## Curate Canon

Extraction produces **candidates** that need human review:

```bash
taste curate queue             # Show pending candidates
taste curate inspect <id>      # View details with evidence
taste curate accept <id>       # Accept into canon
taste curate reject <id>       # Reject with reason
taste curate edit <id>         # Accept with modifications
taste curate merge <id1> <id2> # Merge duplicates
```

When done curating, freeze a canon version:

```bash
taste curate freeze --tag v1
```

Freezing creates an immutable snapshot. Reviews always run against frozen canon.

## Review an Artifact

```bash
taste review run path/to/artifact.md
```

The review scores 4 dimensions (0-10 each) and synthesizes a deterministic verdict: **aligned**, **mostly_aligned**, **salvageable_drift**, **hard_drift**, or **contradiction**.

```bash
taste review list              # List all reviews
taste review show <id>         # Full review details
```

## Next Steps

- [Extraction deep dive](./extraction/) — 8-pass extraction, consolidation, exemplars
- [Review & verdicts](./review/) — Scoring dimensions and calibration
- [Workflow gate](./gate/) — Enforce alignment in CI
