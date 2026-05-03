// ─── CHECK 26 — Accessibility: Missing Labels on Interactive Elements ─────────
// Buttons and inputs without accessible labels are invisible to screen readers
// and fail WCAG 2.1 AA — which also affects SEO and usability for all users.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check26_accessibility(config: AuditConfig): CheckResult {
  const label = "Accessibility: Missing Labels on Interactive Elements";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 26, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Check for icon-only buttons (no text content, no aria-label)
    // Pattern: <button> that contains only an icon component or SVG and no text
    const iconButtonRe = /<button\b([^>]*)>\s*(?:<[A-Z]\w+[^>]*\/>|<svg[\s\S]*?<\/svg>)\s*<\/button>/g;
    let m: RegExpExecArray | null;

    while ((m = iconButtonRe.exec(src)) !== null) {
      const attrs = m[1];
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("{/*")) continue;

      const hasAriaLabel =
        /aria-label\s*=/.test(attrs) ||
        /aria-labelledby\s*=/.test(attrs) ||
        /title\s*=/.test(attrs);

      if (!hasAriaLabel) {
        addIssue("WARNING", 26, rel, lineNum,
          `Icon-only button has no aria-label — invisible to screen readers and fails WCAG 2.1 AA`,
          config);
        count++;
      }
    }

    // Check for <input> without associated label
    const inputRe = /<input\b([^>]*?)(?:\/>|>)/g;
    while ((m = inputRe.exec(src)) !== null) {
      const attrs = m[1];
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("{/*")) continue;

      // Skip hidden inputs
      if (/type\s*=\s*["']hidden["']/.test(attrs)) continue;

      const hasLabel =
        /aria-label\s*=/.test(attrs) ||
        /aria-labelledby\s*=/.test(attrs) ||
        /id\s*=/.test(attrs) || // could be associated with a <label htmlFor>
        /placeholder\s*=/.test(attrs); // not ideal but common pattern

      if (!hasLabel) {
        addIssue("WARNING", 26, rel, lineNum,
          `<input> has no aria-label or associated label — inaccessible to screen readers`,
          config);
        count++;
      }
    }
  }

  return { check: 26, label, passed: count === 0, count };
}
