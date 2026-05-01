/**
 * BuilderHQ — Push & Verify (Self-Correcting CI Loop)
 *
 * TypeScript version — callable from any Manus task via:
 *   npx tsx scripts/push-and-verify.ts [branch] [maxAttempts]
 *
 * Or imported as a module:
 *   import { pushAndVerify } from './push-and-verify.js'
 *   const result = await pushAndVerify({ branch: 'main' })
 *
 * The function:
 *   1. Pushes the current branch to origin
 *   2. Polls GitHub until the "Platform Audit" CI completes
 *   3. Returns { passed: true } on success
 *   4. Returns { passed: false, criticals: [...], reportPath } on failure
 *      so the calling task can read the issues, fix them, and call again
 */

import { execSync, spawnSync } from "child_process";
import { mkdirSync, existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// ─── Config ───────────────────────────────────────────────────────────────────
const WORKFLOW_NAME = "Platform Audit";
const POLL_INTERVAL_MS = 15_000;
const MAX_WAIT_MS = 300_000; // 5 minutes
const CI_START_TIMEOUT_MS = 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PushAndVerifyOptions {
  branch?: string;
  maxAttempts?: number;
  verbose?: boolean;
}

export interface PushAndVerifyResult {
  passed: boolean;
  branch: string;
  commitSha: string;
  runUrl: string;
  criticals: string[];
  warnings: string[];
  reportPath: string | null;
  scorecard: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd: string, opts: { silent?: boolean } = {}): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: opts.silent ? "pipe" : "inherit" }).trim();
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return (err.stdout ?? err.stderr ?? err.message ?? "").trim();
  }
}

function gh(args: string): string {
  const result = spawnSync("gh", args.split(" "), { encoding: "utf8" });
  return (result.stdout ?? "").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[push-and-verify] ${msg}`);
}

// ─── Core Function ────────────────────────────────────────────────────────────
export async function pushAndVerify(
  opts: PushAndVerifyOptions = {}
): Promise<PushAndVerifyResult> {
  const branch = opts.branch ?? run("git rev-parse --abbrev-ref HEAD", { silent: true });
  const verbose = opts.verbose ?? true;

  // Get repo
  const repo = run("gh repo view --json nameWithOwner -q .nameWithOwner", { silent: true });
  if (!repo) throw new Error("Not inside a GitHub repo or gh CLI not authenticated");

  // Push
  if (verbose) log(`Pushing ${branch} to ${repo}...`);
  execSync(`git push origin ${branch}`, { stdio: "inherit" });
  const commitSha = run("git rev-parse HEAD", { silent: true });
  const shortSha = commitSha.slice(0, 7);
  if (verbose) log(`Pushed commit ${shortSha}`);

  // Wait for CI run to appear
  if (verbose) log(`Waiting for '${WORKFLOW_NAME}' CI to start...`);
  let runId = "";
  const startWait = Date.now();
  while (!runId && Date.now() - startWait < CI_START_TIMEOUT_MS) {
    await sleep(5000);
    const raw = gh(
      `run list --repo ${repo} --workflow ${WORKFLOW_NAME} --branch ${branch} --limit 5 --json databaseId,headSha,status`
    );
    try {
      const runs = JSON.parse(raw) as Array<{ databaseId: string; headSha: string; status: string }>;
      const match = runs.find((r) => r.headSha === commitSha);
      if (match) runId = String(match.databaseId);
    } catch { /* keep waiting */ }
  }

  // Fallback to most recent run
  if (!runId) {
    if (verbose) log("CI did not start in 60s — checking most recent run...");
    const raw = gh(`run list --repo ${repo} --workflow ${WORKFLOW_NAME} --branch ${branch} --limit 1 --json databaseId`);
    try {
      const runs = JSON.parse(raw) as Array<{ databaseId: string }>;
      if (runs[0]) runId = String(runs[0].databaseId);
    } catch { /* nothing */ }
  }

  if (!runId) {
    throw new Error(`No CI run found for '${WORKFLOW_NAME}' on branch '${branch}'. Check workflow file exists.`);
  }

  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
  if (verbose) log(`CI run: ${runUrl}`);

  // Poll for completion
  if (verbose) log("Polling for CI completion...");
  let status = "";
  let conclusion = "";
  const pollStart = Date.now();

  while (Date.now() - pollStart < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const raw = gh(`run view ${runId} --repo ${repo} --json status,conclusion`);
    try {
      const d = JSON.parse(raw) as { status: string; conclusion: string };
      status = d.status;
      conclusion = d.conclusion;
      if (verbose) log(`  Status: ${status} | Conclusion: ${conclusion || "pending"} (${Math.round((Date.now() - pollStart) / 1000)}s)`);
      if (status === "completed") break;
    } catch { /* keep polling */ }
  }

  if (status !== "completed") {
    throw new Error(`CI timed out after ${MAX_WAIT_MS / 1000}s. Check: ${runUrl}`);
  }

  // ─── Success ────────────────────────────────────────────────────────────────
  if (conclusion === "success") {
    if (verbose) {
      console.log("\n✅ ═══════════════════════════════════════════════════");
      console.log(`✅  ALL CLEAR — Audit passed on ${repo}@${branch} (${shortSha})`);
      console.log(`✅  Run: ${runUrl}`);
      console.log("✅ ═══════════════════════════════════════════════════\n");
    }
    return {
      passed: true,
      branch,
      commitSha,
      runUrl,
      criticals: [],
      warnings: [],
      reportPath: null,
      scorecard: null,
    };
  }

  // ─── Failure — extract audit report ─────────────────────────────────────────
  if (verbose) {
    console.log("\n❌ ═══════════════════════════════════════════════════");
    console.log(`❌  AUDIT FAILED on ${repo}@${branch} (${shortSha})`);
    console.log(`❌  Run: ${runUrl}`);
    console.log("❌ ═══════════════════════════════════════════════════\n");
  }

  const artifactDir = `/tmp/audit-report-${runId}`;
  mkdirSync(artifactDir, { recursive: true });

  let reportPath: string | null = null;
  let criticals: string[] = [];
  let warnings: string[] = [];
  let scorecard: string | null = null;

  // Try to download artifact
  const dlResult = spawnSync("gh", ["run", "download", runId, "--repo", repo, "--dir", artifactDir], {
    encoding: "utf8",
  });

  if (dlResult.status === 0) {
    // Find the report txt file
    const findReport = (dir: string): string | null => {
      if (!existsSync(dir)) return null;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const found = findReport(join(dir, entry.name));
          if (found) return found;
        } else if (entry.name.endsWith(".txt")) {
          return join(dir, entry.name);
        }
      }
      return null;
    };

    reportPath = findReport(artifactDir);

    if (reportPath) {
      const content = readFileSync(reportPath, "utf8");
      criticals = content.split("\n").filter((l) => l.includes("[CRITICAL]"));
      warnings = content.split("\n").filter((l) => l.includes("[WARNING]"));
      const scorecardMatch = content.match(/SCORECARD[\s\S]{0,500}/);
      scorecard = scorecardMatch ? scorecardMatch[0].slice(0, 500) : null;

      if (verbose) {
        console.log("═══════════════════════════════════════════════════");
        console.log("  CRITICAL ISSUES TO FIX:");
        console.log("═══════════════════════════════════════════════════");
        if (criticals.length === 0) {
          console.log("  No [CRITICAL] issues — check [WARNING] issues below");
          warnings.slice(0, 20).forEach((w) => console.log(" ", w));
        } else {
          criticals.forEach((c) => console.log(" ", c));
        }
        if (scorecard) {
          console.log("\n" + scorecard);
        }
        console.log("═══════════════════════════════════════════════════\n");
        console.log(`Full report: ${reportPath}`);
      }
    }
  } else {
    // Fallback: run audit locally
    if (verbose) log("Could not download artifact — running local audit...");
    if (existsSync("scripts/audit.ts")) {
      const localResult = spawnSync("npx", ["tsx", "scripts/audit.ts"], {
        encoding: "utf8",
        env: { ...process.env, AUDIT_ROOT: "." },
      });
      const output = localResult.stdout + localResult.stderr;
      criticals = output.split("\n").filter((l) => l.includes("[CRITICAL]"));
      warnings = output.split("\n").filter((l) => l.includes("[WARNING]"));
      if (verbose && criticals.length > 0) {
        console.log("\nCRITICAL ISSUES:\n");
        criticals.forEach((c) => console.log(" ", c));
      }
    }
  }

  return {
    passed: false,
    branch,
    commitSha,
    runUrl,
    criticals,
    warnings,
    reportPath,
    scorecard,
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("push-and-verify.ts")) {
  const branch = process.argv[2];
  const maxAttempts = parseInt(process.argv[3] ?? "1", 10);

  (async () => {
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;
      console.log(`\n[push-and-verify] Attempt ${attempt}/${maxAttempts}`);
      const result = await pushAndVerify({ branch, verbose: true });
      if (result.passed) {
        process.exit(0);
      }
      if (attempt < maxAttempts) {
        console.log("\n[push-and-verify] Waiting for fixes before retry...");
        await sleep(5000);
      }
    }
    console.error(`\n[push-and-verify] Failed after ${maxAttempts} attempts.`);
    process.exit(1);
  })();
}
