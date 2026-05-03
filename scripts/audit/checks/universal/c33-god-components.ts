// ─── CHECK 33 — God Components (Oversized Files) ─────────────────────────────
// Components over 300 lines are doing too much — they're hard to debug, slow
// to render, and a nightmare to maintain. Break them up.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

const LINE_LIMIT = 300;
const SEVERE_LIMIT = 500;

export function check33_godComponents(config: AuditConfig): CheckResult {
  const label = "God Components (Oversized Files)";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 33, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const legitimateFiles = [
    ".test.", ".spec.", ".stories.", "storybook", "schema", "migration",
    "generated", ".d.ts", "types", "constants", "mock", "fixture"
  ];

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

    const src = readFile(file);
    const lineCount = src.split("\n").length;

    if (lineCount >= SEVERE_LIMIT) {
      addIssue("WARNING", 33, rel, 1,
        `Component is ${lineCount} lines — severely oversized (limit: ${LINE_LIMIT}). Split into smaller components.`,
        config);
      count++;
    } else if (lineCount >= LINE_LIMIT) {
      addIssue("INFO", 33, rel, 1,
        `Component is ${lineCount} lines — consider splitting into smaller, focused components (recommended limit: ${LINE_LIMIT})`,
        config);
      count++;
    }
  }

  return { check: 33, label, passed: count === 0, count };
}
