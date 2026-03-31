# Quickstart

Get from zero to a working taste gate in under 10 minutes.

## Prerequisites

- Node.js >= 20
- Ollama running locally (`ollama serve`)
- A model pulled: `ollama pull qwen2.5:14b`

## Install

```bash
npm install -g @mcptoolshop/taste-engine
```

## 1. Initialize

```bash
mkdir my-project && cd my-project
taste init my-project
taste doctor   # verify Ollama is reachable
```

This creates `.taste/taste.json` and `.taste/taste.db`.

## 2. Ingest Source Docs

Feed it your project's doctrine — READMEs, architecture docs, design notes:

```bash
taste ingest README.md docs/architecture.md docs/design-decisions.md
```

## 3. Extract Canon

Run the 8-pass extraction (thesis, pattern, anti-pattern, voice/naming, decision, boundary, contradiction, exemplar):

```bash
taste extract run
```

This takes 1-3 minutes depending on document size and model speed.

## 4. Curate

Review what was extracted:

```bash
taste curate queue              # see all pending candidates
taste curate inspect <id>       # look at one in detail
taste curate accept <id>        # accept into canon
taste curate reject <id>        # reject with reason
taste curate accept-all         # accept everything (fast path)
```

## 5. Freeze Canon

Lock a versioned snapshot:

```bash
taste canon freeze --label v1
```

## 6. Set Up the Gate

```bash
taste gate policy-init          # creates .taste/gate-policy.json (advisory mode)
```

Edit `gate-policy.json` to promote surfaces to `warn` or `required` as confidence grows.

## 7. Run the Gate

```bash
taste gate run                          # check all changed files
taste gate run --files README.md        # check specific files
taste gate run --mode required          # override to required mode
```

The gate scores each artifact against your frozen canon and reports: PASS, WARN, or BLOCK.

## 8. Review and Repair (Optional)

For deeper analysis on specific artifacts:

```bash
taste review run docs/new-feature.md    # full 4-dimension review
taste repair run docs/new-feature.md    # structural repair suggestions
taste redirect run docs/off-topic.md    # full goal redirection
```

## Portfolio Mode

Managing multiple repos? Use a portfolio directory:

```bash
export TASTE_PORTFOLIO_DIR=./portfolio
taste status                    # one-liner overview
taste org matrix                # cross-repo health
taste watchtower scan           # snapshot for change tracking
taste watchtower digest         # daily operational digest
```

See `samples/portfolio-layout/` for the recommended directory structure.

## What's Next

- Edit `gate-policy.json` to promote README surfaces from advisory to warn
- Run `taste gate report` to see promotion readiness per surface type
- See `RUNBOOK.md` for daily operator workflows
- See `samples/` for example configs and portfolio layouts
