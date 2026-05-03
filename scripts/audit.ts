#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════════════════════
//  UNIVERSAL PLATFORM AUDITOR v7.0
//  The definitive code quality, security, and operational integrity scanner
//  for TypeScript-based SaaS platforms.
//
//  Supports: React, Next.js, Vite, tRPC, Drizzle, Prisma, Apollo, REST
//  Industries: Construction, NDIS, Healthcare, Real Estate, Public Development
//
//  Usage:
//    pnpm exec tsx scripts/audit.ts
//    SKIP_BUILD_CHECK=true pnpm exec tsx scripts/audit.ts
//    NO_BUILD=true pnpm exec tsx scripts/audit.ts
//    AUDIT_CONFIG=./audit.config.json pnpm exec tsx scripts/audit.ts
// ═══════════════════════════════════════════════════════════════════════════════

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// ── Core engine ───────────────────────────────────────────────────────────────
import { detectConfig, loadUserConfig, printDetectedConfig } from "./audit/detector.js";
import type { AuditConfig, CheckResult } from "./audit/types.js";
import { getIssues, clearIssues } from "./audit/utils.js";

// ── Universal checks (work on any TypeScript project) ────────────────────────
import { check06_hardcodedUrls }   from "./audit/checks/universal/c06-hardcoded-urls.js";
import { check10_branding }        from "./audit/checks/universal/c10-branding.js";
import { check14_xss }             from "./audit/checks/universal/c14-xss.js";
import { check16_typeSafety }      from "./audit/checks/universal/c16-type-safety.js";
import { check18_hiddenFeatures }  from "./audit/checks/universal/c18-hidden-features.js";
import { check20_consoleLog }      from "./audit/checks/universal/c20-console-log.js";
import { check22_effectCleanup }   from "./audit/checks/universal/c22-effect-cleanup.js";
import { check26_accessibility }   from "./audit/checks/universal/c26-accessibility.js";
import { check28_hardcodedColours } from "./audit/checks/universal/c28-hardcoded-colours.js";
import { check29_responsiveLayout } from "./audit/checks/universal/c29-responsive-layout.js";
import { check33_godComponents }   from "./audit/checks/universal/c33-god-components.js";
import { check34_inlineStyles }    from "./audit/checks/universal/c34-inline-styles.js";
import { check35_todoComments }    from "./audit/checks/universal/c35-todo-comments.js";
import { check36_magicNumbers }    from "./audit/checks/universal/c36-magic-numbers.js";
import { check40_keyboardNavigation } from "./audit/checks/universal/c40-keyboard-navigation.js";
import { check41_featureFlags }    from "./audit/checks/universal/c41-feature-flags.js";

// ── Adaptive checks (work on any project, adapt behavior to stack) ────────────
import { check01_deadVariables }   from "./audit/checks/adaptive/c01-dead-variables.js";
import { check04_brokenImports }   from "./audit/checks/adaptive/c04-broken-imports.js";
import { check07_jsxStructure }    from "./audit/checks/adaptive/c07-jsx-structure.js";
import { check08_buildVerify }     from "./audit/checks/adaptive/c08-build-verify.js";
import { check11_envCoverage }     from "./audit/checks/adaptive/c11-env-coverage.js";
import { check17_rawFetch }        from "./audit/checks/adaptive/c17-raw-fetch.js";
import { check19_loadingStates }   from "./audit/checks/adaptive/c19-loading-states.js";
import { check23_mutationErrorHandling } from "./audit/checks/adaptive/c23-mutation-error-handling.js";
import { check24_emptyStateHandling }    from "./audit/checks/adaptive/c24-empty-state-handling.js";
import { check25_submitButtonDisabled }  from "./audit/checks/adaptive/c25-submit-button-disabled.js";
import { check27_errorBoundaries }       from "./audit/checks/adaptive/c27-error-boundaries.js";
import { check30_userFeedback }          from "./audit/checks/adaptive/c30-user-feedback.js";
import { check31_loadingSkeleton }       from "./audit/checks/adaptive/c31-loading-skeleton.js";
import { check32_formValidation }        from "./audit/checks/adaptive/c32-form-validation.js";
import { check38_envBypass }             from "./audit/checks/adaptive/c38-env-bypass.js";
import { check39_optimisticUpdates }     from "./audit/checks/adaptive/c39-optimistic-updates.js";

// ── Stack-specific checks (only run when the relevant stack is detected) ──────
import { check02_schemaMismatches }    from "./audit/checks/stack-specific/c02-schema-mismatches.js";
import { check03_trpcProcedures }      from "./audit/checks/stack-specific/c03-trpc-procedures.js";
import { check05_duplicateKeys }       from "./audit/checks/stack-specific/c05-duplicate-keys.js";
import { check09_dbIntegrity }         from "./audit/checks/stack-specific/c09-db-integrity.js";
import { check12_authGuards }          from "./audit/checks/stack-specific/c12-auth-guards.js";
import { check13_unboundedInputs }     from "./audit/checks/stack-specific/c13-unbounded-inputs.js";
import { check15_orphanedMigrations }  from "./audit/checks/stack-specific/c15-orphaned-migrations.js";
import { check21_unprotectedRoutes }   from "./audit/checks/stack-specific/c21-unprotected-routes.js";
import { check37_missingZodInput }      from "./audit/checks/stack-specific/c37-missing-zod-input.js";

// ─────────────────────────────────────────────────────────────────────────────

const VERSION = "7.0.0";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine repo root: walk up from this file until we find package.json
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

// ── Report Printer ────────────────────────────────────────────────────────────

function printReport(
  results: CheckResult[],
  config: AuditConfig,
  startTime: number
): { criticalCount: number; warningCount: number; passed: boolean } {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const issues = getIssues();

  const criticalIssues = issues.filter(i => i.severity === "CRITICAL");
  const warningIssues  = issues.filter(i => i.severity === "WARNING");
  const infoIssues     = issues.filter(i => i.severity === "INFO");

  const passedChecks  = results.filter(r => r.passed || r.skipped).length;
  const failedChecks  = results.filter(r => !r.passed && !r.skipped).length;
  const skippedChecks = results.filter(r => r.skipped).length;

  const overallPassed = criticalIssues.length === 0;

  // ── Banner ────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  console.log(`  UNIVERSAL PLATFORM AUDITOR v${VERSION}`);
  console.log(`  Project: ${path.basename(config.paths.rootDir)}`);
  console.log(`  Stack:   ${describeStack(config)}`);
  console.log(`  Scanned: ${elapsed}s`);
  console.log("═".repeat(72));

  // ── Scorecard ─────────────────────────────────────────────────────────────
  console.log("\n  SCORECARD");
  console.log("  " + "─".repeat(68));

  for (const result of results) {
    const num = String(result.check).padStart(2, "0");
    const label = result.label.padEnd(45);
    let status: string;

    if (result.skipped) {
      status = `  SKIP  ${result.skipReason || ""}`;
    } else if (result.passed) {
      status = "  PASS";
    } else {
      status = `  FAIL  (${result.count} issue${result.count !== 1 ? "s" : ""})`;
    }

    console.log(`  [${num}] ${label}${status}`);
  }

  console.log("  " + "─".repeat(68));
  console.log(`  ${passedChecks} passed | ${failedChecks} failed | ${skippedChecks} skipped`);
  console.log(`  ${criticalIssues.length} critical | ${warningIssues.length} warnings | ${infoIssues.length} info`);

  // ── Critical Issues ───────────────────────────────────────────────────────
  if (criticalIssues.length > 0) {
    console.log("\n" + "─".repeat(72));
    console.log("  CRITICAL ISSUES — Must fix before deployment");
    console.log("─".repeat(72));

    for (const issue of criticalIssues) {
      const loc = issue.line > 0 ? `:${issue.line}` : "";
      console.log(`\n  [CRITICAL] CHECK ${String(issue.check).padStart(2, "0")} | ${issue.file}${loc}`);
      console.log(`  ${issue.message}`);
    }
  }

  // ── Warning Issues ────────────────────────────────────────────────────────
  if (warningIssues.length > 0) {
    console.log("\n" + "─".repeat(72));
    console.log("  WARNINGS — Fix before next release");
    console.log("─".repeat(72));

    for (const issue of warningIssues) {
      const loc = issue.line > 0 ? `:${issue.line}` : "";
      console.log(`\n  [WARNING] CHECK ${String(issue.check).padStart(2, "0")} | ${issue.file}${loc}`);
      console.log(`  ${issue.message}`);
    }
  }

  // ── Info ──────────────────────────────────────────────────────────────────
  if (infoIssues.length > 0) {
    console.log("\n" + "─".repeat(72));
    console.log("  INFO — Tracked items (not blocking)");
    console.log("─".repeat(72));

    for (const issue of infoIssues) {
      const loc = issue.line > 0 ? `:${issue.line}` : "";
      console.log(`  [INFO] ${issue.file}${loc}: ${issue.message}`);
    }
  }

  // ── Final Verdict ─────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  if (overallPassed) {
    console.log("  STATUS: ALL CLEAR — No critical issues found");
  } else {
    console.log(`  STATUS: BUILD BLOCKED — ${criticalIssues.length} critical issue${criticalIssues.length !== 1 ? "s" : ""} must be resolved`);
  }
  console.log("═".repeat(72) + "\n");

  return {
    criticalCount: criticalIssues.length,
    warningCount: warningIssues.length,
    passed: overallPassed,
  };
}

function describeStack(config: AuditConfig): string {
  const parts: string[] = [];
  const s = config.stack;

  if (s.hasNextjs) parts.push("Next.js");
  else if (s.hasVite) parts.push("Vite");
  else if (s.hasReact) parts.push("React");

  if (s.hasTrpc) parts.push("tRPC");
  else if (s.hasApollo) parts.push("Apollo");
  else if (s.hasGraphql) parts.push("GraphQL");
  else if (s.hasExpress) parts.push("Express REST");
  else parts.push("REST");

  if (s.hasDrizzle) parts.push("Drizzle");
  else if (s.hasPrisma) parts.push("Prisma");
  else if (s.hasMongoose) parts.push("Mongoose");

  if (s.hasZod) parts.push("Zod");
  if (s.hasStripe) parts.push("Stripe");

  return parts.join(" + ") || "TypeScript";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  // Use AUDIT_ROOT env var if set, otherwise use the current working directory
  // This ensures the auditor scans the TARGET repo, not its own location
  const repoRoot = process.env.AUDIT_ROOT
    ? path.resolve(process.env.AUDIT_ROOT)
    : findRepoRoot(process.cwd());

  console.log(`\n  Detecting stack in: ${repoRoot}`);

  // Build config (auto-detects stack, loads audit.config.json if present)
  const userConfig = loadUserConfig(repoRoot);
  const config = detectConfig(repoRoot, userConfig);

  printDetectedConfig(config);
  console.log(`  Stack detected: ${describeStack(config)}`);
  console.log(`  Running 41 checks...\n`);

  clearIssues();
  const results: CheckResult[] = [];

  // ── Run all checks ────────────────────────────────────────────────────────
  const checks = [
    // Universal tier — always run
    () => check06_hardcodedUrls(config),
    () => check10_branding(config),
    () => check14_xss(config),
    () => check16_typeSafety(config),
    () => check18_hiddenFeatures(config),
    () => check20_consoleLog(config),
    () => check22_effectCleanup(config),

    // Adaptive tier — adapts to stack
    () => check01_deadVariables(config),
    () => check04_brokenImports(config),
    () => check07_jsxStructure(config),
    () => check08_buildVerify(config),
    () => check11_envCoverage(config),
    () => check17_rawFetch(config),
    () => check19_loadingStates(config),

    // Stack-specific tier — only runs when stack is detected
    () => check02_schemaMismatches(config),
    () => check03_trpcProcedures(config),
    () => check05_duplicateKeys(config),
    () => check09_dbIntegrity(config),
    () => check12_authGuards(config),
    () => check13_unboundedInputs(config),
    () => check15_orphanedMigrations(config),
    () => check21_unprotectedRoutes(config),
    () => check37_missingZodInput(config),
    // UX & Workflow checks (Tier 1 — Adaptive)
    () => check23_mutationErrorHandling(config),
    () => check24_emptyStateHandling(config),
    () => check25_submitButtonDisabled(config),
    () => check27_errorBoundaries(config),
    () => check30_userFeedback(config),
    () => check31_loadingSkeleton(config),
    () => check32_formValidation(config),
    () => check38_envBypass(config),
    () => check39_optimisticUpdates(config),
    // UX & Workflow checks (Tier 1 — Universal)
    () => check26_accessibility(config),
    () => check28_hardcodedColours(config),
    () => check29_responsiveLayout(config),
    // Code Quality checks (Tier 2)
    () => check33_godComponents(config),
    () => check34_inlineStyles(config),
    () => check35_todoComments(config),
    () => check36_magicNumbers(config),
    // Keyboard & Feature Flag checks
    () => check40_keyboardNavigation(config),
    () => check41_featureFlags(config),
  ];

  for (const checkFn of checks) {
    try {
      const result = await checkFn();
      results.push(result);
      const num = String(result.check).padStart(2, "0");
      const status = result.skipped ? "SKIP" : result.passed ? "PASS" : "FAIL";
      process.stdout.write(`  [${num}] ${result.label.padEnd(45)} ${status}\n`);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`  [ERROR] Check failed: ${error.message}`);
    }
  }

  // Sort results by check number for the report
  results.sort((a, b) => a.check - b.check);

  // Print the full report
  const { criticalCount, passed } = printReport(results, config, startTime);

  // Write output file if AUDIT_OUTPUT_FILE is set (used by CI)
  const outputFile = process.env.AUDIT_OUTPUT_FILE;
  if (outputFile) {
    // Re-run with output captured — the CI reporter reads this file
    const issues = getIssues();
    const lines: string[] = [];
    for (const issue of issues) {
      const loc = issue.line > 0 ? `:${issue.line}` : "";
      lines.push(`[${issue.severity}] CHECK ${String(issue.check).padStart(2, "0")} | ${issue.file}${loc} | ${issue.message}`);
    }
    fs.writeFileSync(outputFile, lines.join("\n"), "utf-8");
  }

  // Exit with code 1 if there are critical issues (used by CI to block merges)
  if (!passed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Audit failed with unexpected error:", err);
  process.exit(2);
});
