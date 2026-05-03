#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════════════════════
//  BUILDERHQ DEMO READINESS CHECK v1.0
//  Run this before every client walkthrough or demo.
//  Gives you a green/red signal in under 60 seconds.
//
//  Usage:
//    pnpm bhq:ready
//    pnpm bhq:ready --skip-build
//    pnpm bhq:ready --skip-db
// ═══════════════════════════════════════════════════════════════════════════════
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const SKIP_BUILD = args.includes("--skip-build") || process.env.SKIP_BUILD_CHECK === "true";
const SKIP_DB = args.includes("--skip-db") || process.env.SKIP_DB_CHECK === "true";
const SKIP_AUDIT = args.includes("--skip-audit");
const VERBOSE = args.includes("--verbose") || args.includes("-v");

// ── Helpers ───────────────────────────────────────────────────────────────────
interface CheckItem {
  name: string;
  passed: boolean;
  message: string;
  critical: boolean;
}

const results: CheckItem[] = [];
let criticalFailures = 0;
let warnings = 0;

function pass(name: string, message: string, critical = true) {
  results.push({ name, passed: true, message, critical });
}

function fail(name: string, message: string, critical = true) {
  results.push({ name, passed: false, message, critical });
  if (critical) criticalFailures++;
  else warnings++;
}

function skip(name: string, reason: string) {
  results.push({ name, passed: true, message: `SKIPPED: ${reason}`, critical: false });
}

function exec(cmd: string, opts: child_process.ExecSyncOptionsWithStringEncoding = { encoding: "utf-8", stdio: "pipe" }): string {
  try {
    return child_process.execSync(cmd, opts);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    throw new Error(err.stdout || err.stderr || err.message || "Command failed");
  }
}

function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkEnvVars(repoRoot: string) {
  const name = "Environment Variables Complete";
  const exampleFile = path.join(repoRoot, ".env.example");
  const envFile = path.join(repoRoot, ".env");

  if (!fs.existsSync(exampleFile)) {
    skip(name, "No .env.example found");
    return;
  }

  if (!fs.existsSync(envFile)) {
    fail(name, ".env file is missing — copy .env.example and fill in values");
    return;
  }

  const example = fs.readFileSync(exampleFile, "utf-8");
  const env = fs.readFileSync(envFile, "utf-8");

  const requiredKeys = example
    .split("\n")
    .filter(l => l.match(/^[A-Z_]+=/) && !l.startsWith("#"))
    .map(l => l.split("=")[0].trim());

  const presentKeys = env
    .split("\n")
    .filter(l => l.match(/^[A-Z_]+=/) && !l.startsWith("#"))
    .map(l => l.split("=")[0].trim());

  const missing = requiredKeys.filter(k => !presentKeys.includes(k));
  const empty = presentKeys.filter(k => {
    const line = env.split("\n").find(l => l.startsWith(k + "="));
    const value = line?.split("=").slice(1).join("=").trim();
    return !value || value === '""' || value === "''";
  });

  if (missing.length > 0) {
    fail(name, `Missing env vars: ${missing.join(", ")}`);
  } else if (empty.length > 0) {
    fail(name, `Empty env vars (need values): ${empty.join(", ")}`, false);
  } else {
    pass(name, `All ${requiredKeys.length} required env vars present`);
  }
}

async function checkTypeScript(repoRoot: string) {
  const name = "TypeScript: Zero Errors";

  if (SKIP_BUILD) {
    skip(name, "--skip-build flag set");
    return;
  }

  const tsconfigPath = path.join(repoRoot, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    skip(name, "No tsconfig.json found");
    return;
  }

  try {
    // Try using the project's own tsc
    const tscPath = path.join(repoRoot, "node_modules", ".bin", "tsc");
    if (!fs.existsSync(tscPath)) {
      skip(name, "TypeScript not installed in project");
      return;
    }

    exec(`cd "${repoRoot}" && "${tscPath}" --noEmit --skipLibCheck 2>&1`);
    pass(name, "No TypeScript errors");
  } catch (e: unknown) {
    const err = e as Error;
    const output = err.message || "";
    const errorCount = (output.match(/error TS/g) || []).length;
    fail(name, `${errorCount} TypeScript error${errorCount !== 1 ? "s" : ""} found — run tsc --noEmit to see details`);
  }
}

async function checkBuild(repoRoot: string) {
  const name = "Build Compiles Successfully";

  if (SKIP_BUILD) {
    skip(name, "--skip-build flag set");
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
  if (!pkg.scripts?.build) {
    skip(name, "No build script in package.json");
    return;
  }

  try {
    const pm = fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml")) ? "pnpm" :
               fs.existsSync(path.join(repoRoot, "yarn.lock")) ? "yarn" : "npm";
    exec(`cd "${repoRoot}" && ${pm} run build 2>&1`, { encoding: "utf-8", stdio: "pipe" });
    pass(name, "Build completed successfully");
  } catch (e: unknown) {
    const err = e as Error;
    fail(name, `Build failed: ${err.message?.slice(0, 200) || "unknown error"}`);
  }
}

async function checkDatabaseConnection(repoRoot: string) {
  const name = "Database Connection";

  if (SKIP_DB) {
    skip(name, "--skip-db flag set");
    return;
  }

  // Check if there's a DB connection test script
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
  if (pkg.scripts?.["db:check"] || pkg.scripts?.["db:ping"]) {
    try {
      const pm = fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml")) ? "pnpm" : "npm";
      exec(`cd "${repoRoot}" && ${pm} run db:check 2>&1`, { encoding: "utf-8", stdio: "pipe" });
      pass(name, "Database reachable");
    } catch {
      fail(name, "Database connection failed — check DB_URL in .env");
    }
    return;
  }

  // Check if DATABASE_URL is set
  const envFile = path.join(repoRoot, ".env");
  if (fs.existsSync(envFile)) {
    const env = fs.readFileSync(envFile, "utf-8");
    if (/DATABASE_URL\s*=\s*.+/.test(env) || /DB_URL\s*=\s*.+/.test(env)) {
      pass(name, "DATABASE_URL present (connection not verified — add db:check script for full check)");
    } else {
      fail(name, "No DATABASE_URL in .env", false);
    }
  } else {
    skip(name, "No .env file found");
  }
}

async function checkNoConsoleErrors(repoRoot: string) {
  const name = "No Unhandled console.error in Source";

  const srcDirs = ["client/src", "src", "app"].map(d => path.join(repoRoot, d)).filter(fs.existsSync);
  if (srcDirs.length === 0) {
    skip(name, "No source directory found");
    return;
  }

  let errorCount = 0;
  const errorFiles: string[] = [];

  for (const dir of srcDirs) {
    try {
      const output = exec(`grep -rn "console\\.error" "${dir}" --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null || true`);
      const lines = output.trim().split("\n").filter(l => l && !l.includes("//") && !l.includes("* "));
      if (lines.length > 0) {
        errorCount += lines.length;
        errorFiles.push(...lines.slice(0, 3).map(l => l.split(":")[0]));
      }
    } catch {
      // grep returns exit 1 when no matches — that's fine
    }
  }

  if (errorCount > 0) {
    fail(name, `${errorCount} console.error call${errorCount !== 1 ? "s" : ""} found in source — known unhandled errors`, false);
  } else {
    pass(name, "No console.error calls in source");
  }
}

async function checkTodoComments(repoRoot: string) {
  const name = "No FIXME/HACK Comments in Source";

  const srcDirs = ["client/src", "server", "src", "app"].map(d => path.join(repoRoot, d)).filter(fs.existsSync);
  if (srcDirs.length === 0) {
    skip(name, "No source directory found");
    return;
  }

  let fixmeCount = 0;

  for (const dir of srcDirs) {
    try {
      const output = exec(`grep -rn "// FIXME\\|// HACK\\|// XXX" "${dir}" --include="*.ts" --include="*.tsx" 2>/dev/null || true`);
      const lines = output.trim().split("\n").filter(l => l.trim());
      fixmeCount += lines.length;
    } catch {
      // fine
    }
  }

  if (fixmeCount > 0) {
    fail(name, `${fixmeCount} FIXME/HACK comment${fixmeCount !== 1 ? "s" : ""} found — known broken code`, false);
  } else {
    pass(name, "No FIXME/HACK comments in source");
  }
}

async function checkCriticalRoutes(repoRoot: string) {
  const name = "Critical Routes Defined";

  // Check if there's a routes config or router setup
  const routeFiles = [
    "client/src/App.tsx", "client/src/router.tsx", "client/src/routes.tsx",
    "src/App.tsx", "src/router.tsx", "app/router.tsx"
  ].map(f => path.join(repoRoot, f)).filter(fs.existsSync);

  if (routeFiles.length === 0) {
    skip(name, "No router file found");
    return;
  }

  const routeContent = routeFiles.map(f => fs.readFileSync(f, "utf-8")).join("\n");
  const routeCount = (routeContent.match(/<Route\s|path\s*=|createBrowserRouter/g) || []).length;

  if (routeCount > 0) {
    pass(name, `${routeCount} route definition${routeCount !== 1 ? "s" : ""} found`);
  } else {
    fail(name, "No routes found in router file", false);
  }
}

async function runFullAudit(repoRoot: string) {
  const name = "41-Check Platform Audit";

  if (SKIP_AUDIT) {
    skip(name, "--skip-audit flag set");
    return;
  }

  // Find the audit script relative to this file
  const auditScript = path.join(__dirname, "audit.ts");
  if (!fs.existsSync(auditScript)) {
    skip(name, "Audit script not found");
    return;
  }

  try {
    exec(
      `AUDIT_ROOT="${repoRoot}" SKIP_BUILD_CHECK=true npx tsx "${auditScript}" 2>&1`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    pass(name, "All 41 checks passed");
  } catch (e: unknown) {
    const err = e as Error;
    const output = err.message || "";
    const criticalMatch = output.match(/BUILD BLOCKED — (\d+) critical/);
    const critCount = criticalMatch ? criticalMatch[1] : "unknown";
    fail(name, `Audit found ${critCount} critical issue${critCount !== "1" ? "s" : ""} — run pnpm audit:platform for details`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const repoRoot = findRepoRoot();
  const projectName = (() => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
      return pkg.name || path.basename(repoRoot);
    } catch {
      return path.basename(repoRoot);
    }
  })();

  console.log("\n" + "═".repeat(60));
  console.log("  BUILDERHQ DEMO READINESS CHECK");
  console.log(`  Project: ${projectName}`);
  console.log(`  Path:    ${repoRoot}`);
  console.log("═".repeat(60) + "\n");

  // Run all checks
  await checkEnvVars(repoRoot);
  await checkTypeScript(repoRoot);
  await checkBuild(repoRoot);
  await checkDatabaseConnection(repoRoot);
  await checkNoConsoleErrors(repoRoot);
  await checkTodoComments(repoRoot);
  await checkCriticalRoutes(repoRoot);
  await runFullAudit(repoRoot);

  // Print results
  console.log("\n" + "─".repeat(60));
  for (const result of results) {
    const icon = result.passed ? "✅" : (result.critical ? "❌" : "⚠️ ");
    const label = result.name.padEnd(42);
    const msg = VERBOSE || !result.passed ? `  ${result.message}` : "";
    console.log(`  ${icon} ${label}${msg}`);
  }

  console.log("\n" + "═".repeat(60));

  if (criticalFailures === 0 && warnings === 0) {
    console.log("  RESULT: ✅ READY TO SHOWCASE");
    console.log("  All checks passed. You're good to go.");
  } else if (criticalFailures === 0) {
    console.log(`  RESULT: ✅ READY TO SHOWCASE (with ${warnings} warning${warnings !== 1 ? "s" : ""})`);
    console.log("  No critical issues. Warnings are non-blocking.");
  } else {
    console.log(`  RESULT: ❌ NOT READY — ${criticalFailures} critical issue${criticalFailures !== 1 ? "s" : ""} must be resolved`);
    console.log("  Fix the issues above before showcasing to clients.");
  }

  console.log("═".repeat(60) + "\n");

  process.exit(criticalFailures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Readiness check failed:", err);
  process.exit(2);
});
