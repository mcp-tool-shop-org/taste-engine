# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

Taste Engine operates **locally only**.

- **Data touched:** Local SQLite database (`.taste/taste.db`), JSON canon files (`canon/`), gate policy files, watchtower snapshots. All within the project's `.taste/` directory and `canon/` directory.
- **Ollama calls:** Sends artifact text and canon statements to a local Ollama instance (`127.0.0.1:11434` by default). No cloud API calls.
- **Workbench server:** Binds to `localhost` only (default port 3200). No external network exposure.
- **No network egress** beyond localhost Ollama.
- **No secrets handling** — does not read, store, or transmit credentials, API keys, or tokens.
- **No telemetry** is collected or sent.
- **No file writes** outside `.taste/`, `canon/`, and `proving/` directories.
