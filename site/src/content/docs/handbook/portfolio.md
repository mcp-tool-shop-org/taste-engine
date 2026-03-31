---
title: Portfolio & Org
description: Scale canon governance across multiple repos with portfolio intelligence and org-level control.
sidebar:
  order: 6
---

## Portfolio Onboarding

When you manage multiple repos, Taste Engine provides automated onboarding:

```bash
taste onboard run --dir /path/to/repo
```

The onboarding engine:
1. **Scans sources** — Finds READMEs, docs, architecture notes with priority detection
2. **Classifies repo shape** — Library, CLI tool, desktop app, documentation, etc.
3. **Recommends a policy preset** — Based on repo shape and source coverage

### Policy Presets

| Preset | For | Starts With |
|--------|-----|-------------|
| **advisory-starter** | New repos, low canon confidence | All surfaces advisory |
| **docs-heavy** | Documentation-rich repos | READMEs and docs on warn |
| **product-copy** | Product/marketing repos | High enforcement on customer-facing surfaces |

```bash
taste onboard report --dir /path/to/repo    # Detailed onboarding report
taste onboard recommend --dir /path/to/repo # Get a recommendation
```

## Portfolio Intelligence

Across a portfolio directory containing multiple repos:

```bash
taste portfolio matrix --dir /path/to/portfolio    # Overview of all repos
taste portfolio findings --dir /path/to/portfolio  # Cross-repo findings
taste portfolio export --dir /path/to/portfolio    # Export as JSON
```

### Drift Families

The engine detects **drift families** — groups of repos that share the same type of drift. If three repos all have voice/naming drift, that's a systemic issue, not three independent problems.

### Graduation Patterns

Tracks which repos have successfully promoted surfaces from advisory → warn → required, and identifies repos that are stuck.

### Preset Fit Analysis

Re-evaluates whether each repo's policy preset still matches its current state. A repo that started as `advisory-starter` but now has strong canon might be ready for `docs-heavy` or `product-copy`.

## Org Control Plane

For organization-wide governance:

```bash
taste org matrix --dir /path/to/portfolio         # Org-wide status matrix
taste org queue --dir /path/to/portfolio           # Promotion + demotion queues
taste org alerts --dir /path/to/portfolio          # Active alerts
taste org recommendations --dir /path/to/portfolio # Suggested actions
```

### Promotion Queue

Surfaces that meet promotion criteria (strong canon, consistent verdicts, low overrides) appear in the promotion queue with a confidence assessment.

### Demotion Queue

Surfaces with rising override rates or degrading verdicts appear in the demotion queue — a signal that canon may need revision before enforcement can continue.

### Alert Engine

7 alert categories with configurable thresholds:

| Category | Trigger |
|----------|---------|
| `promotion_ready` | Surface meets promotion criteria |
| `newly_stale` | Repo hasn't been scanned recently |
| `override_spike` | Override rate exceeds threshold |
| `canon_changed` | Canon version changed |
| `policy_changed` | Gate policy was modified |
| `alert_resolved` | Previous alert condition cleared |
| `alert_new` | New condition detected |

### Org Actions

Preview, apply, and rollback policy changes across repos:

```bash
taste org actions queue --dir /path/to/portfolio
taste org actions preview <repo> <surface> <mode>
taste org actions apply <action-id>
taste org actions rollback <action-id> --reason "..."
taste org actions history --dir /path/to/portfolio
```

Every action creates an **audit receipt** with before/after policy snapshots.

## Watchtower

For ongoing operational awareness:

```bash
taste watchtower scan --dir /path/to/portfolio     # Take a snapshot
taste watchtower history --dir /path/to/portfolio   # View scan history
taste watchtower delta --dir /path/to/portfolio     # Changes since last scan
taste watchtower digest --dir /path/to/portfolio    # Full digest with action items
taste watchtower digest --dir /path/to/portfolio --json  # Machine-readable
```

## Operator Workbench

A dark-theme React UI for daily operations:

```bash
taste workbench --dir /path/to/portfolio --port 3200
```

Open `http://localhost:3200` to see:
- Org matrix with repo status cards
- Promotion and demotion queues
- Repo detail with review history
- Action management (preview, apply, rollback)
- Alert dashboard
