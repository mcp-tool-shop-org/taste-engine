import express from "express";
import cors from "cors";
import { buildOrgStatus, buildPromotionQueue, buildDemotionQueue, buildOverrideHotspots, generateOrgRecommendations } from "../org/org-engine.js";
import { generateOrgAlerts } from "../org/org-alerts.js";
import { createAction, previewAction, applyAction, rollbackAction, getActions, getActionHistory } from "../org/org-actions.js";
import { discoverRepos, buildPortfolioMatrix, detectDriftFamilies, generatePortfolioFindings } from "../portfolio/portfolio-engine.js";
import type { EnforcementMode } from "../gate/gate-types.js";

export function createApi(portfolioDir: string, port: number = 3200) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── Org Matrix ─────────────────────────────────────────────
  app.get("/api/org/matrix", (_req, res) => {
    const statuses = buildOrgStatus(portfolioDir);
    const promotions = buildPromotionQueue(statuses);
    const demotions = buildDemotionQueue(statuses);
    res.json({ statuses, summary: { total: statuses.length, gate_ready: statuses.filter((s) => s.gate_ready).length, total_statements: statuses.reduce((s, r) => s + r.statement_count, 0) } });
  });

  // ── Alerts ─────────────────────────────────────────────────
  app.get("/api/org/alerts", (_req, res) => {
    const statuses = buildOrgStatus(portfolioDir);
    const alerts = generateOrgAlerts(statuses, portfolioDir);
    res.json({ alerts, counts: { critical: alerts.filter((a) => a.severity === "critical").length, warning: alerts.filter((a) => a.severity === "warning").length, info: alerts.filter((a) => a.severity === "info").length } });
  });

  // ── Queue ──────────────────────────────────────────────────
  app.get("/api/org/queue", (_req, res) => {
    const statuses = buildOrgStatus(portfolioDir);
    const promotions = buildPromotionQueue(statuses);
    const demotions = buildDemotionQueue(statuses);
    const recommendations = generateOrgRecommendations(statuses, promotions, demotions);
    res.json({ promotions, demotions, recommendations });
  });

  // ── Repo Detail ────────────────────────────────────────────
  app.get("/api/org/repo/:slug", (req, res) => {
    const statuses = buildOrgStatus(portfolioDir);
    const repo = statuses.find((s) => s.slug === req.params.slug);
    if (!repo) return res.status(404).json({ error: "Repo not found" });

    const alerts = generateOrgAlerts(statuses, portfolioDir).filter((a) => a.repo_slug === req.params.slug);
    const actions = getActions(portfolioDir, { repo: req.params.slug });
    res.json({ repo, alerts, actions });
  });

  // ── Action Preview ─────────────────────────────────────────
  app.post("/api/org/actions/preview", (req, res) => {
    const { repo, surface, to } = req.body;
    if (!repo || !surface || !to) return res.status(400).json({ error: "repo, surface, to required" });
    const preview = previewAction(portfolioDir, repo, surface, to as EnforcementMode);
    res.json(preview);
  });

  // ── Action Apply ───────────────────────────────────────────
  app.post("/api/org/actions/apply", (req, res) => {
    const { repo, surface, to, reason } = req.body;
    if (!repo || !surface || !to || !reason) return res.status(400).json({ error: "repo, surface, to, reason required" });

    const preview = previewAction(portfolioDir, repo, surface, to as EnforcementMode);
    const action = createAction(portfolioDir, {
      kind: to === "advisory" ? "demote" : "promote",
      repo_slug: repo, surface, from_mode: preview.current_policy_mode, to_mode: to as EnforcementMode,
      reason, evidence: "Workbench action",
    });

    const result = applyAction(portfolioDir, action.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ action, receipt: result.receipt });
  });

  // ── Action Rollback ────────────────────────────────────────
  app.post("/api/org/actions/rollback", (req, res) => {
    const { id, reason } = req.body;
    if (!id || !reason) return res.status(400).json({ error: "id, reason required" });
    const result = rollbackAction(portfolioDir, id, reason);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  });

  // ── Action History ─────────────────────────────────────────
  app.get("/api/org/actions/history", (_req, res) => {
    res.json({ actions: getActionHistory(portfolioDir) });
  });

  // ── Portfolio Findings ─────────────────────────────────────
  app.get("/api/portfolio/findings", (_req, res) => {
    const repos = discoverRepos(portfolioDir);
    const matrix = buildPortfolioMatrix(repos);
    const families = detectDriftFamilies(repos);
    const findings = generatePortfolioFindings(matrix, families);
    res.json({ drift_families: families, findings });
  });

  return { app };
}
