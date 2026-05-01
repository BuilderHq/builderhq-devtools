// ─── CHECK 17 — Raw Fetch Bypass ─────────────────────────────────────────────
// Detects direct fetch() calls in client code that bypass the project's API layer.
// Adapts: skips this check entirely for REST-based projects where fetch is the API layer.
import { getAllFiles, readFile, relPath, addIssue, hasIntentionalComment } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check17_rawFetch(config: AuditConfig): CheckResult {
  const label = "Raw Fetch Bypass";
  let count = 0;

  // If the project uses REST as its primary API layer, fetch is legitimate
  if (!config.stack.hasTrpc && !config.stack.hasApollo && !config.stack.hasGraphql) {
    return {
      check: 17, label, passed: true, count: 0,
      skipped: true, skipReason: "REST/fetch is the primary API layer for this project"
    };
  }

  const files = getAllFiles(config.paths.clientSrc, [".ts", ".tsx", ".js", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    const fetchRe = /\bfetch\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = fetchRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";

      // Skip comments
      if (line.startsWith("//") || line.startsWith("*")) continue;

      // Skip if there is an intentional comment in the preceding lines
      if (hasIntentionalComment(lines, lineNum)) continue;

      // Skip: mock fetch in test files
      if (rel.includes(".test.") || rel.includes(".spec.") ||
          rel.includes("__tests__") || rel.includes("__mocks__")) continue;

      // Skip: polyfill or fetch wrapper files
      if (rel.includes("polyfill") || rel.includes("fetch-wrapper") ||
          rel.includes("httpClient") || rel.includes("api-client")) continue;

      // Skip: tRPC httpBatchLink fetch override (this IS the tRPC transport layer)
      // Pattern: fetch(input, init) { return globalThis.fetch(input, ...) }
      const prevLines = lines.slice(Math.max(0, lineNum - 3), lineNum).join("\n");
      if (/httpBatchLink|httpLink|wsLink|splitLink/.test(prevLines)) continue;
      if (/fetch\s*\(input/.test(line) || /globalThis\.fetch/.test(line)) continue;

      // Skip: OAuth redirect fetches (fetching a URL to get a redirect URL is legitimate)
      if (/oauth|OAuth|social.*oauth|oauth.*start|social.*start/i.test(line)) continue;

      addIssue("WARNING", 17, rel, lineNum,
        `Direct fetch() call bypasses ${config.stack.hasTrpc ? "tRPC" : "GraphQL"} type safety and auth headers. Use the project's API client instead. Add an intentional comment if this is a necessary exception (e.g., multipart upload, webhook, third-party API).`,
        config);
      count++;
    }
  }

  return { check: 17, label, passed: count === 0, count };
}
