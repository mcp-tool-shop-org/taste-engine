import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EnforcementMode } from "../gate/gate-types.js";
import { loadPolicy, savePolicy } from "../gate/policy.js";
import { loadConfig } from "../cli/config.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";
import { readJson, writeJson } from "../util/json.js";

export type OrgActionKind = "promote" | "demote" | "enrichment_task";

export type OrgAction = {
  id: string;
  kind: OrgActionKind;
  repo_slug: string;
  surface: string | null;
  from_mode: EnforcementMode | null;
  to_mode: EnforcementMode | null;
  reason: string;
  evidence: string;
  status: "proposed" | "applied" | "rolled_back";
  applied_at: string | null;
  rolled_back_at: string | null;
  rollback_reason: string | null;
  created_at: string;
};

export type ActionReceipt = {
  action: OrgAction;
  policy_before: string; // JSON snapshot
  policy_after: string | null; // JSON snapshot after apply
};

const ACTIONS_FILE = "org-actions.json";

function actionsPath(portfolioDir: string): string {
  return join(portfolioDir, ACTIONS_FILE);
}

function loadActions(portfolioDir: string): OrgAction[] {
  const path = actionsPath(portfolioDir);
  return readJson<OrgAction[]>(path) ?? [];
}

function saveActions(portfolioDir: string, actions: OrgAction[]): void {
  writeJson(actionsPath(portfolioDir), actions);
}

// ── Create ─────────────────────────────────────────────────────

export function createAction(
  portfolioDir: string,
  opts: {
    kind: OrgActionKind;
    repo_slug: string;
    surface: string | null;
    from_mode: EnforcementMode | null;
    to_mode: EnforcementMode | null;
    reason: string;
    evidence: string;
  },
): OrgAction {
  const actions = loadActions(portfolioDir);
  const action: OrgAction = {
    id: newId(),
    ...opts,
    status: "proposed",
    applied_at: null,
    rolled_back_at: null,
    rollback_reason: null,
    created_at: now(),
  };
  actions.push(action);
  saveActions(portfolioDir, actions);
  return action;
}

// ── Preview ────────────────────────────────────────────────────

export type ActionPreview = {
  action: OrgAction;
  current_policy_mode: EnforcementMode | null;
  proposed_mode: EnforcementMode | null;
  policy_diff: string;
  warnings: string[];
};

export function previewAction(
  portfolioDir: string,
  repoSlug: string,
  surface: string,
  toMode: EnforcementMode,
): ActionPreview {
  const repoDir = join(portfolioDir, repoSlug);
  const tasteDir = join(repoDir, ".taste");
  const warnings: string[] = [];

  let currentMode: EnforcementMode | null = null;
  if (existsSync(join(tasteDir, "gate-policy.json"))) {
    const policy = loadPolicy(tasteDir);
    const surfacePolicy = policy.surfaces.find((s) => s.artifact_type === surface);
    currentMode = (surfacePolicy?.mode ?? policy.default_mode) as EnforcementMode;
  } else {
    warnings.push("No gate-policy.json found. Will create one.");
  }

  if (currentMode === toMode) {
    warnings.push(`Surface is already at ${toMode}.`);
  }

  const diff = currentMode
    ? `${repoSlug}/${surface}: ${currentMode} → ${toMode}`
    : `${repoSlug}/${surface}: (new) → ${toMode}`;

  return {
    action: {
      id: "(preview)", kind: "promote", repo_slug: repoSlug,
      surface, from_mode: currentMode, to_mode: toMode,
      reason: "", evidence: "", status: "proposed",
      applied_at: null, rolled_back_at: null, rollback_reason: null,
      created_at: now(),
    },
    current_policy_mode: currentMode,
    proposed_mode: toMode,
    policy_diff: diff,
    warnings,
  };
}

// ── Apply ──────────────────────────────────────────────────────

export function applyAction(
  portfolioDir: string,
  actionId: string,
): { success: boolean; receipt: ActionReceipt | null; error?: string } {
  const actions = loadActions(portfolioDir);
  const action = actions.find((a) => a.id === actionId || a.id.startsWith(actionId));
  if (!action) return { success: false, receipt: null, error: "Action not found" };
  if (action.status !== "proposed") return { success: false, receipt: null, error: `Action is ${action.status}, not proposed` };

  const repoDir = join(portfolioDir, action.repo_slug);
  const tasteDir = join(repoDir, ".taste");

  if (!existsSync(tasteDir)) return { success: false, receipt: null, error: `Repo directory not found: ${repoDir}` };

  // Snapshot before
  const policyBefore = JSON.stringify(loadPolicy(tasteDir));

  if (action.kind === "promote" || action.kind === "demote") {
    if (!action.surface || !action.to_mode) return { success: false, receipt: null, error: "Surface and to_mode required for promote/demote" };

    const policy = loadPolicy(tasteDir);
    const existingSurface = policy.surfaces.find((s) => s.artifact_type === action.surface);

    if (existingSurface) {
      existingSurface.mode = action.to_mode;
    } else {
      policy.surfaces.push({
        artifact_type: action.surface as any,
        mode: action.to_mode,
        globs: [],
      });
    }

    savePolicy(tasteDir, policy);
  }

  // Update action status
  action.status = "applied";
  action.applied_at = now();
  saveActions(portfolioDir, actions);

  const policyAfter = JSON.stringify(loadPolicy(tasteDir));

  return {
    success: true,
    receipt: { action, policy_before: policyBefore, policy_after: policyAfter },
  };
}

// ── Rollback ───────────────────────────────────────────────────

export function rollbackAction(
  portfolioDir: string,
  actionId: string,
  reason: string,
): { success: boolean; error?: string } {
  const actions = loadActions(portfolioDir);
  const action = actions.find((a) => a.id === actionId || a.id.startsWith(actionId));
  if (!action) return { success: false, error: "Action not found" };
  if (action.status !== "applied") return { success: false, error: `Action is ${action.status}, not applied` };

  const repoDir = join(portfolioDir, action.repo_slug);
  const tasteDir = join(repoDir, ".taste");

  if ((action.kind === "promote" || action.kind === "demote") && action.surface && action.from_mode) {
    const policy = loadPolicy(tasteDir);
    const surface = policy.surfaces.find((s) => s.artifact_type === action.surface);
    if (surface) {
      surface.mode = action.from_mode;
      savePolicy(tasteDir, policy);
    }
  }

  action.status = "rolled_back";
  action.rolled_back_at = now();
  action.rollback_reason = reason;
  saveActions(portfolioDir, actions);

  return { success: true };
}

// ── Query ──────────────────────────────────────────────────────

export function getActions(
  portfolioDir: string,
  filters?: { status?: string; repo?: string; kind?: string },
): OrgAction[] {
  let actions = loadActions(portfolioDir);
  if (filters?.status) actions = actions.filter((a) => a.status === filters.status);
  if (filters?.repo) actions = actions.filter((a) => a.repo_slug === filters.repo);
  if (filters?.kind) actions = actions.filter((a) => a.kind === filters.kind);
  return actions;
}

export function getActionHistory(portfolioDir: string): OrgAction[] {
  return loadActions(portfolioDir).sort((a, b) =>
    (b.applied_at ?? b.created_at).localeCompare(a.applied_at ?? a.created_at),
  );
}
