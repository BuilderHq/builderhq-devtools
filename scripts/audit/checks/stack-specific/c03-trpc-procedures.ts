// ─── CHECK 03 — tRPC Procedure Mismatches ────────────────────────────────────
import * as path from "path";
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

// ─── PROCEDURE NAME EXTRACTOR ─────────────────────────────────────────────────
function extractProcedureNames(body: string): Set<string> {
  const procedures = new Set<string>();
  const procRe = /^\s{0,6}(\w+)\s*:\s*(publicProcedure|protectedProcedure|adminProcedure|superAdminProcedure|staffProcedure|clientProcedure|adminLocalProcedure|t\.procedure|procedure)\b/gm;
  let pm: RegExpExecArray | null;
  while ((pm = procRe.exec(body)) !== null) {
    procedures.add(pm[1]);
  }
  const chainedRe = /^\s{0,6}(\w+)\s*:\s*\w+\.(input|query|mutation|subscription)\s*[\(\(]/gm;
  while ((pm = chainedRe.exec(body)) !== null) {
    const name = pm[1];
    if (!["input", "output", "use", "meta", "middleware", "ctx", "opts"].includes(name)) {
      procedures.add(name);
    }
  }
  return procedures;
}

// ─── CROSS-FILE ROUTER RESOLVER ───────────────────────────────────────────────
// Resolves a named router export from an imported file.
// e.g. import { checkoutRouter } from "./checkoutRouter"
// Returns the procedure names from that router.
function resolveRouterFromImport(
  routerName: string,
  routersFilePath: string,
  src: string
): Set<string> | null {
  // Find the import statement for this router name
  const importRe = new RegExp(
    `import\\s*\\{[^}]*\\b${routerName}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`
  );
  const importMatch = importRe.exec(src);
  if (!importMatch) return null;

  const importPath = importMatch[1];
  const baseDir = path.dirname(routersFilePath);

  // Try common extensions
  const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx"];
  let resolvedPath: string | null = null;
  for (const ext of extensions) {
    const candidate = path.resolve(baseDir, importPath + ext);
    if (fileExists(candidate)) {
      resolvedPath = candidate;
      break;
    }
    // Also try without extension (if already has one)
    const candidateRaw = path.resolve(baseDir, importPath);
    if (fileExists(candidateRaw)) {
      resolvedPath = candidateRaw;
      break;
    }
  }
  if (!resolvedPath) return null;

  const importedSrc = readFile(resolvedPath);

  // Find the router declaration in the imported file
  const declRe = new RegExp(
    `(?:export\\s+)?const\\s+${routerName}\\s*=\\s*(?:router|createRouter|t\\.router)\\s*\\(\\s*\\{`
  );
  const declMatch = declRe.exec(importedSrc);
  if (!declMatch) return null;

  const bodyStart = importedSrc.indexOf("{", declMatch.index + declMatch[0].length - 1);
  if (bodyStart === -1) return null;

  const body = extractBody(importedSrc, bodyStart);
  return extractProcedureNames(body);
}

// ─── ROUTER PARSER ───────────────────────────────────────────────────────────
function parseRouterProcedures(routersFile: string): Map<string, Set<string>> {
  const src = readFile(routersFile);
  const namespaceMap = new Map<string, Set<string>>();

  // ── Step 1: Find the appRouter ────────────────────────────────────────────
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
  const topLevelKeyRe = /^(\s{0,6})(\w+)\s*:\s*/gm;
  let km: RegExpExecArray | null;
  while ((km = topLevelKeyRe.exec(appRouterBody)) !== null) {
    const indent = km[1].length;
    if (indent > 4) continue;
    const namespace = km[2];
    if (["input", "output", "use", "meta", "middleware"].includes(namespace)) continue;
    const afterKey = appRouterBody.slice(km.index + km[0].length);

    // Case A: namespace: xxxRouter — reference to a separately declared router
    const refMatch = /^(\w+Router)\s*[,}]/.exec(afterKey);
    if (refMatch) {
      const routerRef = refMatch[1];

      // First: try to find it declared in the same file
      const declRe = new RegExp(
        `(?:export\\s+)?const\\s+${routerRef}\\s*=\\s*(?:router|createRouter|t\\.router)\\s*\\(\\s*\\{`
      );
      const declMatch = declRe.exec(src);
      if (declMatch) {
        const bodyStart = src.indexOf("{", declMatch.index + declMatch[0].length - 1);
        const body = extractBody(src, bodyStart);
        namespaceMap.set(namespace, extractProcedureNames(body));
      } else {
        // Cross-file: resolve from import statement
        const crossFileProcs = resolveRouterFromImport(routerRef, routersFile, src);
        if (crossFileProcs !== null) {
          namespaceMap.set(namespace, crossFileProcs);
        } else {
          // Router imported but couldn't resolve — mark as known namespace with empty set
          // to avoid false positives on the namespace existence check
          namespaceMap.set(namespace, new Set());
        }
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

    // Case C: direct procedure or unknown — add as known namespace
    if (!namespaceMap.has(namespace)) {
      namespaceMap.set(namespace, new Set());
    }
  }

  // ── Step 3: Flat router fallback ─────────────────────────────────────────
  const allEmpty = [...namespaceMap.values()].every(s => s.size === 0);
  if (allEmpty && namespaceMap.size > 0) {
    namespaceMap.clear();
    const procs = extractProcedureNames(appRouterBody);
    namespaceMap.set("__flat__", procs);
  }

  return namespaceMap;
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

  const files = getAllFiles(config.paths.clientSrc, [".ts", ".tsx"]);
  const trpcCallRe = /\btrpc\.(\w+)\.(\w+)\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|useSubscription)\s*\(/g;

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    trpcCallRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = trpcCallRe.exec(src)) !== null) {
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
      // If we have the namespace but couldn't resolve procedures (cross-file fallback),
      // skip the procedure-level check to avoid false positives
      if (namespaceProcedures.size === 0) continue;
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
