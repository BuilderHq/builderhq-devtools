// ─── CHECK 39 — Slow Perceived Performance: Missing Optimistic Updates ────────
// Mutations that wait for server confirmation before updating the UI feel slow
// and unresponsive — especially on delete/toggle/like actions where the outcome
// is predictable. This is one of the biggest "feels broken" signals in demos.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check39_optimisticUpdates(config: AuditConfig): CheckResult {
  const label = "Slow Perceived Performance: No Optimistic Updates on Key Mutations";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 39, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx", ".ts"]);
  const mutationHooks = config.patterns.mutationHooks;

  // Patterns that indicate optimistic updates are in place
  const optimisticPatterns = [
    /onMutate\s*:/,           // React Query optimistic update
    /optimisticData/,
    /setQueryData/,           // manually updating cache
    /cancelQueries/,          // cancelling in-flight queries for optimistic update
    /rollback/i,
    /previousData/,
    /useOptimistic/,          // React 19 hook
    /optimistic/i,
  ];

  // Action keywords that strongly benefit from optimistic updates
  const optimisticCandidates = /\b(delete|remove|toggle|like|unlike|archive|complete|check|uncheck|star|pin|mark)\b/i;

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    const mutationRe = new RegExp(`\\b(${mutationHooks.join("|")})\\s*\\(`, "g");
    let m: RegExpExecArray | null;

    while ((m = mutationRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;

      // Check if this mutation is for a quick-action type operation
      const surrounding = src.slice(Math.max(0, m.index - 100), m.index + 300);
      if (!optimisticCandidates.test(surrounding)) continue;

      // Check if optimistic update patterns are present
      const hasOptimistic = optimisticPatterns.some(re => re.test(src));
      if (hasOptimistic) continue;

      addIssue("INFO", 39, rel, lineNum,
        `${m[1]}() on a quick-action (delete/toggle/etc) has no optimistic update — UI will feel slow waiting for server response`,
        config);
      count++;
      break; // One per file
    }
  }

  return { check: 39, label, passed: count === 0, count };
}
