// ─── CHECK 38 — Direct process.env Access Bypassing Validation ───────────────
// Using process.env.X directly instead of going through the validated env.ts
// means missing vars cause silent undefined values — not startup crashes.
// This leads to mysterious runtime failures that are hard to debug in demos.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check38_envBypass(config: AuditConfig): CheckResult {
  const label = "Direct process.env Access Bypassing Validation";
  let count = 0;

  // Only flag if there's an env.ts validation file
  if (!config.paths.envFile) {
    return { check: 38, label, passed: true, count: 0, skipped: true, skipReason: "No env validation file detected" };
  }

  const allDirs = config.paths.allSourceDirs;

  const legitimateFiles = [
    "env.ts", "env.js", ".config.", "vite.config", "next.config",
    "jest.config", "vitest.config", ".test.", ".spec.", "seed", "migration"
  ];

  for (const dir of allDirs) {
    const files = getAllFiles(dir, [".ts", ".tsx", ".js", ".jsx"]);

    for (const file of files) {
      const rel = relPath(file, config.paths.rootDir);
      if (legitimateFiles.some(lf => rel.includes(lf))) continue;

      const src = readFile(file);
      const lines = src.split("\n");

      // Find direct process.env.X access
      const envRe = /\bprocess\.env\.([A-Z_][A-Z0-9_]*)\b/g;
      let m: RegExpExecArray | null;

      while ((m = envRe.exec(src)) !== null) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        const line = lines[lineNum - 1]?.trim() || "";

        // Skip comments
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
        // Skip NODE_ENV — it's always available and safe to access directly
        if (m[1] === "NODE_ENV") continue;

        addIssue("WARNING", 38, rel, lineNum,
          `process.env.${m[1]} accessed directly — import from env.ts instead to get startup validation and type safety`,
          config);
        count++;
      }
    }
  }

  return { check: 38, label, passed: count === 0, count };
}
