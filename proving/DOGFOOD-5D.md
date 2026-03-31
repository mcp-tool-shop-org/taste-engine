# Phase 5D Dogfood Log

**Date:** 2026-03-31
**Operator:** Claude
**Portfolio:** 5 repos (role-os, multi-claude, code-bearings, dogfood-labs, repo-knowledge)

## System State

- 5 repos, all gate-ready
- 71 total canon statements
- 1 active alert (repo-knowledge: missing voice/naming)
- 6 historical actions (4 promotions, 1 demotion, 1 rollback)

## Actions Taken

### Promotions tested
- `dogfood-labs/readme_section` advisory → warn — applied successfully
- Immediate rollback tested — clean, policy reverted

### Backup/export tested
- Portfolio backup: 7 repos, 22 files, 2.7 MB — works
- State export: 5 policies, 6 actions, 3 snapshots — works
- State import dry-run: all 7 items previewed correctly — works
- Restore dry-run: correctly shows overwrite vs create — works

### Watchtower tested
- Scan: clean, 5 repos detected
- Delta: correctly shows "no changes since last scan"
- Digest: summary + action items working

## Friction Found

1. **`--dir` required everywhere for org/portfolio/watchtower** — operators managing a single portfolio type it on every command. Consider: env var `TASTE_PORTFOLIO_DIR` or config option.

2. **No confirmation before destructive actions** — `backup import` and `backup restore` overwrite files without asking. The `--dry-run` flag helps, but a `--force` flag with default prompt would be safer.

3. **Action history shows all-time** — no date filtering. For daily use, `--since today` or `--limit 10` would reduce noise.

4. **Watchtower digest has no "nothing to do" message** — when there are 0 action items, it just... stops. A "No action items. Portfolio is healthy." line would be reassuring.

5. **Init next-steps message assumes single-repo use** — when an operator is setting up repos inside a portfolio, the next steps should mention `taste gate policy-init` and portfolio commands too.

## False Positives

- **None detected in this run.** The alert system correctly identified repo-knowledge as needing voice/naming enrichment. No phantom alerts.

## Skipped Actions

- Did not actually promote all 14 queued surfaces — would need real Ollama reviews against each surface to validate. The promotion queue is advisory only.
- Did not run re-extraction — would need Ollama running.

## Missing Ergonomics

1. **`TASTE_PORTFOLIO_DIR` env var** — saves typing `--dir ./proving` on every command
2. **`taste status`** — one-liner combining digest + alerts + queue summary
3. **`taste backup auto`** — pre-backup before every apply action (opt-in)
4. **Action confirmation prompt** — "Apply warn to dogfood-labs/readme_section? [y/N]"
5. **`--limit` on action history** — default to last 20

## Verdict

The system is **operable**. Backup/restore works end-to-end. Rollback is clean. Error messages are clear. The main friction is repetitive `--dir` flags and missing convenience shortcuts — all fixable without structural changes.
