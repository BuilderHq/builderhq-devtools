// ─── CHECK 20 — Console.log in Server Code ────────────────────────────────────
import * as path from "path";
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

// Patterns that indicate intentional diagnostic logging (keep these)
const INTENTIONAL_PATTERNS = [
  /console\.error/,   // errors should be logged
  /console\.warn/,    // warnings should be logged
  /process\.env\.NODE_ENV.*development/,
  /if\s*\(.*dev/i,
  /\/\/ debug/i,
  /\/\/ diagnostic/i,
];

export function check20_consoleLog(config: AuditConfig): CheckResult {
  const label = "Console.log in Server Code";
  let count = 0;

  const { paths } = config;

  // Only scan server-side files
  const serverFiles = getAllFiles(paths.serverSrc, [".ts", ".js", ".mjs"]);

  // Also scan any shared lib files
  const sharedFiles: string[] = [];
  for (const dir of paths.allSourceDirs) {
    if (dir !== paths.clientSrc && dir !== paths.serverSrc) {
      sharedFiles.push(...getAllFiles(dir, [".ts", ".js"]));
    }
  }

  const allServerFiles = [...new Set([...serverFiles, ...sharedFiles])];

  for (const file of allServerFiles) {
    const rel = relPath(file, paths.rootDir);

    // Skip test files and config files
    if (rel.includes(".test.") || rel.includes(".spec.") ||
        rel.includes("jest.") || rel.includes("vitest.")) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Must contain console.log (not console.error/warn)
      if (!/console\.log\s*\(/.test(line)) continue;

      // Skip if it's in a comment
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      // Skip if guarded by NODE_ENV check (look at surrounding 3 lines)
      const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (/NODE_ENV.*development|isDev|isDebug|debug\s*&&/.test(context)) continue;

      // Determine severity: console.log that OUTPUTS sensitive variable values is CRITICAL.
      // We must distinguish between:
      //   CRITICAL: console.log("token:", token) — actual variable value being logged
      //   WARNING:  console.log("[Email] Sent templateKey to ...") — log message contains word 'key'
      //
      // Strategy: check if a sensitive VARIABLE NAME appears as an argument (not just in a string).
      // Extract the argument portion after console.log(
      const logArgMatch = line.match(/console\.log\s*\((.*)/);
      const logArgs = logArgMatch ? logArgMatch[1] : "";
      // Sensitive if a bare variable (not inside a string) matches sensitive names
      // Strip string literals from args to check for variable references
      const argsWithoutStrings = logArgs.replace(/["'`][^"'`]*["'`]/g, "");
      const isSensitive = /\b(?:password|passwordHash|token|accessToken|refreshToken|secret|apiKey|privateKey|sessionId|cookie)\b/i.test(argsWithoutStrings);
      const severity = isSensitive ? "CRITICAL" : "WARNING";
      const msg = isSensitive
        ? `console.log may be logging sensitive data (${line.trim().slice(0, 60)}) — remove immediately`
        : `console.log in server code will flood production logs — use a proper logger (pino, winston) or remove`;

      addIssue(severity, 20, rel, lineNum, msg, config);
      count++;
    }
  }

  return { check: 20, label, passed: count === 0, count };
}
