# Phase 6A — External Pilot Report

**Date:** 2026-03-31
**Operator:** Claude
**Model:** qwen2.5:14b (Ollama local)

## Pilot Repos

| Repo | Doc Maturity | Ingested | Extracted | Frozen | Gate |
|------|-------------|----------|-----------|--------|------|
| CommandUI | Doctrine-rich (40 handbook pages) | 4 files | 20 statements | v1-pilot | PASS (real), WARN+contradiction (off-brand) |
| Sensor-Humor | Sparse (README only) | 1 file | 15 statements | v1-pilot | PASS (real) |
| Registry-Stats | Moderate (dense README) | 1 file | 0 — extraction failed | N/A | N/A |

## Success Scorecard

### Time to First Frozen Canon
- CommandUI: ~3 min (extraction) + ~1 min (accept-all + freeze) = **~4 min**
- Sensor-Humor: ~2 min (extraction) + ~1 min = **~3 min**
- Registry-Stats: **Failed** — model produced malformed JSON on all 8 passes across 2 attempts

### Time to First Useful Gate
- CommandUI: ~1 min after freeze (policy-init + gate run) = **~5 min total from init**
- Sensor-Humor: **~4 min total from init**

### False Positive Rate
- CommandUI: 0 false positives on real README (correct PASS)
- Sensor-Humor: 0 false positives on real README (correct PASS)
- Off-brand test: correctly identified all 4 violations (chatbot, autonomous, cloud, ChatGPT comparison)
- **Overall: 0% false positive rate on 3 gate runs**

### Extraction Quality
- CommandUI (20 statements): Good coverage — 4 thesis, 5 pattern, 4 boundary, 3 decision, 2 voice, 1 naming, 1 anti-pattern. Captures core identity ("not a chatbot", "local-first", 6-layer architecture)
- Sensor-Humor (15 statements): Good coverage — 2 thesis, 2 pattern, 4 boundary, 4 decision, 1 voice, 1 naming, 1 anti-pattern. Captures mood-based comedy pattern and "never overwrites host LLM" boundary
- Some duplication between statement types (thesis + boundary + decision all capturing "not a chatbot" for CommandUI) — expected and tolerable since they serve different review dimensions

### Gate Signal Quality
- Real README → PASS: correct (canon was extracted from it)
- Off-brand README → WARN + contradiction verdict + "irreparable" repair: **exactly correct**
- The gate caught 4 specific violations with precise language
- Repair mode correctly identified this as irreparable (needs rewrite, not patch)

### Extraction Failure Analysis (Registry-Stats)
- All 8 passes failed with malformed JSON or missing required fields
- The README has 17KB of content — not too small
- Likely cause: the README format (heavy tables, badges, CLI output blocks) confuses the model's JSON generation
- This is a real product gap: extraction needs retry logic or prompt hardening for table-heavy READMEs
- **Filed as known limitation for v1.0.0**

## Exit Criteria Assessment

| Criterion | Met? | Evidence |
|-----------|------|----------|
| 2 external repos complete onboarding | **YES** | CommandUI + Sensor-Humor: init → ingest → extract → curate → freeze → gate |
| At least 1 reaches useful advisory gating | **YES** | Both repos have working advisory gates |
| False positives stay tolerable | **YES** | 0% false positive rate across 3 gate runs |
| Repair/redirect outputs feel genuinely helpful | **YES** | Off-brand surface got "irreparable" + specific violation list |
| Install/run docs good enough without narration | **YES** | README quickstart + QUICKSTART.md + samples/ + RUNBOOK.md |

## RC Boundary Declaration

### What's IN for v1.0.0

- 8-pass extraction (thesis, pattern, anti-pattern, voice/naming, decision, boundary, contradiction, exemplar)
- Human-in-the-loop curation (accept, reject, edit, merge, defer, resolve contradictions)
- Versioned canon freeze
- 4-dimension review scoring (thesis preservation, pattern fidelity, anti-pattern collision, voice/naming fit)
- Deterministic verdict ladder (aligned → mostly_aligned → salvageable_drift → hard_drift → contradiction)
- 3 repair modes (patch, structural, redirect)
- Workflow gate with 3 enforcement modes (advisory, warn, required)
- Override receipts with audit trail
- Portfolio onboarding with presets and recommendations
- Org control plane (matrix, queues, alerts, actions with preview/apply/rollback)
- Watchtower (snapshots, delta, digest)
- Operator workbench (Express + React)
- Backup/restore/export/import with dry-run support
- TASTE_PORTFOLIO_DIR env var
- `taste status` one-liner
- 68 CLI commands
- 415 tests across 46 files
- QUICKSTART.md, RUNBOOK.md, samples/

### What's OUT for v1.0.0 (deferred to v1.1+)

- Extraction retry logic for malformed model output (registry-stats failure mode)
- Prompt hardening for table-heavy / badge-heavy READMEs
- `taste extract run --retry N` flag
- Batch extraction across portfolio repos
- CI integration examples (GitHub Actions workflow)
- MCP server mode
- Web-based curation UI (currently CLI only)
- Multi-model support (currently Ollama-only)

### Version

**v1.0.0-rc1** — Release candidate. All exit criteria met. One known extraction failure mode documented. No blocking issues.
