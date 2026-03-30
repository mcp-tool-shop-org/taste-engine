## Feature: Direct Database API for External Tools

Expose the SQLite execution database through a REST API so external tools (Grafana, custom dashboards, CI pipelines) can read and write run state directly. This enables rich integrations without going through the CLI.

**Endpoints:**
- `GET /api/runs` — list all runs
- `POST /api/runs/:id/approve` — approve a run programmatically
- `PUT /api/packets/:id/state` — update packet state directly
- `DELETE /api/runs/:id` — delete a run

**Why:** Operators want to integrate Multi-Claude into their existing toolchains. Direct API access to the database removes the CLI bottleneck.