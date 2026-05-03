// ─── CHECK 41 — Unguarded WIP Features (Feature Flag Enforcement) ────────────
// Components marked as WIP or "coming soon" that aren't behind a feature flag
// can accidentally appear in demos — showing clients half-built work.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check41_featureFlags(config: AuditConfig): CheckResult {
  const label = "Unguarded WIP Features (Feature Flag Enforcement)";
  let count = 0;

  const allDirs = config.paths.allSourceDirs;

  const legitimateFiles = [
    ".test.", ".spec.", ".stories.", "storybook", "CHANGELOG", "README",
    ".md", "flags.ts", "flags.js", "feature-flags", "featureFlags"
  ];

  // Check if project has a feature flag system
  const allFiles: string[] = [];
  for (const dir of allDirs) {
    allFiles.push(...getAllFiles(dir, [".ts", ".tsx", ".js", ".jsx"]));
  }

  const hasFlagSystem = allFiles.some(f => {
    const rel = relPath(f, config.paths.rootDir);
    return /flags?\.(ts|js)|feature.?flags?/i.test(rel);
  });

  for (const dir of allDirs) {
    const files = getAllFiles(dir, [".ts", ".tsx", ".jsx"]);

    for (const file of files) {
      const rel = relPath(file, config.paths.rootDir);
      if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

      const src = readFile(file);
      const lines = src.split("\n");

      lines.forEach((line, idx) => {
        const trimmed = line.trim();

        // Look for WIP/coming-soon markers in JSX or comments
        if (/\/\/\s*(?:WIP|COMING.?SOON|NOT.?READY|INCOMPLETE|DISABLED.?FOR.?DEMO)\b/i.test(trimmed) ||
            /["'](?:coming.?soon|wip|not.?ready|work.?in.?progress)["']/i.test(trimmed)) {

          const lineNum = idx + 1;

          // Check if it's wrapped in a feature flag
          const surrounding = src.slice(
            Math.max(0, src.split("\n").slice(0, idx).join("\n").length - 200),
            src.split("\n").slice(0, idx + 5).join("\n").length
          );

          const isGuarded =
            /FeatureFlag|featureFlag|flags\.|isEnabled|feature\[/i.test(surrounding) ||
            hasFlagSystem && /flags\./i.test(src);

          if (!isGuarded) {
            addIssue("WARNING", 41, rel, lineNum,
              `WIP/coming-soon marker found without a feature flag guard — may appear in client demos`,
              config);
            count++;
          }
        }
      });
    }
  }

  return { check: 41, label, passed: count === 0, count };
}
