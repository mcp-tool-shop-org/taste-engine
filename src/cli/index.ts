#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { canonStatusCommand } from "./commands/canon.js";
import { ingestCommand } from "./commands/ingest.js";
import {
  extractRunCommand,
  extractStatusCommand,
  extractCandidatesCommand,
  extractContradictionsCommand,
  extractExemplarsCommand,
} from "./commands/extract.js";
import {
  reviewRunCommand,
  reviewShowCommand,
  reviewListCommand,
  reviewPacketCommand,
} from "./commands/review.js";
import {
  reviewFeedbackCommand,
  calibrateSummaryCommand,
  calibrateStatementsCommand,
  calibrateFindingsCommand,
} from "./commands/calibrate.js";
import { reviseRunCommand } from "./commands/revise.js";
import { repairRunCommand } from "./commands/repair.js";
import { gateRunCommand, gatePolicyInitCommand, gatePolicyShowCommand, gateOverrideCommand, gateReportCommand } from "./commands/gate.js";
import { redirectRunCommand } from "./commands/redirect.js";
import { onboardRunCommand, onboardReportCommand, onboardRecommendCommand } from "./commands/onboard.js";
import { portfolioMatrixCommand, portfolioFindingsCommand, portfolioExportCommand } from "./commands/portfolio.js";
import { orgMatrixCommand, orgQueueCommand, orgOverridesCommand, orgHotspotsCommand, orgRecommendationsCommand, orgExportCommand, orgAlertsCommand, orgStaleCommand, orgActionsQueueCommand, orgActionsPreviewCommand, orgActionsApplyCommand, orgActionsRollbackCommand, orgActionsHistoryCommand } from "./commands/org.js";
import {
  curateQueueCommand,
  curateInspectCommand,
  curateAcceptCommand,
  curateEditCommand,
  curateRejectCommand,
  curateDeferCommand,
  curateAcceptAllCommand,
  curateMergeCommand,
  curateContradictionsCommand,
  curateResolveContradictionCommand,
  canonFreezeCommand,
} from "./commands/curate.js";

const program = new Command();

program
  .name("taste")
  .description("Canon-and-judgment system for creative and product work")
  .version("0.1.0");

program
  .command("init <slug>")
  .description("Initialize taste-engine for a project")
  .option("-n, --name <name>", "Project display name (defaults to slug)")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (slug: string, opts: { name?: string; root?: string }) => {
    await initCommand({ slug, name: opts.name, root: opts.root });
  });

program
  .command("doctor")
  .description("Check environment health")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await doctorCommand(opts);
  });

program
  .command("ingest <paths...>")
  .description("Ingest source artifacts (files or directories)")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-t, --type <type>", "Force artifact type (readme, doc, architecture_note, etc.)")
  .action(async (paths: string[], opts: { root?: string; type?: string }) => {
    await ingestCommand({ paths, root: opts.root, type: opts.type });
  });

// Canon commands
const canon = program
  .command("canon")
  .description("Canon management commands");

canon
  .command("status")
  .description("Show current canon state")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await canonStatusCommand(opts);
  });

canon
  .command("freeze")
  .description("Freeze accepted canon into a versioned snapshot")
  .requiredOption("-l, --label <label>", "Version label (e.g., canon-v1)")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-n, --notes <notes>", "Version notes")
  .option("-f, --force", "Override freeze blockers")
  .action(async (opts: { root?: string; label: string; notes?: string; force?: boolean }) => {
    await canonFreezeCommand(opts);
  });

// Extract commands
const extract = program
  .command("extract")
  .description("Canon extraction commands");

extract
  .command("run")
  .description("Run multi-pass canon extraction")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--core", "Run only core passes (thesis, anti-pattern, pattern, contradiction)")
  .option("--passes <passes>", "Comma-separated list of passes to run")
  .action(async (opts: { root?: string; core?: boolean; passes?: string }) => {
    await extractRunCommand(opts);
  });

extract
  .command("status")
  .description("Show latest extraction run status")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await extractStatusCommand(opts);
  });

extract
  .command("candidates")
  .description("List extracted candidates")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-t, --type <type>", "Filter by statement type")
  .option("-s, --status <status>", "Filter by status (default: proposed)")
  .option("-c, --min-confidence <n>", "Minimum confidence threshold")
  .action(async (opts: { root?: string; type?: string; status?: string; minConfidence?: string }) => {
    await extractCandidatesCommand(opts);
  });

extract
  .command("contradictions")
  .description("Show contradiction findings")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await extractContradictionsCommand(opts);
  });

extract
  .command("exemplars")
  .description("Show exemplar nominations")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await extractExemplarsCommand(opts);
  });

// Curate commands
const curate = program
  .command("curate")
  .description("Canon curation commands");

curate
  .command("queue")
  .description("Show pending candidates for curation")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-t, --type <type>", "Filter by statement type")
  .option("-c, --min-confidence <n>", "Minimum confidence threshold")
  .option("-s, --status <status>", "Filter by status (default: proposed)")
  .action(async (opts: { root?: string; type?: string; minConfidence?: string; status?: string }) => {
    await curateQueueCommand(opts);
  });

curate
  .command("inspect <candidate-id>")
  .description("Inspect a candidate in detail")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (candidateId: string, opts: { root?: string }) => {
    await curateInspectCommand(candidateId, opts);
  });

curate
  .command("accept <candidate-id>")
  .description("Accept a candidate into canon")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--hardness <level>", "Override hardness (hard, strong, soft, experimental)")
  .option("--scope <scopes>", "Override scope (comma-separated)")
  .option("--tag <tags>", "Override tags (comma-separated)")
  .action(async (candidateId: string, opts: { root?: string; hardness?: string; scope?: string; tag?: string }) => {
    await curateAcceptCommand(candidateId, opts);
  });

curate
  .command("edit <candidate-id>")
  .description("Edit and accept a candidate into canon")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--text <text>", "Revised statement text")
  .option("--hardness <level>", "Override hardness")
  .option("--scope <scopes>", "Override scope (comma-separated)")
  .action(async (candidateId: string, opts: { root?: string; text: string; hardness?: string; scope?: string }) => {
    await curateEditCommand(candidateId, opts);
  });

curate
  .command("reject <candidate-id>")
  .description("Reject a candidate with reason")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--reason <reason>", "Rejection reason")
  .action(async (candidateId: string, opts: { root?: string; reason: string }) => {
    await curateRejectCommand(candidateId, opts);
  });

curate
  .command("defer <candidate-id>")
  .description("Defer a candidate for later review")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--reason <reason>", "Reason for deferral")
  .action(async (candidateId: string, opts: { root?: string; reason?: string }) => {
    await curateDeferCommand(candidateId, opts);
  });

curate
  .command("merge <candidate-id>")
  .description("Merge a candidate into an existing canon statement")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--into <statement-id>", "Target canon statement ID")
  .action(async (candidateId: string, opts: { root?: string; into: string }) => {
    await curateMergeCommand(candidateId, opts);
  });

curate
  .command("accept-all")
  .description("Accept all proposed candidates matching filters")
  .option("-r, --root <path>", "Project root directory")
  .option("-t, --type <type>", "Filter by statement type")
  .option("-c, --min-confidence <n>", "Minimum confidence threshold")
  .option("--dry-run", "Show what would be accepted without doing it")
  .action(async (opts: { root?: string; type?: string; minConfidence?: string; dryRun?: boolean }) => {
    await curateAcceptAllCommand(opts);
  });

curate
  .command("contradictions")
  .description("Show contradictions and accepted tensions")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await curateContradictionsCommand(opts);
  });

curate
  .command("resolve-contradiction <finding-id>")
  .description("Resolve or accept a contradiction as tension")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--action <action>", "Action: resolve or accept_tension")
  .requiredOption("--note <note>", "Resolution note")
  .action(async (findingId: string, opts: { root?: string; action: string; note: string }) => {
    await curateResolveContradictionCommand(findingId, {
      root: opts.root,
      action: opts.action as "resolve" | "accept_tension",
      note: opts.note,
    });
  });

// Review commands
const review = program
  .command("review")
  .description("Artifact review commands");

review
  .command("run")
  .description("Review a candidate artifact against canon")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--file <path>", "Path to candidate artifact file")
  .option("--artifact <id>", "Existing candidate artifact ID")
  .requiredOption("--type <type>", "Artifact type (readme_section, package_blurb, feature_brief, cli_help, release_note, naming_proposal)")
  .requiredOption("--purpose <text>", "Intended purpose of the artifact")
  .option("--canon-version <version>", "Canon version to review against (default: current)")
  .action(async (opts: { root?: string; file?: string; artifact?: string; type: string; purpose: string; canonVersion?: string }) => {
    await reviewRunCommand({ ...opts, canonVersion: opts.canonVersion ?? "" });
  });

review
  .command("show <review-id>")
  .description("Show a review result")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (reviewId: string, opts: { root?: string }) => {
    await reviewShowCommand(reviewId, opts);
  });

review
  .command("list")
  .description("List stored reviews")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--canon-version <version>", "Filter by canon version")
  .option("--verdict <verdict>", "Filter by verdict")
  .action(async (opts: { root?: string; canonVersion?: string; verdict?: string }) => {
    await reviewListCommand(opts);
  });

review
  .command("packet <run-id>")
  .description("Show canon packet composition for a review")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (runId: string, opts: { root?: string }) => {
    await reviewPacketCommand(runId, opts);
  });

// Revise command
const revise = program
  .command("revise")
  .description("Revision mode commands");

revise
  .command("run")
  .description("Generate canon-preserving revisions for a reviewed artifact")
  .requiredOption("--artifact <id>", "Candidate artifact ID (must have been reviewed)")
  .option("-r, --root <path>", "Project root directory")
  .option("--canon-version <version>", "Canon version (default: current)")
  .action(async (opts: { root?: string; artifact: string; canonVersion?: string }) => {
    await reviseRunCommand(opts);
  });

// Repair commands
const repair = program
  .command("repair")
  .description("Structural repair commands");

repair
  .command("run")
  .description("Structural repair: replace canon-breaking concepts while preserving goals")
  .requiredOption("--artifact <id>", "Candidate artifact ID (must have been reviewed)")
  .option("-r, --root <path>", "Project root directory")
  .option("--canon-version <version>", "Canon version (default: current)")
  .option("--max-concepts <n>", "Maximum repair concepts to generate (default: 3)")
  .action(async (opts: { root?: string; artifact: string; canonVersion?: string; maxConcepts?: string }) => {
    await repairRunCommand(opts);
  });

// Gate command
const gate = program
  .command("gate")
  .description("Workflow gate commands");

gate
  .command("run")
  .description("Run taste gate on changed artifacts")
  .option("-r, --root <path>", "Project root directory")
  .option("--files <paths...>", "Explicit file paths to check")
  .option("--staged", "Check git staged files only")
  .option("--mode <mode>", "Enforcement: advisory (default), warn, required")
  .option("--canon-version <version>", "Canon version (default: current)")
  .option("--json", "Output machine-readable JSON")
  .action(async (opts: { root?: string; files?: string[]; staged?: boolean; mode?: string; canonVersion?: string; json?: boolean }) => {
    await gateRunCommand(opts);
  });

gate
  .command("policy-init")
  .description("Initialize gate policy file")
  .option("-r, --root <path>", "Project root directory")
  .action(async (opts: { root?: string }) => { await gatePolicyInitCommand(opts); });

gate
  .command("policy")
  .description("Show current gate policy")
  .option("-r, --root <path>", "Project root directory")
  .action(async (opts: { root?: string }) => { await gatePolicyShowCommand(opts); });

gate
  .command("override")
  .description("Record an override receipt for a bypassed gate")
  .option("-r, --root <path>", "Project root directory")
  .requiredOption("--artifact <path>", "Artifact file path")
  .requiredOption("--type <type>", "Artifact type")
  .requiredOption("--verdict <verdict>", "Original verdict")
  .requiredOption("--gate <result>", "Original gate result")
  .requiredOption("--action <action>", "Action: bypass, defer_repair, accept_as_is")
  .requiredOption("--reason <reason>", "Reason for override")
  .action(async (opts: any) => { await gateOverrideCommand(opts); });

gate
  .command("report")
  .description("Show rollout report with promotion readiness")
  .option("-r, --root <path>", "Project root directory")
  .option("--json", "Output as JSON")
  .action(async (opts: { root?: string; json?: boolean }) => { await gateReportCommand(opts); });

// Redirect command
const redirect = program
  .command("redirect")
  .description("Goal redirection for irreparable artifacts");

redirect
  .command("run")
  .description("Generate a Goal Redirection Brief for a blocked artifact")
  .requiredOption("--artifact <id>", "Candidate artifact ID")
  .option("-r, --root <path>", "Project root directory")
  .option("--canon-version <version>", "Canon version (default: current)")
  .action(async (opts: { root?: string; artifact: string; canonVersion?: string }) => {
    await redirectRunCommand(opts);
  });

// Feedback command (under review)
review
  .command("feedback <review-id>")
  .description("Record feedback on a review")
  .option("-r, --root <path>", "Project root directory")
  .requiredOption("--overall <rating>", "Overall: correct, mostly_correct, mixed, mostly_wrong, wrong")
  .requiredOption("--verdict <agreement>", "Verdict: agree, soft_disagree, hard_disagree")
  .option("--false-rigidity", "Flag as too rigid")
  .option("--missed-drift", "Flag as missed important drift")
  .option("--wrong-packet", "Flag canon packet as wrong")
  .option("--weak-evidence", "Flag evidence as weak")
  .option("--weak-revision", "Flag revision guidance as weak")
  .option("--good-revision", "Flag revision guidance as helpful")
  .option("--uncertainty-helpful", "Uncertainty note was appropriate")
  .option("--notes <text>", "Freeform feedback note")
  .option("--dimensions <dims>", "Dimension feedback: thesis=correct,pattern=too_harsh,...")
  .option("--noisy-statements <ids>", "Comma-separated noisy statement IDs")
  .action(async (reviewId: string, opts: any) => {
    await reviewFeedbackCommand(reviewId, opts);
  });

// Calibrate commands
const calibrate = program
  .command("calibrate")
  .description("Calibration diagnostics");

calibrate
  .command("summary")
  .description("Show project-level calibration metrics")
  .option("-r, --root <path>", "Project root directory")
  .action(async (opts: { root?: string }) => {
    await calibrateSummaryCommand(opts);
  });

calibrate
  .command("statements")
  .description("Show canon statement utility diagnostics")
  .option("-r, --root <path>", "Project root directory")
  .option("-t, --type <type>", "Filter by statement type")
  .option("--noisy", "Show only noisy statements")
  .option("--underused", "Show only underused statements")
  .action(async (opts: { root?: string; type?: string; noisy?: boolean; underused?: boolean }) => {
    await calibrateStatementsCommand(opts);
  });

calibrate
  .command("findings")
  .description("Show calibration findings")
  .option("-r, --root <path>", "Project root directory")
  .option("--refresh", "Regenerate findings from current feedback")
  .action(async (opts: { root?: string; refresh?: boolean }) => {
    await calibrateFindingsCommand(opts);
  });

// Onboard commands
const onboard = program
  .command("onboard")
  .description("Repo onboarding commands");

onboard
  .command("run")
  .description("Set up taste-engine for a new repo")
  .requiredOption("--slug <slug>", "Project slug")
  .option("-n, --name <name>", "Project display name")
  .option("-r, --root <path>", "Project root directory")
  .option("--repo-path <path>", "Path to repo to scan (default: root)")
  .option("--preset <preset>", "Policy preset: advisory-starter, docs-heavy, product-copy")
  .option("--auto-ingest", "Automatically ingest high-priority sources")
  .action(async (opts: any) => { await onboardRunCommand(opts); });

onboard
  .command("report")
  .description("Show onboarding readiness report")
  .option("-r, --root <path>", "Project root directory")
  .action(async (opts: { root?: string }) => { await onboardReportCommand(opts); });

onboard
  .command("recommend")
  .description("Generate adoption recommendations for a repo")
  .requiredOption("--repo-path <path>", "Path to the target repo")
  .option("--portfolio-dir <path>", "Portfolio directory for cross-repo evidence")
  .action(async (opts: { repoPath: string; portfolioDir?: string }) => { await onboardRecommendCommand(opts); });

// Portfolio commands
const portfolio = program
  .command("portfolio")
  .description("Portfolio intelligence across repos");

portfolio
  .command("matrix")
  .description("Show portfolio matrix: all repos, canon state, gate readiness")
  .requiredOption("--dir <path>", "Directory containing repo workspaces")
  .action(async (opts: { dir: string }) => { await portfolioMatrixCommand(opts); });

portfolio
  .command("findings")
  .description("Show portfolio-level findings: drift families, patterns, gaps")
  .requiredOption("--dir <path>", "Directory containing repo workspaces")
  .action(async (opts: { dir: string }) => { await portfolioFindingsCommand(opts); });

portfolio
  .command("export")
  .description("Export portfolio data as JSON")
  .requiredOption("--dir <path>", "Directory containing repo workspaces")
  .action(async (opts: { dir: string }) => { await portfolioExportCommand(opts); });

// Org commands
const org = program.command("org").description("Org-level rollout control plane");
org.command("matrix").description("Org rollout matrix: all repos, canon, gates, surfaces").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgMatrixCommand(opts); });
org.command("queue").description("Promotion and demotion queue").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgQueueCommand(opts); });
org.command("overrides").description("Override hotspot analysis").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgOverridesCommand(opts); });
org.command("hotspots").description("Drift-family hotspots across repos").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgHotspotsCommand(opts); });
org.command("recommendations").description("Org-level action recommendations").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgRecommendationsCommand(opts); });
org.command("alerts").description("Org-level alerts: promotions, demotions, spikes, enrichment").requiredOption("--dir <path>", "Portfolio directory").option("--severity <level>", "Filter: critical, warning, info").option("--category <cat>", "Filter by category").option("--repo <slug>", "Filter by repo").action(async (opts: { dir: string; severity?: string; category?: string; repo?: string }) => { await orgAlertsCommand(opts); });
org.command("stale").description("Show stale rollout and sparse canon repos").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgStaleCommand(opts); });
// Org actions sub-commands
const orgActions = org.command("actions").description("Rollout action management");
orgActions.command("queue").description("Show actionable promotion/demotion queue").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgActionsQueueCommand(opts); });
orgActions.command("preview").description("Preview a policy change before applying").requiredOption("--dir <path>", "Portfolio directory").requiredOption("--repo <slug>", "Repo slug").requiredOption("--surface <type>", "Artifact type").requiredOption("--to <mode>", "Target enforcement mode").action(async (opts: any) => { await orgActionsPreviewCommand(opts); });
orgActions.command("apply").description("Apply a policy change with receipt").requiredOption("--dir <path>", "Portfolio directory").requiredOption("--repo <slug>", "Repo slug").requiredOption("--surface <type>", "Artifact type").requiredOption("--to <mode>", "Target mode").requiredOption("--reason <text>", "Reason for change").action(async (opts: any) => { await orgActionsApplyCommand(opts); });
orgActions.command("rollback").description("Rollback an applied action").requiredOption("--dir <path>", "Portfolio directory").requiredOption("--id <id>", "Action ID (prefix match)").requiredOption("--reason <text>", "Rollback reason").action(async (opts: any) => { await orgActionsRollbackCommand(opts); });
orgActions.command("history").description("Show action history with receipts").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgActionsHistoryCommand(opts); });

org.command("export").description("Export org data as JSON").requiredOption("--dir <path>", "Portfolio directory").action(async (opts: { dir: string }) => { await orgExportCommand(opts); });

program.parse();
