# Ship Gate

> No repo is "done" until every applicable line is checked.

**Tags:** `[all]` every repo · `[npm]` published artifacts · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-03-30)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-03-30)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-03-30)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-03-30)

### Default safety posture

- [x] `[cli]` Dangerous actions (kill, delete, restart) require explicit `--allow-*` flag (2026-03-30) — gate actions require explicit apply with action ID
- [x] `[cli]` File operations constrained to known directories (2026-03-30) — writes only to .taste/, canon/, proving/
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [x] `[all]` Errors follow structured shape with descriptive messages (2026-03-30)
- [x] `[cli]` Exit codes: 0 ok · 1 user error · 2 runtime error (2026-03-30) — gate uses exit 1 for required-mode failures
- [x] `[cli]` No raw stack traces without `--debug` (2026-03-30) — Commander handles error display
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-03-30)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-03-30)
- [x] `[all]` LICENSE file present and repo states support status (2026-03-30)
- [x] `[cli]` `--help` output accurate for all commands and flags (2026-03-30)
- [x] `[cli]` Logging levels defined: silent / normal / verbose / debug — secrets redacted at all levels (2026-03-30) — no secrets to redact, structured output only
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[complex]` SKIP: handbook will be created in Phase 3 (soft gate E)

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build + smoke in one command) (2026-03-30)
- [x] `[all]` Version in manifest matches git tag (2026-03-30) — v1.0.0
- [ ] `[all]` SKIP: Dependency scanning — no CI configured yet (manual repo, no Actions minutes)
- [ ] `[all]` SKIP: Automated dependency updates — manual repo
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE (2026-03-30)
- [x] `[npm]` `engines.node` set (2026-03-30)
- [x] `[npm]` Lockfile committed (2026-03-30)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-03-30)
- [ ] `[all]` Translations (polyglot-mcp, 8 languages)
- [ ] `[org]` Landing page (@mcptoolshop/site-theme)
- [ ] `[all]` GitHub repo metadata: description, homepage, topics

---

## Gate Rules

**Hard gate (A–D):** All checked or SKIP with justification.
**Soft gate (E):** In progress — translations and landing page pending.
