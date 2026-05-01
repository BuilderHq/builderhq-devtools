// ─── CHECK 01 — Dead Variable References ──────────────────────────────────────
// Detects variables that are used (e.g. .mutate(), .isPending) but never assigned
// from a data-fetching hook. Adapts to tRPC, React Query, SWR, and Apollo.
import { getAllFiles, readFile, relPath, addIssue, isInsideTemplateLiteral } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check01_deadVariables(config: AuditConfig): CheckResult {
  const label = "Dead Variable References";
  let count = 0;

  const { patterns, paths } = config;
  const allHooks = [...patterns.mutationHooks, ...patterns.queryHooks];

  const files = getAllFiles(paths.clientSrc, [".ts", ".tsx", ".js", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, paths.rootDir);
    const src = readFile(file);

    // ── Step 1: Collect all variables assigned from data-fetching hooks ──────
    const assignedHookVars = new Set<string>();

    // Standard assignment: const name = trpc.x.y.useMutation()
    // Also handles: const { mutate: doThing } = trpc.x.y.useMutation()
    const assignRe = /const\s+(?:\{[^}]+\}|\[([^\]]+)\]|(\w+))\s*=\s*(?:\w+\.)*(?:useMutation|useQuery|useInfiniteQuery|useSuspenseQuery|useSWR|useSWRMutation|useLazyQuery|useSubscription)\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = assignRe.exec(src)) !== null) {
      const fullMatch = m[0];

      // Destructured array: const [doSomething, { isLoading }] = useMutation()
      if (fullMatch.includes("[")) {
        const arrayContent = fullMatch.match(/const\s+\[([^\]]+)\]/)?.[1] || "";
        // First element is the trigger function, second is the result object
        const parts = arrayContent.split(",").map(s => s.trim());
        if (parts[0]) assignedHookVars.add(parts[0].replace(/\s*:.*/, "").trim());
      }
      // Destructured object: const { mutate, isPending } = useMutation()
      else if (fullMatch.includes("{")) {
        const objContent = fullMatch.match(/const\s+\{([^}]+)\}/)?.[1] || "";
        for (const part of objContent.split(",")) {
          const name = part.trim().split(/\s*:\s*/)[1]?.trim() || part.trim().split(/\s*:\s*/)[0]?.trim();
          if (name && /^\w+$/.test(name)) assignedHookVars.add(name);
        }
      }
      // Direct assignment: const myMutation = useMutation()
      else if (m[2]) {
        assignedHookVars.add(m[2]);
      }
    }

    // ── Step 2: Find variables used as mutation/query results ─────────────────
    // Look for patterns like: varName.mutate(...), varName.isPending, varName.data
    const usageRe = /\b(\w+)\.(mutate|mutateAsync|isPending|isLoading|isError|isSuccess|data|error|refetch|fetchNextPage)\b/g;

    while ((m = usageRe.exec(src)) !== null) {
      if (isInsideTemplateLiteral(src, m.index)) continue;

      const varName = m[1];
      const accessor = m[2];

      // ── CRITICAL FIX: Skip chained property access (e.g. event.query.state.error)
      // If the match is preceded by a dot, it's a chained property, not a standalone variable
      const charBefore = src[m.index - 1];
      if (charBefore === ".") continue;

      // Skip common non-hook objects and intermediate chain links
      if (["window", "document", "navigator", "console", "process", "Math",
           "Object", "Array", "JSON", "Promise", "event", "e", "err",
           "response", "res", "req", "ctx", "router", "form",
           "state", "query", "mutation", "cache", "client", "action",
           "result", "payload", "input", "output", "value", "props",
           "ref", "node", "el", "element", "target", "current"].includes(varName)) continue;

      // Skip if it's a single letter (likely a callback param)
      if (varName.length === 1) continue;

      // Skip if the variable is in the assigned set
      if (assignedHookVars.has(varName)) continue;

      // Skip if the variable is declared anywhere in the file (might be a prop or import)
      const isDeclaredElsewhere =
        new RegExp(`\\b(?:const|let|var|function)\\s+${varName}\\b`).test(src) ||
        new RegExp(`\\b${varName}\\s*:`).test(src) || // object property
        new RegExp(`import.*\\b${varName}\\b`).test(src) || // import
        new RegExp(`\\(.*\\b${varName}\\b.*\\)`).test(src); // function param

      if (isDeclaredElsewhere) continue;

      const lineNum = src.slice(0, m.index).split("\n").length;
      addIssue("CRITICAL", 1, rel, lineNum,
        `"${varName}.${accessor}" — variable "${varName}" is used but never assigned from a data-fetching hook. Will crash at runtime.`,
        config);
      count++;
    }
  }

  return { check: 1, label, passed: count === 0, count };
}
