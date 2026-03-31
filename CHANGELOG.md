# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-03-30

### Added

- **Phase 0A–0E: Canon Foundation** — Schema, SQLite persistence, multi-pass extraction (8 passes), human curation loop, artifact review with 4-dimension scoring, calibration feedback engine
- **Phase 0 Proving Run** — 15 role-os artifacts reviewed, verdict calibration fixes applied, multi-claude transfer trial confirmed portability
- **Phase 1A: Revision Mode** — Patch-first repair with re-review pipeline
- **Phase 1B: Structural Repair** — Goal extraction, fault diagnosis, concept replacement for deep drift
- **Phase 2A: Workflow Gate** — Artifact detection, enforcement modes (advisory/warn/required), CI exit codes
- **Phase 2B: Live Rollout** — Gate policy per repo, override receipts with audit trail, promotion doctrine
- **Phase 2C: Goal Redirection** — Briefs for irreparable artifacts with 2-3 canon-compatible directions
- **Phase 3A: Portfolio Onboarding** — Source scanning, policy presets (advisory-starter, docs-heavy, product-copy), guided setup
- **Phase 3B: Portfolio Rollout** — Full adoption path tested on 5 repos (role-os, multi-claude, code-bearings, dogfood-labs, repo-knowledge)
- **Phase 3C: Portfolio Intelligence** — Drift family detection, graduation patterns, preset fit analysis, cross-repo findings
- **Phase 3D: Guided Adoption** — Repo-shape classifier with confidence-aware recommendations
- **Phase 4A: Org Control Plane** — Portfolio matrix, promotion queue, demotion queue, org-wide status
- **Phase 4B: Org Automation** — Alert engine with 7 categories, configurable thresholds, demotion triggers
- **Phase 4C: Org Actions** — Preview/apply/rollback with policy diff and audit receipts
- **Phase 5A: Operator Workbench** — Express API (13 endpoints) + React dark-theme UI at localhost:3200
- **Phase 5B: Scheduled Watchtower** — Snapshot-based change detection, delta engine, digest generation
- 68 CLI commands across init/doctor/ingest/extract/curate/canon/review/calibrate/revise/repair/redirect/gate/onboard/portfolio/org/watchtower/workbench
- 404 tests across 43 test files
- Ollama-first local LLM inference (qwen2.5:14b proven, no paid API)
- Deterministic verdict synthesis with rule-backed verdict ladder
- SQLite + JSON dual persistence
