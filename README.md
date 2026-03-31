<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/taste-engine/readme.png" alt="Taste Engine" width="400">
</p>

<h3 align="center">Canon-and-judgment system for creative and product work</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/taste-engine"><img src="https://img.shields.io/npm/v/@mcptoolshop/taste-engine" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/taste-engine/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mcp-tool-shop-org/taste-engine" alt="license"></a>
  <a href="https://github.com/mcp-tool-shop-org/taste-engine"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node version"></a>
</p>

---

Taste Engine ingests a repo's doctrine (READMEs, architecture docs, design notes), extracts canon statements through multi-pass LLM analysis, and uses that curated canon to review any new artifact for alignment. When drift is detected, it generates repair suggestions or full redirections — all running locally against Ollama with no paid API required.

## Threat Model

Taste Engine operates **locally only**. It reads project files from disk, stores working state in a local SQLite database (`.taste/taste.db`) and JSON canon files (`canon/`). The only network call is to a local Ollama instance at `127.0.0.1:11434`. The optional workbench UI binds to `localhost:3200`. No telemetry is collected. No secrets or credentials are handled. No data leaves your machine.

## Install

```bash
npm install -g @mcptoolshop/taste-engine
```

Requires [Node.js](https://nodejs.org/) >= 20 and [Ollama](https://ollama.ai/) running locally with a model pulled (e.g., `ollama pull qwen2.5:14b`).

## Quick Start

```bash
# Initialize a project
taste init my-project --root ./my-project

# Check environment health
taste doctor

# Ingest source artifacts (READMEs, docs, design notes)
taste ingest README.md docs/architecture.md

# Extract canon statements (multi-pass, Ollama-powered)
taste extract run

# Curate: review candidates, accept/reject/edit
taste curate queue
taste curate accept <id>

# Freeze canon version
taste curate freeze --tag v1

# Review an artifact against curated canon
taste review run path/to/artifact.md

# Run the workflow gate on changed files
taste gate run
```

## What It Does

**Extract** — 8 specialized passes analyze your source documents for thesis statements, design rules, anti-patterns, voice/naming conventions, and more. Duplicate detection via Jaccard similarity consolidates overlapping findings.

**Curate** — Human-in-the-loop curation: accept, reject, edit, merge, or defer extracted candidates. Resolve contradictions. Freeze versions for reproducible reviews.

**Review** — Scores artifacts across 4 dimensions (thesis preservation, pattern fidelity, anti-pattern collision, voice/naming fit). A deterministic verdict ladder (aligned → mostly_aligned → salvageable_drift → hard_drift → contradiction) overrides the model — rules cannot be talked down.

**Repair** — Three repair modes based on drift severity:
- **Patch** (1A) — Minimal edits to fix surface drift
- **Structural** (1B) — Goal extraction + fault diagnosis + concept replacement
- **Redirect** (2C) — Full goal redirection with 2-3 canon-compatible alternatives

**Gate** — Enforcement modes (advisory/warn/required) with CI exit codes, override receipts, and promotion doctrine per artifact type.

**Portfolio** — Onboard repos with policy presets, detect drift families across projects, track graduation patterns, generate adoption recommendations.

**Org** — Control plane for multi-repo rollout: promotion queues, demotion triggers, 7-category alert engine, preview/apply/rollback actions with audit receipts.

**Watchtower** — Snapshot-based change detection with delta engine and digest generation for daily operational awareness.

**Workbench** — Dark-theme React operator UI at localhost:3200 with 13 API endpoints for org matrix, queues, repo detail, and action management.

## CLI Reference

68 commands organized under these groups:

| Group | Commands |
|-------|----------|
| `taste init` | Initialize project |
| `taste doctor` | Environment health check |
| `taste ingest` | Ingest source artifacts |
| `taste canon` | Canon status and management |
| `taste extract` | Run extraction, view candidates/contradictions/exemplars |
| `taste curate` | Queue, accept, reject, edit, merge, freeze |
| `taste review` | Run reviews, list results, view packets |
| `taste calibrate` | Feedback, summary, statements, findings |
| `taste revise` | Patch revision with re-review |
| `taste repair` | Structural repair for deep drift |
| `taste redirect` | Goal redirection for irreparable artifacts |
| `taste gate` | Run gate, manage policy, record overrides, rollout report |
| `taste onboard` | Repo onboarding, reports, recommendations |
| `taste portfolio` | Cross-repo matrix, findings, export |
| `taste org` | Org matrix, queues, alerts, actions (preview/apply/rollback) |
| `taste watchtower` | Scan, history, delta, digest |
| `taste workbench` | Start operator web UI |

Run `taste --help` or `taste <command> --help` for full usage.

## Architecture

```
src/
  core/         # Schema, types, enums, validation (Zod), IDs
  db/           # SQLite persistence, migrations
  canon/        # Canon store, versioning, file I/O
  extraction/   # 8-pass extraction, prompts, consolidation
  review/       # Canon packet, dimension prompts, verdict synthesis
  revision/     # Patch revision engine
  repair/       # Structural repair (goal → fault → concept → draft)
  redirect/     # Goal redirection briefs
  gate/         # Workflow gate, policy, overrides, rollout reports
  onboard/      # Source scanner, presets, recommendations
  portfolio/    # Cross-repo intelligence
  org/          # Org control plane, alerts, actions
  watchtower/   # Snapshot engine, delta, digest
  workbench/    # Express API + React UI
  cli/          # Commander CLI (68 commands)
  util/         # JSON, timestamps, Ollama client
```

## Supported Platforms

- **OS:** Windows, macOS, Linux
- **Runtime:** Node.js >= 20
- **LLM:** Ollama (local) — tested with qwen2.5:14b

## License

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
