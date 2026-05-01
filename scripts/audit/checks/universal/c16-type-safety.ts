// ─── CHECK 16 — Type Safety Suppressions ─────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

// Files where type suppressions are more acceptable
const LENIENT_FILES = [
  ".d.ts", "generated", "migrations", "__generated__",
  "vendor", "polyfill", "shim",
];

export function check16_typeSafety(config: AuditConfig): CheckResult {
  const label = "Type Safety Suppressions";
  let count = 0;

  const files = getAllFiles(config.paths.rootDir, [".ts", ".tsx"]);

  // Track as-any counts per file to flag files with excessive use
  const asAnyByFile: Record<string, number> = {};

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (LENIENT_FILES.some(lf => rel.includes(lf))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // @ts-ignore
      if (/@ts-ignore/.test(line)) {
        addIssue("WARNING", 16, rel, lineNum,
          `@ts-ignore suppresses TypeScript errors — fix the underlying type issue instead`,
          config);
        count++;
      }

      // @ts-nocheck
      if (/@ts-nocheck/.test(line)) {
        addIssue("WARNING", 16, rel, lineNum,
          `@ts-nocheck disables TypeScript for the entire file — remove and fix all type errors`,
          config);
        count++;
      }

      // eslint-disable — only flag when it's suppressing type-related rules
      if (/eslint-disable.*@typescript-eslint\/(no-explicit-any|no-unsafe)/.test(line)) {
        addIssue("INFO", 16, rel, lineNum,
          `eslint-disable suppressing TypeScript safety rule — consider fixing the underlying issue`,
          config);
      }

      // as any — track per file
      const asAnyMatches = (line.match(/\bas\s+any\b/g) || []).length;
      if (asAnyMatches > 0) {
        asAnyByFile[rel] = (asAnyByFile[rel] || 0) + asAnyMatches;
      }
    }
  }

  // Flag files with excessive as any usage (threshold: 10+)
  for (const [file, asAnyCount] of Object.entries(asAnyByFile)) {
    if (asAnyCount >= 10) {
      addIssue("WARNING", 16, file, 0,
        `${asAnyCount} uses of "as any" in this file — high type safety debt, consider refactoring`,
        config);
      count++;
    } else if (asAnyCount >= 3) {
      addIssue("INFO", 16, file, 0,
        `${asAnyCount} uses of "as any" — consider adding proper type definitions`,
        config);
    }
  }

  return { check: 16, label, passed: count === 0, count };
}
