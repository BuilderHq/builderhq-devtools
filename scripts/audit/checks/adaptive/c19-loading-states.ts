// ─── CHECK 19 — Missing UI Loading / Error States ────────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check19_loadingStates(config: AuditConfig): CheckResult {
  const label = "Missing UI Loading / Error States";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 19, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);
  const queryHooks = config.patterns.queryHooks;

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);

    // Find all useQuery / useSWR / useQuery calls
    const queryHookRe = new RegExp(`\\b(${queryHooks.join("|")})\\s*\\(`, "g");
    let m: RegExpExecArray | null;

    while ((m = queryHookRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;

      // Get the variable name assigned from this hook
      // Look backwards from the match for: const { data, isLoading } = useQuery(
      const preceding = src.slice(Math.max(0, m.index - 200), m.index);
      const assignMatch = preceding.match(/const\s+(?:\{([^}]+)\}|(\w+))\s*=\s*$/);

      if (!assignMatch) continue;

      const destructured = assignMatch[1] || "";
      const varName = assignMatch[2] || "";

      // Check if isLoading, isPending, isError, error, or status is destructured
      const hasLoadingState =
        /\bisLoading\b/.test(destructured) ||
        /\bisPending\b/.test(destructured) ||
        /\bisError\b/.test(destructured) ||
        /\berror\b/.test(destructured) ||
        /\bstatus\b/.test(destructured) ||
        /\bfetchStatus\b/.test(destructured);

      if (hasLoadingState) continue;

      // If using a plain variable name, check if it's used with .isLoading etc in the file
      if (varName) {
        const hasLoadingUsage =
          new RegExp(`\\b${varName}\\.(?:isLoading|isPending|isError|status)\\b`).test(src);
        if (hasLoadingUsage) continue;
      }

      // Check if the component renders a loading state anywhere
      const hasLoadingRender =
        /isLoading|isPending|isError|Skeleton|Spinner|Loading|<Loader/.test(src);

      if (!hasLoadingRender) {
        addIssue("WARNING", 19, rel, lineNum,
          `${m[1]}() called but no isLoading/isError state is checked — component will render empty/broken UI while data loads`,
          config);
        count++;
      }
    }
  }

  return { check: 19, label, passed: count === 0, count };
}
