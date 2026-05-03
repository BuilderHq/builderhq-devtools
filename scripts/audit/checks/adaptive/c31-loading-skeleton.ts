// ─── CHECK 31 — Missing Loading Skeleton on Data-Fetching Components ─────────
// Components that fetch data with no skeleton/placeholder cause a jarring
// content flash — the layout jumps when data loads, which looks broken in demos.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check31_loadingSkeleton(config: AuditConfig): CheckResult {
  const label = "Missing Loading Skeleton on Data-Fetching Components";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 31, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);
  const queryHooks = config.patterns.queryHooks;

  const skeletonPatterns = [
    /Skeleton/,
    /skeleton/,
    /Shimmer/,
    /shimmer/,
    /Placeholder/i,
    /loading.?placeholder/i,
    /pulse/,  // Tailwind animate-pulse
    /animate-pulse/,
    /Spinner/,
    /<Loader/,
    /isLoading\s*&&/,
    /isPending\s*&&/,
    /loading\s*&&/,
    /loading\s*\?/,
    /isLoading\s*\?/,
    /isPending\s*\?/,
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    const queryHookRe = new RegExp(`\\b(${queryHooks.join("|")})\\s*\\(`, "g");
    let m: RegExpExecArray | null;

    while ((m = queryHookRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;

      // Check if the component has any skeleton/loading UI
      const hasSkeletonUI = skeletonPatterns.some(re => re.test(src));
      if (hasSkeletonUI) continue;

      // Check if isLoading is destructured but not used for UI
      const preceding = src.slice(Math.max(0, m.index - 200), m.index);
      const destructureMatch = preceding.match(/const\s*\{([^}]+)\}\s*=/);
      if (destructureMatch) {
        const destructured = destructureMatch[1];
        if (/\bisLoading\b|\bisPending\b/.test(destructured)) {
          // isLoading is destructured but no skeleton UI — it's probably just used for button state
          // Only flag if there's a .map() in the same file (data list component)
          if (!/{[\w?.[\]]+\.map\s*\(/.test(src)) continue;
        }
      }

      addIssue("INFO", 31, rel, lineNum,
        `${m[1]}() has no loading skeleton — content flash when data loads looks broken in demos`,
        config);
      count++;
      break; // One per file
    }
  }

  return { check: 31, label, passed: count === 0, count };
}
