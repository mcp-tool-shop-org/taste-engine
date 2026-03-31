const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');

const dbPath = process.argv[2];
if (!dbPath) { console.error('Usage: node bulk-accept.js <db-path>'); process.exit(1); }

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const project = db.prepare('SELECT * FROM projects LIMIT 1').get();
if (!project) { console.log('No project'); process.exit(1); }

const candidates = db.prepare("SELECT * FROM extracted_candidates WHERE status = 'proposed' AND project_id = ?").all(project.id);
const now = () => new Date().toISOString().replace('Z', '+00:00');

let accepted = 0;
for (const c of candidates) {
  const stmtId = randomUUID();
  const ts = now();

  db.prepare(`INSERT INTO canon_statements (id, project_id, canon_version, text, statement_type, lifecycle, hardness, scope, artifact_types, tags, rationale, confidence, replacement_statement_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(
    stmtId, project.id, c.text, c.statement_type, c.suggested_hardness,
    c.suggested_scope, c.suggested_artifact_types, c.tags, c.rationale,
    c.confidence, ts, ts
  );

  db.prepare("UPDATE extracted_candidates SET status = 'accepted' WHERE id = ?").run(c.id);

  db.prepare(`INSERT INTO curation_decisions (id, project_id, extraction_run_id, candidate_id, target_statement_id, action, reason, authored_text, created_at) VALUES (?, ?, ?, ?, ?, 'accept', NULL, NULL, ?)`).run(
    randomUUID(), project.id, c.extraction_run_id, c.id, stmtId, ts
  );

  accepted++;
}

console.log('Accepted: ' + accepted + ' statements');
db.close();
