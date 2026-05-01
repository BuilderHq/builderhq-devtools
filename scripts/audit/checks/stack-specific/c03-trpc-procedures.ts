// ─── CHECK 03 — tRPC Procedure Mismatches ────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue, fileExists, isInsideTemplateLiteral, isInsideBlockComment } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

// ─── BRACE-COUNTING BODY EXTRACTOR ───────────────────────────────────────────

function extractBody(src: string, openBracePos: number): string {
  let depth = 1;
  let pos = openBracePos + 1;
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
  return body;
}

// ─── ROUTER PARSER ───────────────────────────────────────────────────────────
// Handles two architectures:
//   1. Separate router declarations: const clientsRouter = router({ ... })
//      then merged: appRouter = router({ clients: clientsRouter, ... })
//   2. Inline nested routers: appRouter = router({ clients: router({ ... }), ... })

function parseRouterProcedures(routersFile: string): Map<string, Set<string>> {
  const src = readFile(routersFile);
  const namespaceMap = new Map<string, Set<string>>();

  // ── Step 1: Find the appRouter (or root router) ───────────────────────────
  // Try common patterns: export const appRouter, export const router, const appRouter
  const appRouterPatterns = [
    /export\s+const\s+appRouter\s*=\s*(?:router|createRouter|t\.router)\s*\(\s*\{/,
    /export\s+default\s+(?:router|createRouter|t\.router)\s*\(\s*\{/,
    /const\s+appRouter\s*=\s*(?:router|createRouter|t\.router)\s*\(\s*\{/,
  ];

  let appRouterBodyStart = -1;
  for (const pattern of appRouterPatterns) {
    const match = pattern.exec(src);
    if (match) {
      appRouterBodyStart = src.indexOf("{", match.index + match[0].length - 1);
      break;
    }
  }

  if (appRouterBodyStart === -1) return namespaceMap;

  const appRouterBody = extractBody(src, appRouterBodyStart);

  // ── Step 2: Extract top-level namespace keys from appRouter ───────────────
  // Walk the body character by character to find top-level keys
  // A top-level key is at depth=0 within the appRouter body
  const topLevelKeyRe = /^(\s{0,6})(\w+)\s*:\s*/gm;
  let km: RegExpExecArray | null;

  while ((km = topLevelKeyRe.exec(appRouterBody)) !== null) {
    const indent = km[1].length;
    // Only consider keys at the top level of appRouter (indent 0-4)
    if (indent > 4) continue;

    const namespace = km[2];
    if (["input", "output", "use", "meta", "middleware"].includes(namespace)) continue;

    const afterKey = appRouterBody.slice(km.index + km[0].length);

    // Case A: namespace: xxxRouter (reference to separately declared router)
    const refMatch = /^(\w+Router)\s*[,}]/.exec(afterKey);
    if (refMatch) {
      const routerRef = refMatch[1];
      // Find the separately declared router
      const declRe = new RegExp(
        `(?:export\\s+)?const\\s+${routerRef}\\s*=\\s*(?:router|createRouter|t\\.router)\\s*\\(\\s*\\{`
      );
      const declMatch = declRe.exec(src);
      if (declMatch) {
        const bodyStart = src.indexOf("{", declMatch.index + declMatch[0].length - 1);
        const body = extractBody(src, bodyStart);
        namespaceMap.set(namespace, extractProcedureNames(body));
      }
      continue;
    }

    // Case B: namespace: router({ ... }) — inline nested router
    const inlineMatch = /^(?:router|createRouter|t\.router)\s*\(\s*\{/.exec(afterKey);
    if (inlineMatch) {
      const bodyStart = afterKey.indexOf("{", inlineMatch.index + inlineMatch[0].length - 1);
      if (bodyStart !== -1) {
        const body = extractBody(afterKey, bodyStart);
        namespaceMap.set(namespace, extractProcedureNames(body));
      }
      continue;
    }

    // Case C: namespace: procedureName (direct procedure, not a sub-router)
    // This handles flat appRouters where procedures are directly in appRouter
    // We still add the namespace with an empty set so it's "known"
    if (!namespaceMap.has(namespace)) {
      namespaceMap.set(namespace, new Set());
    }
  }

  // ── Step 3: For flat appRouters, extract all procedures directly ──────────
  // If namespaces are empty (flat architecture), extract all top-level procedures
  const allEmpty = [...namespaceMap.values()].every(s => s.size === 0);
  if (allEmpty && namespaceMap.size > 0) {
    // Flat router — all keys ARE the procedures, namespace = first path segment
    // In this case, trpc.X.Y calls won't match — skip check 3 for flat routers
    namespaceMap.clear();
    // Extract all procedure names directly
    const procs = extractProcedureNames(appRouterBody);
    namespaceMap.set("__flat__", procs);
  }

  return namespaceMap;
}

// ─── PROCEDURE NAME EXTRACTOR ─────────────────────────────────────────────────
// Extracts top-level procedure names from a router body.
// A real procedure is: procedureName: publicProcedure|protectedProcedure|adminProcedure...
// We must NOT pick up Zod input field names (clientId, status, name, etc.)
function extractProcedureNames(body: string): Set<string> {
  const procedures = new Set<string>();

  // Only match lines where the value starts with a known procedure base
  // This filters out Zod input field names and nested object keys
  const procRe = /^\s{0,6}(\w+)\s*:\s*(publicProcedure|protectedProcedure|adminProcedure|superAdminProcedure|staffProcedure|clientProcedure|t\.procedure|procedure)\b/gm;
  let pm: RegExpExecArray | null;
  while ((pm = procRe.exec(body)) !== null) {
    procedures.add(pm[1]);
  }

  // Also detect procedures that are chained from a base procedure variable
  // e.g.: create: baseProcedure.input(...).mutation(...)
  // The pattern is: name: someWord.input( or name: someWord.query( or name: someWord.mutation(
  const chainedRe = /^\s{0,6}(\w+)\s*:\s*\w+\.(input|query|mutation|subscription)\s*[\(\(]/gm;
  while ((pm = chainedRe.exec(body)) !== null) {
    const name = pm[1];
    if (!["input", "output", "use", "meta", "middleware", "ctx", "opts"].includes(name)) {
      procedures.add(name);
    }
  }

  return procedures;
}

// ─── CHECK FUNCTION ───────────────────────────────────────────────────────────

export function check03_trpcProcedures(config: AuditConfig): CheckResult {
  const label = "tRPC Procedure Mismatches";
  let count = 0;

  if (!config.stack.hasTrpc) {
    return { check: 3, label, passed: true, count: 0, skipped: true, skipReason: "tRPC not detected" };
  }

  if (!config.paths.routersFile || !fileExists(config.paths.routersFile)) {
    return {
      check: 3, label, passed: true, count: 0,
      skipped: true, skipReason: `Routers file not found: ${config.paths.routersFile}`
    };
  }

  const routerMap = parseRouterProcedures(config.paths.routersFile);

  // If flat router detected, skip the check — trpc.X.Y pattern doesn't apply
  if (routerMap.has("__flat__")) {
    return {
      check: 3, label, passed: true, count: 0,
      skipped: true, skipReason: "Flat router architecture detected — procedure names are top-level keys"
    };
  }

  if (routerMap.size === 0) {
    return {
      check: 3, label, passed: true, count: 0,
      skipped: true, skipReason: "Could not parse router structure — skipping to avoid false positives"
    };
  }

  // Scan client files for trpc.namespace.procedure.useQuery/useMutation calls
  const files = getAllFiles(config.paths.clientSrc, [".ts", ".tsx"]);

  // Match: trpc.namespace.procedure.useQuery/useMutation/useInfiniteQuery
  const trpcCallRe = /\btrpc\.(\w+)\.(\w+)\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|useSubscription)\s*\(/g;

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);

    trpcCallRe.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = trpcCallRe.exec(src)) !== null) {
      // Skip matches inside template literals or block comments (documentation examples)
      if (isInsideTemplateLiteral(src, m.index) || isInsideBlockComment(src, m.index)) continue;

      const namespace = m[1];
      const procedure = m[2];

      const namespaceProcedures = routerMap.get(namespace);

      if (!namespaceProcedures) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        addIssue("CRITICAL", 3, rel, lineNum,
          `trpc.${namespace}.${procedure} — router namespace "${namespace}" does not exist in appRouter`,
          config);
        count++;
        continue;
      }

      if (!namespaceProcedures.has(procedure)) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        addIssue("CRITICAL", 3, rel, lineNum,
          `trpc.${namespace}.${procedure} — procedure "${procedure}" does not exist in the "${namespace}" router`,
          config);
        count++;
      }
    }
  }

  return { check: 3, label, passed: count === 0, count };
}
