---
title: CLI Reference
description: Complete reference for all 68 Taste Engine CLI commands.
sidebar:
  order: 7
---

## Global Options

```bash
taste --version    # Print version
taste --help       # Show help
taste <cmd> --help # Command-specific help
```

## taste init

```bash
taste init <slug> [--name <name>] [--root <path>]
```

Initialize Taste Engine for a project. Creates `.taste/` directory with SQLite database and config, plus a `canon/` directory.

## taste doctor

```bash
taste doctor [--root <path>]
```

Check environment health: Ollama connectivity, project state, database integrity.

## taste ingest

```bash
taste ingest <paths...> [--root <path>] [--type <type>]
```

Ingest source artifacts. Accepts files or directories. Auto-detects artifact type unless `--type` is specified.

## taste canon

```bash
taste canon status [--root <path>]
```

Show canon status: statement count, version, freeze state.

## taste extract

```bash
taste extract run [--root <path>] [--passes <list>]
taste extract status [--root <path>]
taste extract candidates [--root <path>] [--status <status>]
taste extract contradictions [--root <path>]
taste extract exemplars [--root <path>]
```

Run multi-pass extraction, view candidates, contradictions, and exemplars.

## taste curate

```bash
taste curate queue [--root <path>]
taste curate inspect <id> [--root <path>]
taste curate accept <id> [--root <path>]
taste curate edit <id> [--root <path>]
taste curate reject <id> [--root <path>]
taste curate defer <id> [--root <path>]
taste curate accept-all [--root <path>]
taste curate merge <id1> <id2> [--root <path>]
taste curate contradictions [--root <path>]
taste curate resolve-contradiction <id> --keep <winner> [--root <path>]
taste curate freeze [--tag <tag>] [--root <path>]
```

Human curation of extracted candidates. Accept, reject, edit, merge, defer. Freeze versioned snapshots.

## taste review

```bash
taste review run <artifact> [--root <path>]
taste review show <id> [--root <path>]
taste review list [--root <path>]
taste review packet <artifact> [--root <path>]
```

Review artifacts against frozen canon. View results and canon packets.

## taste calibrate

```bash
taste calibrate feedback <review-id> [--root <path>]
taste calibrate summary [--root <path>]
taste calibrate statements [--root <path>]
taste calibrate findings [--root <path>]
```

Provide feedback on reviews, view calibration metrics and findings.

## taste revise

```bash
taste revise run <review-id> [--root <path>]
```

Generate patch revisions (minimal + strong) for surface drift, with automatic re-review.

## taste repair

```bash
taste repair run <review-id> [--root <path>]
```

Structural repair for deep drift: goal extraction, fault diagnosis, concept replacement, draft generation.

## taste redirect

```bash
taste redirect run <review-id> [--root <path>]
```

Goal redirection for irreparable artifacts. Generates 2-3 canon-compatible alternative directions.

## taste gate

```bash
taste gate run [--root <path>] [--files <paths>]
taste gate policy-init [--root <path>]
taste gate policy-show [--root <path>]
taste gate override --artifact <path> --reason <reason> [--root <path>]
taste gate report [--dir <path>]
```

Workflow gate with enforcement modes. Manage policies, record overrides, generate rollout reports.

## taste onboard

```bash
taste onboard run --dir <path>
taste onboard report --dir <path>
taste onboard recommend --dir <path>
```

Repo onboarding: source scanning, shape classification, policy preset recommendations.

## taste portfolio

```bash
taste portfolio matrix --dir <path>
taste portfolio findings --dir <path>
taste portfolio export --dir <path>
```

Cross-repo intelligence: portfolio matrix, drift families, graduation patterns, findings.

## taste org

```bash
taste org matrix --dir <path>
taste org queue --dir <path>
taste org overrides --dir <path>
taste org hotspots --dir <path>
taste org recommendations --dir <path>
taste org alerts --dir <path>
taste org stale --dir <path>
taste org export --dir <path>
taste org actions queue --dir <path>
taste org actions preview <repo> <surface> <mode> --dir <path>
taste org actions apply <id> --dir <path>
taste org actions rollback <id> --reason <reason> --dir <path>
taste org actions history --dir <path>
```

Org-level control plane: status matrix, promotion/demotion queues, alerts, actions with preview/apply/rollback.

## taste watchtower

```bash
taste watchtower scan --dir <path>
taste watchtower history --dir <path>
taste watchtower delta --dir <path>
taste watchtower digest --dir <path> [--json]
```

Snapshot-based change detection with delta engine and digest generation.

## taste workbench

```bash
taste workbench [--dir <path>] [--port <port>]
```

Start the Operator Workbench — a dark-theme React UI at localhost (default port 3200) with 13 API endpoints for org matrix, queues, repo detail, and action management.
