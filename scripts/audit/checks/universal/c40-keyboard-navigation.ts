// ─── CHECK 40 — Missing Keyboard Navigation Support ──────────────────────────
// Click handlers on non-interactive elements (div, span, li) with no keyboard
// equivalent break tab navigation and are inaccessible — a common oversight
// that sophisticated clients notice immediately during demos.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check40_keyboardNavigation(config: AuditConfig): CheckResult {
  const label = "Missing Keyboard Navigation on Click Handlers";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 40, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  // Non-interactive elements that shouldn't have onClick without keyboard support
  const nonInteractiveTags = ["div", "span", "li", "td", "tr", "p"];

  const legitimateFiles = [".test.", ".spec.", ".stories."];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (legitimateFiles.some(lf => rel.includes(lf))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    for (const tag of nonInteractiveTags) {
      // Find <div onClick= or <span onClick= etc
      const clickRe = new RegExp(`<${tag}\\b([^>]*?)onClick\\s*=([^>]*)>`, "g");
      let m: RegExpExecArray | null;

      while ((m = clickRe.exec(src)) !== null) {
        const attrs = m[1] + m[2];
        const lineNum = src.slice(0, m.index).split("\n").length;
        const line = lines[lineNum - 1]?.trim() || "";
        if (line.startsWith("//") || line.startsWith("{/*")) continue;

        // Check if keyboard handler is present
        const hasKeyboardHandler =
          /onKeyDown\s*=/.test(attrs) ||
          /onKeyUp\s*=/.test(attrs) ||
          /onKeyPress\s*=/.test(attrs) ||
          /role\s*=\s*["'](?:button|link|menuitem|option|tab)["']/.test(attrs) ||
          /tabIndex\s*=/.test(attrs);

        if (!hasKeyboardHandler) {
          addIssue("WARNING", 40, rel, lineNum,
            `<${tag} onClick> has no keyboard handler (onKeyDown) or role="button" — not keyboard accessible`,
            config);
          count++;
        }
      }
    }
  }

  return { check: 40, label, passed: count === 0, count };
}
