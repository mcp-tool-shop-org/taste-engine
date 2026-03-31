#!/bin/bash
CLI="node ../../dist/cli/index.js"

echo "=========================================="
echo "PHASE 3B — PORTFOLIO ROLLOUT TRIALS"
echo "=========================================="

for REPO in code-bearings dogfood-labs repo-knowledge; do
  echo ""
  echo "=========================================="
  echo "REPO: $REPO"
  echo "=========================================="

  cd "F:/AI/taste-engine/proving/$REPO"

  echo ""
  echo "--- Extract (core + voice) ---"
  $CLI extract run --core
  echo ""
  $CLI extract run --passes voice_naming
  echo ""

  echo "--- Candidates ---"
  $CLI extract candidates --status proposed 2>&1 | grep -E "^\[|^$" | head -30
  echo ""

  echo "--- Accept all proposed candidates ---"
  # Accept all proposed candidates automatically for rollout trial
  node -e "
    const Database = require('better-sqlite3');
    const db = new Database('.taste/taste.db');
    const rows = db.prepare(\"SELECT id FROM extracted_candidates WHERE status = 'proposed'\").all();
    console.log('Accepting ' + rows.length + ' candidates...');
    db.close();
  "

  # Use node to do bulk accept since we need cross-run lookup
  node -e "
    const Database = require('better-sqlite3');
    const db = new Database('.taste/taste.db');
    db.pragma('foreign_keys = ON');

    const project = db.prepare('SELECT * FROM projects LIMIT 1').get();
    if (!project) { console.log('No project'); process.exit(1); }

    const candidates = db.prepare(\"SELECT * FROM extracted_candidates WHERE status = 'proposed' AND project_id = ?\").all(project.id);

    const { randomUUID } = require('node:crypto');
    const now = () => new Date().toISOString().replace('Z', '+00:00');

    let accepted = 0;
    for (const c of candidates) {
      const stmtId = randomUUID();
      const ts = now();

      db.prepare('INSERT INTO canon_statements (id, project_id, canon_version, text, statement_type, lifecycle, hardness, scope, artifact_types, tags, rationale, confidence, replacement_statement_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, \"accepted\", ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(
        stmtId, project.id, c.text, c.statement_type, c.suggested_hardness,
        c.suggested_scope, c.suggested_artifact_types, c.tags, c.rationale,
        c.confidence, ts, ts
      );

      db.prepare('UPDATE extracted_candidates SET status = \"accepted\" WHERE id = ?').run(c.id);

      db.prepare('INSERT INTO curation_decisions (id, project_id, extraction_run_id, candidate_id, target_statement_id, action, reason, authored_text, created_at) VALUES (?, ?, ?, ?, ?, \"accept\", NULL, NULL, ?)').run(
        randomUUID(), project.id, c.extraction_run_id, c.id, stmtId, ts
      );

      accepted++;
    }

    console.log('Accepted: ' + accepted + ' statements');
    db.close();
  "
  echo ""

  echo "--- Canon status ---"
  $CLI canon status
  echo ""

  echo "--- Freeze canon-v1 ---"
  $CLI canon freeze --label canon-v1 --notes "Rollout trial: auto-accepted from extraction" --force
  echo ""

  echo "--- Onboard report (post-freeze) ---"
  $CLI onboard report
  echo ""

  echo "--- Gate report ---"
  $CLI gate report
  echo ""

  echo "=== $REPO COMPLETE ==="
done

echo ""
echo "=========================================="
echo "ALL REPOS PROCESSED"
echo "=========================================="
