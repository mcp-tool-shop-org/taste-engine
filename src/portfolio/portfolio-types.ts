export type PortfolioRepo = {
  slug: string;
  name: string;
  db_path: string;
  canon_version: string | null;
  canon_confidence: "strong" | "moderate" | "sparse" | "empty";
  statement_count: number;
  statement_counts_by_type: Record<string, number>;
  gate_ready: boolean;
  surfaces_at_warn: string[];
  surfaces_at_required: string[];
  sparse_warnings: string[];
};

export type PortfolioMatrix = {
  repos: PortfolioRepo[];
  total_repos: number;
  total_statements: number;
  canon_strong_count: number;
  canon_moderate_count: number;
  canon_sparse_count: number;
  gate_ready_count: number;
};

export type PortfolioFinding = {
  category: "drift_family" | "preset_fit" | "sparse_pattern" | "graduation_pattern" | "friction_pattern";
  title: string;
  description: string;
  repos_affected: string[];
  evidence: string;
};

export type DriftFamily = {
  name: string;
  description: string;
  repos_with_anti_pattern: string[];
  is_portfolio_wide: boolean;
};

export type PresetFitReport = {
  preset: string;
  repos_using: string[];
  avg_canon_confidence: string;
  avg_statement_count: number;
  fit_quality: "good" | "moderate" | "poor";
};
