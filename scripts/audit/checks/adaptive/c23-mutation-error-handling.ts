// ─── CHECK 23 — Unhandled Mutation/Query Errors ───────────────────────────────
// Mutations and queries that have no onError / .catch() / try-catch leave users
// staring at a frozen UI with no feedback when something goes wrong.
import { getAllFiles, readFile, relPath, addIssue, isInsideTemplateLiteral, isInsideBlockComment, isInsideLineComment } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check23_mutationErrorHandling(config: AuditConfig): CheckResult {
  const label = "Unhandled Mutation Errors";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 23, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx", ".ts"]);
  const mutationHooks = config.patterns.mutationHooks;

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Check if the file has ANY global error handling (onError, .catch, try-catch)
    // If so, we consider the file as having error handling patterns
    const hasGlobalErrorHandling =
      /onError\s*:/.test(src) ||
      /\.catch\s*\(/.test(src) ||
      /try\s*\{[\s\S]{0,1000}catch\s*\(/.test(src);

    if (hasGlobalErrorHandling) continue;

    // Find useMutation / trpc.X.useMutation calls
    const mutationRe = new RegExp(`\\b(${mutationHooks.join("|")})\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = mutationRe.exec(src)) !== null) {
      // Skip if inside a template literal, block comment, or line comment
      if (isInsideTemplateLiteral(src, m.index)) continue;
      if (isInsideBlockComment(src, m.index)) continue;
      if (isInsideLineComment(src, m.index)) continue;

      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;

      // Get the surrounding ~400 chars to check for error handling options
      const surrounding = src.slice(m.index, m.index + 400);
      const hasOnError = /onError\s*:/.test(surrounding);
      if (hasOnError) continue;

      addIssue("CRITICAL", 23, rel, lineNum,
        `${m[1]}() has no onError handler — failed mutations will silently freeze the UI with no user feedback`,
        config);
      count++;
    }
  }

  return { check: 23, label, passed: count === 0, count };
}
