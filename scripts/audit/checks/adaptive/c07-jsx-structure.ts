// ─── CHECK 07 — Broken JSX Structure ─────────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check07_jsxStructure(config: AuditConfig): CheckResult {
  const label = "Broken JSX Structure";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 7, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // <Link> nested directly inside <a> — invalid HTML
      // Check: line has <Link and the surrounding context has an unclosed <a
      if (/<Link[\s>]/.test(line)) {
        // Look back up to 5 lines for an unclosed <a tag
        const lookback = lines.slice(Math.max(0, i - 5), i).join("\n");
        const aOpens = (lookback.match(/<a[\s>]/g) || []).length;
        const aCloses = (lookback.match(/<\/a>/g) || []).length;
        if (aOpens > aCloses) {
          addIssue("WARNING", 7, rel, lineNum,
            `<Link> nested inside <a> — invalid HTML, causes hydration errors and accessibility failures. Use <Link> alone or replace <a> with a div.`,
            config);
          count++;
        }
      }

      // <a> nested inside <a> — also invalid
      if (/<a[\s>]/.test(line) && !/<\/a>/.test(line)) {
        const lookback = lines.slice(Math.max(0, i - 3), i).join("\n");
        const aOpens = (lookback.match(/<a[\s>]/g) || []).length;
        const aCloses = (lookback.match(/<\/a>/g) || []).length;
        if (aOpens > aCloses) {
          addIssue("WARNING", 7, rel, lineNum,
            `Possible nested <a> tags — invalid HTML. Browsers will break the DOM structure.`,
            config);
          count++;
        }
      }

      // <button> inside <button> — invalid
      if (/<button[\s>]/.test(line)) {
        const lookback = lines.slice(Math.max(0, i - 3), i).join("\n");
        const opens = (lookback.match(/<button[\s>]/g) || []).length;
        const closes = (lookback.match(/<\/button>/g) || []).length;
        if (opens > closes) {
          addIssue("WARNING", 7, rel, lineNum,
            `Possible nested <button> tags — invalid HTML. Interactive elements cannot be nested.`,
            config);
          count++;
        }
      }
    }
  }

  return { check: 7, label, passed: count === 0, count };
}
