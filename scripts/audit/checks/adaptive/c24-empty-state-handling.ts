// ─── CHECK 24 — Missing Empty State Handling ─────────────────────────────────
// .map() on an empty array renders nothing — users see a blank screen instead
// of a helpful "no results" or "get started" message.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check24_emptyStateHandling(config: AuditConfig): CheckResult {
  const label = "Missing Empty State Handling";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 24, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Find .map( calls in JSX context (inside return statements)
    // Pattern: {someArray.map( or {data?.map( or {items.map(
    const mapRe = /\{[\w?.[\]]+\.map\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = mapRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";

      // Skip comments
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;

      // Extract the array variable name being mapped
      const arrayMatch = m[0].match(/\{([\w?.[\]]+)\.map/);
      const arrayVar = arrayMatch?.[1]?.replace(/\?/g, "").replace(/\[.*\]/, "") || "";

      if (!arrayVar || arrayVar.length < 2) continue;

      // Check if there's a length/empty check anywhere in the file for this variable
      const baseVar = arrayVar.split(".").pop() || arrayVar;
      const hasLengthCheck =
        new RegExp(`${baseVar}\\s*\\.\\s*length`).test(src) ||
        new RegExp(`${baseVar}\\s*&&`).test(src) ||
        new RegExp(`!\\s*${baseVar}`).test(src) ||
        /\.length\s*===\s*0/.test(src) ||
        /\.length\s*==\s*0/.test(src) ||
        /isEmpty|empty.?state|EmptyState|no.?results|NoResults|no.?data|NoData/i.test(src);

      if (!hasLengthCheck) {
        addIssue("CRITICAL", 24, rel, lineNum,
          `${arrayVar}.map() has no empty state fallback — renders blank screen when array is empty`,
          config);
        count++;
      }
    }
  }

  return { check: 24, label, passed: count === 0, count };
}
