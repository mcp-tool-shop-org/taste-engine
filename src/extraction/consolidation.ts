import type Database from "better-sqlite3";
import type { ExtractedStatementCandidate } from "./extraction-types.js";
import { getCandidates, updateCandidateStatus } from "./extraction-store.js";

export type ConsolidationResult = {
  total_before: number;
  total_after: number;
  merged_count: number;
  generic_flagged: number;
  low_confidence_count: number;
};

/**
 * Consolidate extracted candidates:
 * - Merge near-duplicate statements of the same type
 * - Flag generic candidates
 * - Report low-confidence candidates
 *
 * Does NOT delete or auto-reject. Only merges duplicates.
 */
export function consolidateCandidates(
  db: Database.Database,
  runId: string,
): ConsolidationResult {
  const candidates = getCandidates(db, runId, { status: "proposed" });
  const totalBefore = candidates.length;

  // Group by statement_type for merge comparison
  const byType = new Map<string, ExtractedStatementCandidate[]>();
  for (const c of candidates) {
    const group = byType.get(c.statement_type) ?? [];
    group.push(c);
    byType.set(c.statement_type, group);
  }

  let mergedCount = 0;

  for (const [_type, group] of byType) {
    // Find near-duplicates within each type group
    const merged = new Set<string>();

    for (let i = 0; i < group.length; i++) {
      if (merged.has(group[i].id)) continue;

      for (let j = i + 1; j < group.length; j++) {
        if (merged.has(group[j].id)) continue;

        if (areSimilar(group[i].text, group[j].text)) {
          // Merge j into i (keep the higher-confidence one)
          const [keep, discard] = group[i].confidence >= group[j].confidence
            ? [group[i], group[j]]
            : [group[j], group[i]];

          updateCandidateStatus(db, discard.id, "merged", keep.id);
          merged.add(discard.id);
          mergedCount++;
        }
      }
    }
  }

  // Count generics and low confidence (already flagged by pass-runner confidence penalty)
  const remaining = getCandidates(db, runId, { status: "proposed" });
  const genericFlagged = remaining.filter((c) => c.confidence < 0.3).length;
  const lowConfidence = remaining.filter((c) => c.confidence < 0.5).length;

  return {
    total_before: totalBefore,
    total_after: remaining.length,
    merged_count: mergedCount,
    generic_flagged: genericFlagged,
    low_confidence_count: lowConfidence,
  };
}

/**
 * Similarity check for two statement texts.
 * Uses normalized token overlap — NOT embedding similarity.
 * Threshold: 70% overlap = similar enough to merge.
 */
export function areSimilar(a: string, b: string, threshold: number = 0.7): boolean {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;

  const jaccard = intersection / union;
  return jaccard >= threshold;
}

/** Normalize and tokenize a statement for comparison. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2) // Skip short words
    .sort();
}
