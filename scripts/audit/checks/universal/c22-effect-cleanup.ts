// ─── CHECK 22 — Missing useEffect Cleanup ─────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check22_effectCleanup(config: AuditConfig): CheckResult {
  const label = "Missing useEffect Cleanup (Memory Leaks)";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 22, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".ts", ".tsx", ".js", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);

    // Find all useEffect blocks using a brace-depth scanner
    // Handles: useEffect(() => { ... }, [deps]) and useEffect(function() { ... }, [deps])
    const effectStartRe = /\buseEffect\s*\(\s*(?:(?:async\s*)?\([^)]*\)|function\s*\([^)]*\))\s*=>\s*\{|useEffect\s*\(\s*(?:async\s*)?function\s*\w*\s*\([^)]*\)\s*\{/g;

    let m: RegExpExecArray | null;
    while ((m = effectStartRe.exec(src)) !== null) {
      const startPos = m.index;
      const lineNum = src.slice(0, startPos).split("\n").length;

      // Extract the useEffect body using brace depth counting
      const openBrace = src.indexOf("{", startPos);
      if (openBrace === -1) continue;

      let depth = 1;
      let pos = openBrace + 1;
      let body = "";

      while (pos < src.length && depth > 0) {
        const ch = src[pos];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) break;
        }
        body += ch;
        pos++;
      }

      // Check if the body contains leak-prone patterns
      const hasSetInterval = /\bsetInterval\s*\(/.test(body);
      const hasSetTimeout = /\bsetTimeout\s*\(/.test(body);
      const hasAddEventListener = /\.addEventListener\s*\(/.test(body);
      const hasSubscription = /\.subscribe\s*\(/.test(body);
      const hasWebSocket = /new\s+WebSocket\s*\(/.test(body);
      const hasObserver = /new\s+(?:Intersection|Mutation|Resize)Observer\s*\(/.test(body);

      const hasLeak = hasSetInterval || hasSetTimeout || hasAddEventListener ||
                      hasSubscription || hasWebSocket || hasObserver;

      if (!hasLeak) continue;

      // Check if there is a return cleanup function
      const hasCleanup = /\breturn\s*(?:\(\s*)?\s*\(\s*\)\s*=>/.test(body) ||
                         /\breturn\s*function\s*\(/.test(body) ||
                         /\breturn\s*\(\s*\)\s*\{/.test(body) ||
                         /\breturn\s*\(\s*\)\s*=>/.test(body);

      if (!hasCleanup) {
        const leakTypes: string[] = [];
        if (hasSetInterval) leakTypes.push("setInterval");
        if (hasSetTimeout) leakTypes.push("setTimeout");
        if (hasAddEventListener) leakTypes.push("addEventListener");
        if (hasSubscription) leakTypes.push("subscription");
        if (hasWebSocket) leakTypes.push("WebSocket");
        if (hasObserver) leakTypes.push("Observer");

        addIssue("WARNING", 22, rel, lineNum,
          `useEffect with ${leakTypes.join(", ")} has no cleanup return function — memory leak on component unmount`,
          config);
        count++;
      }
    }
  }

  return { check: 22, label, passed: count === 0, count };
}
