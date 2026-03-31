# Sample Portfolio Layout

A portfolio is a directory containing one or more taste-managed repos.

```
portfolio/
  my-app/                     # A taste-managed repo
    .taste/
      taste.json              # Project config
      taste.db                # SQLite database (auto-created)
      gate-policy.json        # Gate enforcement policy
    canon/
      my-app-v1.json          # Frozen canon snapshot
    README.md                 # Source artifact + gate surface
    docs/
      architecture.md         # Source artifact
  another-repo/
    .taste/
      taste.json
    canon/
      another-repo-v1.json
    README.md
```

## Environment Variable

Set `TASTE_PORTFOLIO_DIR` to avoid passing `--dir` on every command:

```bash
export TASTE_PORTFOLIO_DIR=./portfolio
taste status          # no --dir needed
taste org matrix
taste watchtower scan
```

## Onboarding a New Repo

```bash
taste init my-app --root portfolio/my-app
taste ingest README.md docs/ --root portfolio/my-app
taste extract run --root portfolio/my-app
taste curate queue --root portfolio/my-app
taste curate accept-all --root portfolio/my-app
taste canon freeze --root portfolio/my-app --label v1
taste gate policy-init --root portfolio/my-app
```
