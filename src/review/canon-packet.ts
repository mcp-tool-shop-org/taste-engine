import type Database from "better-sqlite3";
import type { CanonStatement } from "../core/types.js";
import type { ArtifactType, Scope } from "../core/enums.js";
import type { CanonPacketItem, PacketSelectionReason } from "./review-run-types.js";
import type { AcceptedTension } from "../curation/curation-types.js";
import { getStatements } from "../canon/canon-store.js";
import { getAcceptedTensions } from "../curation/curation-store.js";
import { newId } from "../core/ids.js";

export type CanonPacket = {
  statements: Array<CanonStatement & { selection_reason: PacketSelectionReason; rank: number }>;
  tensions: AcceptedTension[];
  items: Omit<CanonPacketItem, "id" | "review_run_id">[];
};

const MAX_STATEMENTS = 20;
const MAX_TENSIONS = 3;

/**
 * Build a relevant canon packet for reviewing a candidate artifact.
 *
 * Rule-led retrieval:
 * 1. All hard thesis statements (always)
 * 2. Statements targeting this artifact type
 * 3. Scope-matching statements
 * 4. Anti-patterns with hard/strong hardness
 * 5. Voice/naming laws
 * 6. Tag overlap enrichment
 * 7. Accepted tensions
 */
export function buildCanonPacket(
  db: Database.Database,
  projectId: string,
  canonVersion: string | null,
  artifactType: ArtifactType,
  artifactScopes: Scope[],
  candidateText?: string,
): CanonPacket {
  const allAccepted = getStatements(db, projectId, { lifecycle: "accepted" });

  // Filter to canon version if specified
  const versionFiltered = canonVersion
    ? allAccepted.filter((s) => s.canon_version === canonVersion || s.canon_version === null)
    : allAccepted;

  // Exclude retired/superseded
  const active = versionFiltered.filter((s) => s.lifecycle === "accepted");

  type Scored = CanonStatement & { score: number; reason: PacketSelectionReason };
  const scored: Scored[] = [];
  const seen = new Set<string>();

  function add(stmt: CanonStatement, score: number, reason: PacketSelectionReason) {
    if (seen.has(stmt.id)) {
      // Upgrade score if higher
      const existing = scored.find((s) => s.id === stmt.id);
      if (existing && score > existing.score) {
        existing.score = score;
        existing.reason = reason;
      }
      return;
    }
    seen.add(stmt.id);
    scored.push({ ...stmt, score, reason });
  }

  // 1. Hard thesis — always included, highest priority
  for (const s of active.filter((s) => s.hardness === "hard" && s.statement_type === "thesis")) {
    add(s, 100, "hard_thesis");
  }

  // 2. Anti-patterns with hard/strong hardness
  for (const s of active.filter((s) =>
    s.statement_type === "anti_pattern" && (s.hardness === "hard" || s.hardness === "strong"),
  )) {
    add(s, 90, "anti_pattern");
  }

  // 3. Artifact-type matching
  for (const s of active.filter((s) => s.artifact_types.includes(artifactType))) {
    add(s, 80, "artifact_type_match");
  }

  // 4. Scope matching
  for (const s of active) {
    const scopeOverlap = s.scope.filter((sc) => artifactScopes.includes(sc)).length;
    if (scopeOverlap > 0) {
      add(s, 60 + scopeOverlap * 10, "scope_match");
    }
  }

  // 5. Voice/naming laws
  for (const s of active.filter((s) => s.statement_type === "voice" || s.statement_type === "naming")) {
    add(s, 70, "voice_naming");
  }

  // 6. Tag/lexical overlap enrichment
  if (candidateText) {
    const candidateTokens = new Set(
      candidateText.toLowerCase().split(/\s+/).filter((t) => t.length > 3),
    );
    for (const s of active) {
      const tagOverlap = s.tags.filter((t) => candidateTokens.has(t.toLowerCase())).length;
      if (tagOverlap > 0) {
        add(s, 40 + tagOverlap * 5, "tag_match");
      }
      // Lexical overlap with statement text
      const stmtTokens = s.text.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
      const lexicalOverlap = stmtTokens.filter((t) => candidateTokens.has(t)).length;
      if (lexicalOverlap >= 3) {
        add(s, 30 + lexicalOverlap * 2, "lexical_match");
      }
    }
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, MAX_STATEMENTS);

  // Build packet items for auditability
  const items: Omit<CanonPacketItem, "id" | "review_run_id">[] = selected.map((s, i) => ({
    source_kind: "statement" as const,
    source_id: s.id,
    reason_selected: s.reason,
    rank: i + 1,
  }));

  // 7. Accepted tensions
  const tensions = getAcceptedTensions(db, projectId, canonVersion ?? undefined).slice(0, MAX_TENSIONS);
  for (const t of tensions) {
    items.push({
      source_kind: "tension",
      source_id: t.id,
      reason_selected: "tension",
      rank: items.length + 1,
    });
  }

  return {
    statements: selected.map((s, i) => ({
      ...s,
      selection_reason: s.reason,
      rank: i + 1,
    })),
    tensions,
    items,
  };
}

/** Format a canon packet into a prompt-friendly text block. */
export function formatPacketForPrompt(packet: CanonPacket): string {
  const parts: string[] = [];

  if (packet.statements.length > 0) {
    parts.push("=== CANON STATEMENTS ===");
    for (const s of packet.statements) {
      parts.push(`[${s.statement_type}] (${s.hardness}) ID:${s.id}`);
      parts.push(`  ${s.text}`);
      if (s.rationale) parts.push(`  Rationale: ${s.rationale}`);
      parts.push("");
    }
  }

  if (packet.tensions.length > 0) {
    parts.push("=== ACCEPTED TENSIONS ===");
    for (const t of packet.tensions) {
      parts.push(`[${t.severity}] ${t.title}`);
      parts.push(`  ${t.description}`);
      parts.push(`  Resolution: ${t.resolution_note}`);
      parts.push("");
    }
  }

  return parts.join("\n");
}
