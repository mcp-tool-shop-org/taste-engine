import type Database from "better-sqlite3";
import type {
  CalibrationFinding,
  FindingCategory,
  FindingSeverity,
  StatementUtility,
  ArtifactTypeMetrics,
  ProjectMetrics,
} from "./calibration-types.js";
import {
  computeProjectMetrics,
  computeStatementUtility,
  computeArtifactTypeMetrics,
} from "./calibration-store.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

// ── Thresholds ─────────────────────────────────────────────────

const OVER_SELECTED_MIN_COUNT = 5;
const OVER_SELECTED_CITATION_THRESHOLD = 0.15;
const NOISE_RATE_THRESHOLD = 0.2;
const RIGIDITY_RATE_THRESHOLD = 0.25;
const MISSED_DRIFT_THRESHOLD = 0.25;
const WRONG_PACKET_THRESHOLD = 0.3;
const AGREEMENT_LOW_THRESHOLD = 0.5;
const MIN_FEEDBACK_FOR_FINDINGS = 3;

// ── Finding Generation ─────────────────────────────────────────

export function generateFindings(
  db: Database.Database,
  projectId: string,
): CalibrationFinding[] {
  const metrics = computeProjectMetrics(db, projectId);
  const stmtUtils = computeStatementUtility(db, projectId);
  const typeMetrics = computeArtifactTypeMetrics(db, projectId);

  if (metrics.feedback_count < MIN_FEEDBACK_FOR_FINDINGS) {
    return [];
  }

  const findings: CalibrationFinding[] = [];

  // Statement-level findings
  findings.push(...findOverSelectedStatements(stmtUtils));
  findings.push(...findNoisyStatements(stmtUtils));
  findings.push(...findRigidityStatements(stmtUtils));

  // Artifact-type findings
  findings.push(...findArtifactTypeGaps(typeMetrics));

  // Project-level findings
  findings.push(...findProjectLevelIssues(metrics));

  return findings;
}

function findOverSelectedStatements(utils: StatementUtility[]): CalibrationFinding[] {
  const findings: CalibrationFinding[] = [];

  for (const u of utils) {
    if (u.selected_count >= OVER_SELECTED_MIN_COUNT && u.citation_rate < OVER_SELECTED_CITATION_THRESHOLD) {
      findings.push(makeFinding(
        "retrieval",
        `Over-selected: "${u.statement_text.slice(0, 60)}..."`,
        `Statement selected ${u.selected_count} times but cited only ${(u.citation_rate * 100).toFixed(0)}% of the time. May be over-ranked in packet assembly.`,
        u.selected_count >= 10 ? "high" : "medium",
        [u.statement_id],
        ["Review packet ranking for this statement", "Consider narrowing artifact_type targeting"],
      ));
    }
  }

  return findings;
}

function findNoisyStatements(utils: StatementUtility[]): CalibrationFinding[] {
  const findings: CalibrationFinding[] = [];

  for (const u of utils) {
    if (u.selected_count >= OVER_SELECTED_MIN_COUNT && u.noise_rate > NOISE_RATE_THRESHOLD) {
      findings.push(makeFinding(
        "retrieval",
        `Noisy: "${u.statement_text.slice(0, 60)}..."`,
        `Statement flagged as noisy in ${(u.noise_rate * 100).toFixed(0)}% of reviews where it appeared. May need scope narrowing.`,
        u.noise_rate > 0.4 ? "high" : "medium",
        [u.statement_id],
        ["Narrow scope or artifact_type targeting", "Consider softening hardness"],
      ));
    }
  }

  return findings;
}

function findRigidityStatements(utils: StatementUtility[]): CalibrationFinding[] {
  const findings: CalibrationFinding[] = [];

  for (const u of utils) {
    if (u.false_rigidity_association >= 3) {
      findings.push(makeFinding(
        "rigidity",
        `Rigidity source: "${u.statement_text.slice(0, 60)}..."`,
        `Statement associated with false rigidity in ${u.false_rigidity_association} reviews. May be causing over-punishment.`,
        u.false_rigidity_association >= 5 ? "high" : "medium",
        [u.statement_id],
        ["Review hardness level", "Check if scope is too broad for some artifact types"],
      ));
    }
  }

  return findings;
}

function findArtifactTypeGaps(typeMetrics: ArtifactTypeMetrics[]): CalibrationFinding[] {
  const findings: CalibrationFinding[] = [];

  for (const tm of typeMetrics) {
    if (tm.review_count < 2) continue;

    if (tm.agreement_rate < AGREEMENT_LOW_THRESHOLD) {
      findings.push(makeFinding(
        "artifact_type_gap",
        `Low agreement on ${tm.artifact_type}`,
        `Only ${(tm.agreement_rate * 100).toFixed(0)}% agreement rate on ${tm.artifact_type} reviews (${tm.review_count} reviews). Review quality may be weak for this type.`,
        "high",
        [],
        ["Investigate whether canon covers this artifact type well", "Review packet composition for this type"],
      ));
    }

    if (tm.rigidity_rate > RIGIDITY_RATE_THRESHOLD) {
      findings.push(makeFinding(
        "rigidity",
        `Over-rigid on ${tm.artifact_type}`,
        `${(tm.rigidity_rate * 100).toFixed(0)}% rigidity rate on ${tm.artifact_type} reviews. Engine may be too harsh for this artifact type.`,
        "medium",
        [],
        ["Review dimension prompts for this artifact type", "Check if voice/naming canon is too strict"],
      ));
    }

    if (tm.missed_drift_rate > MISSED_DRIFT_THRESHOLD) {
      findings.push(makeFinding(
        "softness",
        `Missed drift on ${tm.artifact_type}`,
        `${(tm.missed_drift_rate * 100).toFixed(0)}% of ${tm.artifact_type} reviews missed important drift. Retrieval or judgment may be weak for this type.`,
        "medium",
        [],
        ["Check if relevant anti-patterns are being included in packet", "Review thesis pass prompt quality"],
      ));
    }

    if (tm.wrong_packet_rate > WRONG_PACKET_THRESHOLD) {
      findings.push(makeFinding(
        "retrieval",
        `Wrong packet composition for ${tm.artifact_type}`,
        `${(tm.wrong_packet_rate * 100).toFixed(0)}% of ${tm.artifact_type} reviews had wrong canon packet. Packet assembly may need artifact-type-specific tuning.`,
        "high",
        [],
        ["Review packet builder artifact_type rules", "Add artifact_type targeting to underused statements"],
      ));
    }
  }

  return findings;
}

function findProjectLevelIssues(metrics: ProjectMetrics): CalibrationFinding[] {
  const findings: CalibrationFinding[] = [];

  if (metrics.false_rigidity_rate > RIGIDITY_RATE_THRESHOLD) {
    findings.push(makeFinding(
      "rigidity",
      "System-wide over-rigidity",
      `${(metrics.false_rigidity_rate * 100).toFixed(0)}% of reviews flagged as too rigid. The engine may be punishing legitimate extension.`,
      "high",
      [],
      ["Review hard canon count — too many hard statements?", "Check if anti-pattern collision is overfiring"],
    ));
  }

  if (metrics.missed_drift_rate > MISSED_DRIFT_THRESHOLD) {
    findings.push(makeFinding(
      "softness",
      "System-wide missed drift",
      `${(metrics.missed_drift_rate * 100).toFixed(0)}% of reviews missed important drift. Judgment passes may be too lenient.`,
      "high",
      [],
      ["Review thesis and anti-pattern pass prompts", "Check if retrieval is pulling enough anti-patterns"],
    ));
  }

  if (metrics.weak_revision_rate > 0.4 && metrics.good_revision_rate < 0.3) {
    findings.push(makeFinding(
      "judgment",
      "Revision guidance quality low",
      `Revision guidance marked weak in ${(metrics.weak_revision_rate * 100).toFixed(0)}% of reviews but helpful in only ${(metrics.good_revision_rate * 100).toFixed(0)}%. Synthesis prompts may need revision.`,
      "medium",
      [],
      ["Review synthesis prompt for revision quality", "Consider providing stronger exemplars in review context"],
    ));
  }

  return findings;
}

// ── Persistence ────────────────────────────────────────────────

export function persistFindings(
  db: Database.Database,
  projectId: string,
  findings: CalibrationFinding[],
): void {
  // Clear old findings
  db.prepare("DELETE FROM calibration_findings WHERE project_id = ?").run(projectId);

  const stmt = db.prepare(
    `INSERT INTO calibration_findings (id, project_id, category, title, description, severity, evidence_refs, suggested_actions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const f of findings) {
    stmt.run(f.id, projectId, f.category, f.title, f.description, f.severity,
      JSON.stringify(f.evidence_refs), JSON.stringify(f.suggested_actions), f.created_at);
  }
}

export function getFindings(db: Database.Database, projectId: string): CalibrationFinding[] {
  const rows = db.prepare("SELECT * FROM calibration_findings WHERE project_id = ? ORDER BY severity DESC").all(projectId) as any[];
  return rows.map((r) => ({
    ...r,
    evidence_refs: JSON.parse(r.evidence_refs),
    suggested_actions: JSON.parse(r.suggested_actions),
  }));
}

function makeFinding(
  category: FindingCategory,
  title: string,
  description: string,
  severity: FindingSeverity,
  evidenceRefs: string[],
  suggestedActions: string[],
): CalibrationFinding {
  return {
    id: newId(),
    project_id: "",
    category,
    title,
    description,
    severity,
    evidence_refs: evidenceRefs,
    suggested_actions: suggestedActions,
    created_at: now(),
  };
}
