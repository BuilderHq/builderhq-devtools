// ─── CHECK 08 — Build Verification ───────────────────────────────────────────
import { execSync } from "child_process";
import type { AuditConfig, CheckResult } from "../../types.js";
import { addIssue } from "../../utils.js";

export function check08_buildVerify(config: AuditConfig): CheckResult {
  const label = "Build Verification";

  // Skip if SKIP_BUILD_CHECK env var is set (used in CI for non-main branches)
  if (process.env.SKIP_BUILD_CHECK === "true") {
    return { check: 8, label, passed: true, count: 0, skipped: true, skipReason: "SKIP_BUILD_CHECK=true" };
  }

  // Skip if NO_BUILD env var is set (user override)
  if (process.env.NO_BUILD === "true") {
    return { check: 8, label, passed: true, count: 0, skipped: true, skipReason: "NO_BUILD=true" };
  }

  const buildCmd = config.patterns.buildCommand;

  try {
    execSync(buildCmd, {
      cwd: config.paths.rootDir,
      stdio: "pipe",
      timeout: 300_000, // 5 minute timeout
    });
    return { check: 8, label, passed: true, count: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const output = (error.stdout?.toString() || "") + (error.stderr?.toString() || "");

    // Extract the first meaningful error line
    const errorLines = output.split("\n")
      .filter(l => l.includes("error") || l.includes("Error") || l.includes("TS"))
      .slice(0, 5)
      .join(" | ");

    addIssue("CRITICAL", 8, "BUILD", 0,
      `Build failed with command "${buildCmd}": ${errorLines || error.message || "unknown error"}`,
      config);

    return { check: 8, label, passed: false, count: 1 };
  }
}
