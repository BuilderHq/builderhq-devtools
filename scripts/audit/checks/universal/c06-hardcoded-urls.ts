// ─── CHECK 06 — Hardcoded Bad URLs ────────────────────────────────────────────
import * as path from "path";
import { getAllFiles, readFile, relPath, addIssue, isInsideTemplateLiteral } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check06_hardcodedUrls(config: AuditConfig): CheckResult {
  const label = "Hardcoded Bad URLs";
  let count = 0;

  const { paths } = config;
  const files = getAllFiles(paths.rootDir, [".ts", ".tsx", ".js", ".jsx"], [
    "node_modules", ".git", "dist", "build", ".next",
    // Exclude config files where localhost is expected
    "vite.config", "next.config", "jest.config", "vitest.config",
    "playwright.config", "cypress.config", "audit.ts", "audit.config",
  ]);

  const badPatterns = [
    { re: /["'`]https?:\/\/localhost[:/]/g, label: "localhost URL" },
    { re: /["'`]https?:\/\/127\.0\.0\.1[:/]/g, label: "127.0.0.1 URL" },
    { re: /["'`]https?:\/\/0\.0\.0\.0[:/]/g, label: "0.0.0.0 URL" },
    { re: /["'`]https?:\/\/192\.168\.\d+\.\d+[:/]/g, label: "LAN IP URL" },
  ];

  // Files where localhost is expected/legitimate
  const legitimateFiles = [
    "vite.config", "next.config", "jest.config", "vitest.config",
    "playwright.config", "cypress.config", ".test.", ".spec.",
    "audit.ts", "audit.config", "ARCHITECTURE", "README",
    "docker-compose", "docker", ".env.example",
  ];

  for (const file of files) {
    const rel = relPath(file, paths.rootDir);
    if (legitimateFiles.some(lf => rel.includes(lf))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    for (const { re, label: urlLabel } of badPatterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (isInsideTemplateLiteral(src, m.index)) continue;
        const lineNum = src.slice(0, m.index).split("\n").length;
        const line = lines[lineNum - 1]?.trim() || "";
        // Skip if it's in a comment
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
        // Skip if it's in a string that looks like documentation/example
        if (line.includes("example") || line.includes("// ")) continue;
        // Skip if it's a fallback default in optionalEnv / env helper calls (template pattern)
        if (/optionalEnv\s*\(/.test(line) || /process\.env\[/.test(line)) continue;
        // Skip if it's a default value assignment in an env config object
        if (/:\s*optionalEnv|=\s*process\.env/.test(line)) continue;

        addIssue("CRITICAL", 6, rel, lineNum,
          `Hardcoded ${urlLabel} found — will break in production: ${m[0].slice(1, 40)}`,
          config);
        count++;
      }
    }
  }

  return { check: 6, label, passed: count === 0, count };
}
