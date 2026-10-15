import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InvalidRepoSlugError, resolveRepoDir } from "../../src/org/repo-path.js";
import { createAction, previewAction, applyAction, rollbackAction } from "../../src/org/org-actions.js";
import { createApi } from "../../src/workbench/api.js";
import { importState } from "../../src/backup/backup-engine.js";
import { savePolicy } from "../../src/gate/policy.js";
import { DEFAULT_POLICY } from "../../src/gate/policy-types.js";
import { writeJson } from "../../src/util/json.js";

describe("repo slug confinement", () => {
  let base: string;
  let portfolioDir: string;
  let outsideTasteDir: string;
  let outsidePolicyPath: string;
  let outsidePolicyBefore: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "taste-slug-"));
    portfolioDir = join(base, "portfolio");
    mkdirSync(portfolioDir, { recursive: true });

    // A real .taste dir that sits next to the portfolio: the target an escaping slug would hit.
    outsideTasteDir = join(base, "outside", ".taste");
    mkdirSync(outsideTasteDir, { recursive: true });
    savePolicy(outsideTasteDir, { ...DEFAULT_POLICY, surfaces: [] });
    outsidePolicyPath = join(outsideTasteDir, "gate-policy.json");
    outsidePolicyBefore = readFileSync(outsidePolicyPath, "utf-8");
  });

  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  const BAD_SLUGS: Array<[string, string]> = [
    ["parent traversal", "../outside"],
    ["backslash traversal", "..\\outside"],
    ["nested traversal", "a/../../outside"],
    ["bare dot-dot", ".."],
    ["bare dot", "."],
    ["absolute path", resolve(tmpdir(), "outside")],
    ["empty string", ""],
    ["NUL byte", "repo\0x"],
    ["path separator", "a/b"],
  ];

  describe("resolveRepoDir", () => {
    it.each(BAD_SLUGS)("rejects %s", (_name, slug) => {
      expect(() => resolveRepoDir(portfolioDir, slug)).toThrow(InvalidRepoSlugError);
    });

    it("rejects non-string slugs", () => {
      expect(() => resolveRepoDir(portfolioDir, undefined)).toThrow(InvalidRepoSlugError);
      expect(() => resolveRepoDir(portfolioDir, { a: 1 })).toThrow(InvalidRepoSlugError);
    });

    it.each(["test-repo", "my.repo", "Repo_2", ".hidden"])("accepts %s inside the portfolio", (slug) => {
      const dir = resolveRepoDir(portfolioDir, slug);
      expect(dir).toBe(join(resolve(portfolioDir), slug));
      expect(dir.startsWith(resolve(portfolioDir) + sep)).toBe(true);
    });
  });

  describe("org actions", () => {
    it.each(BAD_SLUGS)("previewAction and createAction reject %s and write nothing", (_name, slug) => {
      expect(() => previewAction(portfolioDir, slug, "package_blurb", "required")).toThrow(InvalidRepoSlugError);
      expect(() => createAction(portfolioDir, {
        kind: "promote", repo_slug: slug, surface: "package_blurb",
        from_mode: null, to_mode: "required", reason: "x", evidence: "x",
      })).toThrow(InvalidRepoSlugError);
      expect(existsSync(join(portfolioDir, "org-actions.json"))).toBe(false);
      expect(readFileSync(outsidePolicyPath, "utf-8")).toBe(outsidePolicyBefore);
    });

    it("applyAction and rollbackAction refuse a stored action whose slug escapes the portfolio", () => {
      // An action file written by hand (or by an older build) is as untrusted as a request body.
      writeJson(join(portfolioDir, "org-actions.json"), [{
        id: "evil", kind: "promote", repo_slug: "../outside", surface: "package_blurb",
        from_mode: "warn", to_mode: "required", reason: "x", evidence: "x",
        status: "proposed", applied_at: null, rolled_back_at: null, rollback_reason: null, created_at: "t",
      }]);

      const applied = applyAction(portfolioDir, "evil");
      expect(applied.success).toBe(false);
      expect(readFileSync(outsidePolicyPath, "utf-8")).toBe(outsidePolicyBefore);

      const actions = JSON.parse(readFileSync(join(portfolioDir, "org-actions.json"), "utf-8"));
      actions[0].status = "applied";
      writeJson(join(portfolioDir, "org-actions.json"), actions);
      const rolledBack = rollbackAction(portfolioDir, "evil", "undo");
      expect(rolledBack.success).toBe(false);
      expect(readFileSync(outsidePolicyPath, "utf-8")).toBe(outsidePolicyBefore);
    });
  });

  describe("backup importState", () => {
    it("skips a policy whose slug escapes the portfolio", () => {
      const { applied, skipped } = importState(portfolioDir, {
        version: "1", exported_at: "t", source_dir: portfolioDir,
        policies: [{ repo_slug: "../outside", policy: { default_mode: "required" } }],
        actions: [], snapshots: [],
      });
      expect(applied).toEqual([]);
      expect(skipped.length).toBe(1);
      expect(readFileSync(outsidePolicyPath, "utf-8")).toBe(outsidePolicyBefore);
    });
  });

  describe("workbench API", () => {
    let server: Server;
    let url: string;

    beforeEach(async () => {
      const { app } = createApi(portfolioDir);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((ok) => server.once("listening", () => ok()));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(async () => {
      await new Promise<void>((ok) => server.close(() => ok()));
    });

    async function post(path: string, body: unknown) {
      const res = await fetch(`${url}${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() as { error?: string } };
    }

    it.each(BAD_SLUGS)("preview and apply answer 400 for %s and write nothing", async (_name, slug) => {
      const payload = { repo: slug, surface: "package_blurb", to: "required", reason: "x" };
      for (const path of ["/api/org/actions/preview", "/api/org/actions/apply"]) {
        const res = await post(path, payload);
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
      }
      expect(readdirSync(portfolioDir)).toEqual([]);
      expect(readFileSync(outsidePolicyPath, "utf-8")).toBe(outsidePolicyBefore);
    });

    it("still applies an action for a legitimate slug", async () => {
      const tasteDir = join(portfolioDir, "test-repo", ".taste");
      mkdirSync(tasteDir, { recursive: true });
      savePolicy(tasteDir, { ...DEFAULT_POLICY, surfaces: [] });

      const res = await post("/api/org/actions/apply", {
        repo: "test-repo", surface: "package_blurb", to: "required", reason: "ok",
      });
      expect(res.status).toBe(200);
    });
  });
});
