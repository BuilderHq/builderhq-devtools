// ─── CHECK 23 — Unhandled Mutation Errors ────────────────────────────────────
// Mutations that have no onError / .catch() / try-catch leave users staring at
// a frozen UI with no feedback when something goes wrong.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
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

    // Find useMutation / trpc.X.useMutation calls
    const mutationRe = new RegExp(`\\b(${mutationHooks.join("|")})\\s*\\(`, "g");
    let m: RegExpExecArray | null;

    while ((m = mutationRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;

      // Get the surrounding ~300 chars to check for error handling options
      const surrounding = src.slice(m.index, m.index + 400);

      // Check if onError is in the mutation options
      const hasOnError = /onError\s*:/.test(surrounding);
      if (hasOnError) continue;

      // Get the variable name for the mutation
      const preceding = src.slice(Math.max(0, m.index - 200), m.index);
      const assignMatch = preceding.match(/const\s+(?:\{([^}]+)\}|(\w+))\s*=\s*$/);
      const destructured = assignMatch?.[1] || "";
      const varName = assignMatch?.[2] || "";

      // Check if mutate/mutateAsync is called with try-catch or .catch()
      const mutateCallRe = varName
        ? new RegExp(`\\b${varName}\\.mutate(?:Async)?\\s*\\(`)
        : /\.mutate(?:Async)?\s*\(/g;

      const hasTryCatch = /try\s*\{[\s\S]{0,500}\.mutate(?:Async)?\s*\(/.test(src) ||
        /\.mutate(?:Async)?\s*\([^)]*\)\s*\.catch\s*\(/.test(src);

      // Check if there's any global error handling in the file
      const hasGlobalErrorHandling = /onError\s*:/.test(src) || /\.catch\s*\(/.test(src);

      if (!hasTryCatch && !hasGlobalErrorHandling) {
        const line = lines[lineNum - 1]?.trim() || "";
        if (line.startsWith("//") || line.startsWith("*")) continue;

        addIssue("CRITICAL", 23, rel, lineNum,
          `${m[1]}() has no onError handler — failed mutations will silently freeze the UI with no user feedback`,
          config);
        count++;
      }
    }
  }

  return { check: 23, label, passed: count === 0, count };
}
