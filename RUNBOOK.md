# Operator Runbook

Daily operations guide for Taste Engine. Covers the most common workflows an operator performs.

## Prerequisites

- Node.js >= 20
- Ollama running locally with `qwen2.5:14b` (or `qwen3:14b`) pulled
- Taste Engine installed: `npm install -g @mcptoolshop/taste-engine`

---

## 1. Onboard a New Repo

### Quick path

```bash
cd /path/to/repo
taste init my-repo --name "My Repo" --check
taste ingest README.md docs/
taste extract run
taste curate queue
```

### With portfolio context

```bash
taste onboard run --slug my-repo --root /path/to/repo \
  --repo-path /path/to/repo --preset advisory-starter --auto-ingest
```

### What to check after onboarding

1. `taste doctor` — all green
2. `taste extract candidates` — reasonable statements extracted (not all generic)
3. `taste curate queue` — candidates ready for review

---

## 2. Curate and Freeze Canon

### Review the queue

```bash
taste curate queue                      # see all pending
taste curate inspect <id>               # read details + evidence
```

### Make decisions

```bash
taste curate accept <id>                # accept as-is
taste curate edit <id> --text "..."     # accept with modifications
taste curate reject <id> --reason "..." # reject with reason
taste curate defer <id>                 # come back later
taste curate merge <id1> <id2>          # merge duplicates
```

### Handle contradictions

```bash
taste curate contradictions
taste curate resolve-contradiction <id> --action resolve --note "Keeping the stronger rule"
```

### Freeze when done

```bash
taste curate freeze --tag v1 --notes "Initial canon"
```

**Important:** Reviews always run against frozen canon. No freeze = no reviews.

---

## 3. Promote a Surface

### Check readiness

```bash
taste org queue --dir ./portfolio
taste org actions preview --dir ./portfolio --repo my-repo --surface readme --to warn
```

### Apply the promotion

```bash
taste org actions apply --dir ./portfolio --repo my-repo \
  --surface readme --to warn --reason "Strong canon, consistent reviews"
```

### Verify

```bash
taste gate policy --root /path/to/my-repo    # confirm mode changed
taste org matrix --dir ./portfolio            # confirm in matrix
```

---

## 4. Handle Overrides

When a required-mode artifact fails gate but must ship:

```bash
taste gate override --root /path/to/repo \
  --artifact docs/brief.md \
  --type feature_brief \
  --verdict hard_drift \
  --gate block \
  --action defer_repair \
  --reason "Shipping for Q2 deadline, repair tracked in issue #42"
```

### Review override history

```bash
taste gate report --root /path/to/repo
taste org overrides --dir ./portfolio
```

### Respond to override spikes

If watchtower flags an override spike:

1. `taste org overrides --dir ./portfolio` — identify the repo
2. `taste gate report --root /path/to/repo` — see override reasons
3. Consider: Is canon too strict? Demote the surface temporarily.

```bash
taste org actions apply --dir ./portfolio --repo my-repo \
  --surface feature_brief --to advisory --reason "Canon needs revision, too many overrides"
```

---

## 5. Use Watchtower Deltas

### Daily scan

```bash
taste watchtower scan --dir ./portfolio
taste watchtower digest --dir ./portfolio
```

### Read the delta

```bash
taste watchtower delta --dir ./portfolio
```

Icons in delta output:
- `[+]` — new (promotion ready, enrichment done)
- `[!]` — attention needed (newly stale, override spike, new alert)
- `[~]` — changed (canon, policy)
- `[ok]` — resolved

### Machine-readable output

```bash
taste watchtower digest --dir ./portfolio --json > digest.json
```

---

## 6. Recover from Bad Rollout Moves

### Rollback an action

```bash
taste org actions history --dir ./portfolio    # find the action ID
taste org actions rollback --dir ./portfolio --id <action-id> \
  --reason "Canon wasn't ready for required mode"
```

### Restore from backup

Before any risky operation, back up:

```bash
taste backup portfolio --dir ./portfolio -o ./backups
```

If things go wrong:

```bash
# Preview what would be restored
taste backup restore --from ./backups/portfolio-2026-03-30T12-00-00 \
  --to ./portfolio --dry-run

# Restore for real
taste backup restore --from ./backups/portfolio-2026-03-30T12-00-00 \
  --to ./portfolio
```

### Export/import state

For moving state between environments:

```bash
# Export
taste backup export --dir ./portfolio -o state.json

# Import (with dry run first)
taste backup import --dir ./portfolio --from state.json --dry-run
taste backup import --dir ./portfolio --from state.json
```

---

## 7. Workbench Operations

### Start the workbench

```bash
taste workbench --dir ./portfolio --port 3200
```

Open http://localhost:3200 for the operator UI.

### Available views

- **Org Matrix** — all repos with canon state, gate readiness, surfaces
- **Queue** — promotion and demotion candidates with recommendations
- **Repo Detail** — per-repo deep dive with alerts and action history
- **Action Management** — preview, apply, rollback from the UI

### API endpoints

All available at `http://localhost:3200/api/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/org/matrix` | GET | Org status matrix |
| `/api/org/alerts` | GET | Active alerts |
| `/api/org/queue` | GET | Promotion/demotion queue |
| `/api/org/repo/:slug` | GET | Repo detail |
| `/api/org/actions/preview` | POST | Preview policy change |
| `/api/org/actions/apply` | POST | Apply policy change |
| `/api/org/actions/rollback` | POST | Rollback action |
| `/api/org/actions/history` | GET | Action history |
| `/api/portfolio/findings` | GET | Cross-repo findings |
| `/api/watchtower/scan` | POST | Trigger scan |
| `/api/watchtower/delta` | GET | Latest delta |
| `/api/watchtower/digest` | GET | Full digest |
| `/api/watchtower/history` | GET | Scan history |

---

## 8. Backup Cadence

**Recommended schedule:**

| When | What |
|------|------|
| Before any promotion/demotion | `taste backup portfolio --dir ./portfolio -o ./backups` |
| Weekly | `taste backup export --dir ./portfolio -o state-$(date +%F).json` |
| Before canon re-extraction | `taste backup repo -r /path/to/repo -o ./backups` |

**Retention:** Keep the last 5 portfolio backups and last 10 state exports.
