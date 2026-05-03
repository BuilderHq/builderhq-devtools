// ─── CHECK 35 — TODO/FIXME Comments in Production Code ───────────────────────
// TODO and FIXME comments are known unresolved issues. Shipping code with them
// means knowingly delivering incomplete or broken work to clients.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check35_todoComments(config: AuditConfig): CheckResult {
  const label = "TODO/FIXME Comments in Production Code";
  let count = 0;

  const allDirs = config.paths.allSourceDirs;
  const legitimateFiles = [
    ".test.", ".spec.", ".stories.", "storybook", "CHANGELOG", "README",
    ".md", "mock", "fixture", "seed"
  ];

  for (const dir of allDirs) {
    const files = getAllFiles(dir, [".ts", ".tsx", ".js", ".jsx"]);

    for (const file of files) {
      const rel = relPath(file, config.paths.rootDir);
      if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

      const src = readFile(file);
      const lines = src.split("\n");

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Match TODO, FIXME, HACK, XXX in comments
        if (/\/\/\s*(?:TODO|FIXME|HACK|XXX)\b/i.test(trimmed) ||
            /\/\*\s*(?:TODO|FIXME|HACK|XXX)\b/i.test(trimmed)) {

          const lineNum = idx + 1;
          const todoMatch = trimmed.match(/(?:TODO|FIXME|HACK|XXX)[:\s]*(.*)/i);
          const todoText = todoMatch?.[1]?.trim().slice(0, 60) || "unresolved item";

          const severity = /FIXME|HACK/i.test(trimmed) ? "WARNING" : "INFO";

          addIssue(severity as "WARNING" | "INFO", 35, rel, lineNum,
            `${trimmed.match(/(?:TODO|FIXME|HACK|XXX)/i)?.[0]}: "${todoText}" — resolve before showcasing`,
            config);
          count++;
        }
      });
    }
  }

  return { check: 35, label, passed: count === 0, count };
}
