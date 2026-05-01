// ─── CHECK 10 — Old Branding / Placeholder Text ───────────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

const DEFAULT_BRANDING_TERMS = [
  "ACME Corp", "acmecorp", "Your Company", "YourCompany",
  "Example Inc", "placeholder company", "lorem ipsum",
  "TODO: replace", "REPLACE_ME", "COMPANY_NAME_HERE",
];

export function check10_branding(config: AuditConfig): CheckResult {
  const label = "Old Branding / Placeholder Text";
  let count = 0;

  const terms = [...DEFAULT_BRANDING_TERMS, ...config.patterns.brandingTerms];
  if (terms.length === 0) return { check: 10, label, passed: true, count: 0 };

  const files = getAllFiles(config.paths.rootDir, [
    ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".md", ".sql", ".mjs"
  ]);

  // Exclude the audit script itself and config files
  const excludeFiles = ["audit.ts", "audit.config.json", "ARCHITECTURE.md", "SKILL.md", "node_modules",
    "scripts/audit/", // Exclude the audit engine itself — it contains terms as string literals in check definitions
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (excludeFiles.some(ex => rel.includes(ex))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    for (const term of terms) {
      const termRe = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      let m: RegExpExecArray | null;
      while ((m = termRe.exec(src)) !== null) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        const line = lines[lineNum - 1]?.trim() || "";
        if (line.startsWith("//") || line.startsWith("*")) continue;
        // Skip placeholder attributes in UI forms — these are instructional text for end users,
        // not actual branding that needs replacing. e.g. placeholder="portal.yourcompany.com.au"
        if (/\bplaceholder\s*=/.test(line)) continue;
        // Skip title/label/description attributes that are instructional
        if (/\b(?:title|aria-label|aria-placeholder)\s*=/.test(line) &&
            /your company|yourcompany/i.test(line)) continue;

        addIssue("CRITICAL", 10, rel, lineNum,
          `Old branding term found: "${term}" — replace with production brand name`,
          config);
        count++;
      }
    }
  }

  return { check: 10, label, passed: count === 0, count };
}
