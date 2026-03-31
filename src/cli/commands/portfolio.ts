import { resolve } from "node:path";
import {
  discoverRepos,
  buildPortfolioMatrix,
  detectDriftFamilies,
  generatePortfolioFindings,
} from "../../portfolio/portfolio-engine.js";

export async function portfolioMatrixCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const repos = discoverRepos(dir);

  if (repos.length === 0) {
    console.log("No initialized repos found.");
    return;
  }

  const matrix = buildPortfolioMatrix(repos);

  console.log("=== Portfolio Matrix ===");
  console.log(`Repos: ${matrix.total_repos} | Statements: ${matrix.total_statements}`);
  console.log(`Strong: ${matrix.canon_strong_count} | Moderate: ${matrix.canon_moderate_count} | Sparse: ${matrix.canon_sparse_count}`);
  console.log(`Gate ready: ${matrix.gate_ready_count}/${matrix.total_repos}`);
  console.log();

  // Per-repo table
  for (const r of matrix.repos) {
    const conf = { strong: "STRONG", moderate: "MODERATE", sparse: "SPARSE", empty: "EMPTY" }[r.canon_confidence];
    const gate = r.gate_ready ? "READY" : "NOT READY";
    const warns = r.surfaces_at_warn.length > 0 ? ` warn:[${r.surfaces_at_warn.join(",")}]` : "";
    const required = r.surfaces_at_required.length > 0 ? ` required:[${r.surfaces_at_required.join(",")}]` : "";

    console.log(`  ${r.slug} — ${r.statement_count} stmts [${conf}] ${gate}${warns}${required}`);
    if (r.sparse_warnings.length > 0) {
      console.log(`    Sparse: ${r.sparse_warnings.join(", ")}`);
    }

    // Statement breakdown
    const types = Object.entries(r.statement_counts_by_type).map(([t, c]) => `${t}:${c}`).join(" ");
    if (types) console.log(`    Types: ${types}`);
  }
}

export async function portfolioFindingsCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const repos = discoverRepos(dir);

  if (repos.length === 0) {
    console.log("No repos found.");
    return;
  }

  const matrix = buildPortfolioMatrix(repos);
  const driftFamilies = detectDriftFamilies(repos);
  const findings = generatePortfolioFindings(matrix, driftFamilies);

  if (driftFamilies.length > 0) {
    console.log("=== Drift Families ===");
    for (const df of driftFamilies) {
      const scope = df.is_portfolio_wide ? "[PORTFOLIO-WIDE]" : "[REPO-SPECIFIC]";
      console.log(`  ${scope} ${df.name}`);
      console.log(`    ${df.description}`);
      console.log(`    Repos: ${df.repos_with_anti_pattern.join(", ")}`);
      console.log();
    }
  }

  if (findings.length > 0) {
    console.log("=== Portfolio Findings ===");
    for (const f of findings) {
      console.log(`  [${f.category}] ${f.title}`);
      console.log(`    ${f.description}`);
      console.log(`    Evidence: ${f.evidence}`);
      console.log(`    Repos: ${f.repos_affected.join(", ")}`);
      console.log();
    }
  }

  if (findings.length === 0 && driftFamilies.length === 0) {
    console.log("No portfolio-level findings yet. Need more repos with canon.");
  }
}

export async function portfolioExportCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const repos = discoverRepos(dir);
  const matrix = buildPortfolioMatrix(repos);
  const driftFamilies = detectDriftFamilies(repos);
  const findings = generatePortfolioFindings(matrix, driftFamilies);

  console.log(JSON.stringify({ matrix, drift_families: driftFamilies, findings }, null, 2));
}
