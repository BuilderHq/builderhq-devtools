// ─── CHECK 34 — Excessive Inline Styles ──────────────────────────────────────
// Heavy use of style={{}} bypasses Tailwind/CSS modules — creates inconsistent
// UI, makes theming impossible, and slows down rendering.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

const INLINE_STYLE_THRESHOLD = 4; // more than this in one file = flag it

export function check34_inlineStyles(config: AuditConfig): CheckResult {
  const label = "Excessive Inline Styles";
  let count = 0;

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  const legitimateFiles = [
    ".test.", ".spec.", ".stories.", "storybook", "chart", "canvas",
    "animation", "transition"
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

    const src = readFile(file);

    // Count style={{ occurrences (inline style objects)
    const inlineStyleMatches = src.match(/\bstyle\s*=\s*\{\{/g) || [];
    const inlineStyleCount = inlineStyleMatches.length;

    if (inlineStyleCount > INLINE_STYLE_THRESHOLD) {
      addIssue("INFO", 34, rel, 1,
        `${inlineStyleCount} inline style={{}} usages found — use Tailwind classes for consistency and maintainability`,
        config);
      count++;
    }
  }

  return { check: 34, label, passed: count === 0, count };
}
