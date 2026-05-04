// ─── CHECK 24 — Missing Empty State Handling ─────────────────────────────────
// .map() on an empty array renders nothing — users see a blank screen instead
// of a helpful "no results" or "get started" message.
// CRITICAL: API query results with no empty state handling
// WARNING:  useState arrays with no empty state handling
// SKIP:     Hardcoded constants and nested properties of static objects
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

    // Build a set of variable names defined as literals in this file (static data)
    const staticNames = new Set<string>();
    const staticRe = /(?:const|let|var)\s+(\w+)\s*=\s*[\[{]/g;
    let sa: RegExpExecArray | null;
    while ((sa = staticRe.exec(src)) !== null) {
      staticNames.add(sa[1]);
    }

    // Find variables from API queries (useQuery, useSuspenseQuery, etc.)
    const queryVars = new Set<string>();
    const queryRe = /const\s*\{\s*data(?:\s*:\s*(\w+))?\s*[,}].*\}\s*=.*\.use(?:Query|SuspenseQuery|InfiniteQuery)\s*\(/g;
    let qm: RegExpExecArray | null;
    while ((qm = queryRe.exec(src)) !== null) {
      // data: aliasName or just data
      const alias = qm[1] || "data";
      queryVars.add(alias);
    }
    // Also catch: const leads = trpc.X.Y.useQuery().data
    const directQueryRe = /const\s+(\w+)\s*=\s*\w+(?:\.\w+)+\.use(?:Query|SuspenseQuery)\s*\(/g;
    while ((qm = directQueryRe.exec(src)) !== null) {
      queryVars.add(qm[1]);
    }

    // Find variables from useState
    const stateVars = new Set<string>();
    const stateRe = /const\s*\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState\s*[<(]/g;
    let sm: RegExpExecArray | null;
    while ((sm = stateRe.exec(src)) !== null) {
      stateVars.add(sm[1]);
    }

    // Find .map( calls in JSX context
    const mapRe = /\{([\w?.[\]]+)\.map\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = mapRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";

      // Skip comments
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;

      const arrayExpr = m[1];
      if (!arrayExpr || arrayExpr.length < 2) continue;

      const rootVar = arrayExpr.split(/[.?[]/)[0];
      const baseVar = arrayExpr.split(".").pop()?.replace(/\?/g, "") || arrayExpr;

      // Skip ALL_CAPS constants
      if (/^[A-Z][A-Z0-9_]+$/.test(rootVar)) continue;
      if (/^[A-Z][A-Z0-9_]+$/.test(baseVar)) continue;

      // Skip known static constants from this file
      if (staticNames.has(rootVar)) continue;

      // Determine if this is from a query or state
      const isFromQuery = queryVars.has(rootVar) || queryVars.has(baseVar);
      const isFromState = stateVars.has(rootVar);

      // Skip if not from a known dynamic source
      if (!isFromQuery && !isFromState) continue;

      // Check if there's already an empty state guard
      const hasLengthCheck =
        new RegExp(`${baseVar}\\s*\\.\\s*length`).test(src) ||
        new RegExp(`${rootVar}\\s*\\.\\s*length`).test(src) ||
        new RegExp(`${baseVar}\\s*&&`).test(src) ||
        new RegExp(`!\\s*${baseVar}`).test(src) ||
        /\.length\s*===\s*0/.test(src) ||
        /\.length\s*==\s*0/.test(src) ||
        /isEmpty|empty.?state|EmptyState|no.?results|NoResults|no.?data|NoData/i.test(src);

      if (!hasLengthCheck) {
        const severity = isFromQuery ? "CRITICAL" : "WARNING";
        addIssue(severity, 24, rel, lineNum,
          `${arrayExpr}.map() has no empty state fallback — renders blank screen when array is empty`,
          config);
        count++;
      }
    }
  }

  return { check: 24, label, passed: count === 0, count };
}
