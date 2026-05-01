// ─── CHECK 18 — Hidden / Deferred Features ────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

const DEFERRED_PATTERNS = [
  { re: /NOCOMMIT/g, severity: "CRITICAL" as const, msg: "NOCOMMIT marker — this code must not be committed to production" },
  { re: /FIXME/g, severity: "WARNING" as const, msg: "FIXME marker — known broken code that needs fixing" },
  { re: /HACK:/g, severity: "WARNING" as const, msg: "HACK marker — technical debt that needs proper solution" },
  { re: /TODO:\s*enable/gi, severity: "WARNING" as const, msg: "TODO: enable — intentionally disabled feature, track its activation" },
  { re: /TODO:\s*remove/gi, severity: "WARNING" as const, msg: "TODO: remove — dead code scheduled for removal" },
  { re: /HIDDEN(?:\s|:)/g, severity: "INFO" as const, msg: "HIDDEN marker — intentionally hidden feature, ensure it is tracked" },
  { re: /DISABLED(?:\s|:)/g, severity: "INFO" as const, msg: "DISABLED marker — intentionally disabled feature" },
  { re: /TEMP(?:ORARY)?:/gi, severity: "INFO" as const, msg: "TEMPORARY marker — ensure this is not permanent" },
];

export function check18_hiddenFeatures(config: AuditConfig): CheckResult {
  const label = "Hidden / Deferred Features";
  let count = 0;

  const files = getAllFiles(config.paths.rootDir, [
    ".ts", ".tsx", ".js", ".jsx", ".css", ".sql", ".mjs"
  ]);

  const excludeFiles = ["audit.ts", "SKILL.md", "ARCHITECTURE.md", "CHANGELOG", "node_modules",
    "scripts/audit/", // Exclude audit engine — it contains NOCOMMIT/FIXME as string literals in check definitions
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (excludeFiles.some(ex => rel.includes(ex))) continue;

    const src = readFile(file);

    for (const { re, severity, msg } of DEFERRED_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        addIssue(severity, 18, rel, lineNum, msg, config);
        if (severity !== "INFO") count++;
      }
    }
  }

  return { check: 18, label, passed: count === 0, count };
}
