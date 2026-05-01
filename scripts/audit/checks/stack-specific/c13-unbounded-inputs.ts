// ─── CHECK 13 — Unbounded String Inputs ──────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue, fileExists } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check13_unboundedInputs(config: AuditConfig): CheckResult {
  const label = "Unbounded String Inputs (DoS Vector)";
  let count = 0;

  if (!config.stack.hasZod) {
    return { check: 13, label, passed: true, count: 0, skipped: true, skipReason: "Zod not detected" };
  }

  if (!config.paths.routersFile || !fileExists(config.paths.routersFile)) {
    return { check: 13, label, passed: true, count: 0, skipped: true, skipReason: "Routers file not found" };
  }

  const src = readFile(config.paths.routersFile);
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Match z.string() with no chained validators
    // z.string() followed by , or ) or .optional() or .nullable() but NOT .max() .min() .email() .url() .uuid() .regex() .length()
    if (!/z\.string\s*\(\s*\)/.test(line)) continue;

    // Check if it has a length constraint chained
    const hasConstraint = /z\.string\s*\(\s*\)\s*\.(?:max|min|email|url|uuid|regex|length|trim|datetime|ip|cuid|ulid|nanoid|base64|includes|startsWith|endsWith)\s*\(/.test(line);
    if (hasConstraint) continue;

    // Check if the next line has a constraint (multi-line chain)
    const nextLine = lines[i + 1] || "";
    const hasNextLineConstraint = /\.(?:max|min|email|url|uuid|regex|length|trim)\s*\(/.test(nextLine);
    if (hasNextLineConstraint) continue;

    // Determine severity based on context
    // Fields like password, content, description, notes are higher risk
    const isHighRisk = /password|content|description|notes|message|body|html|markdown|code|script/i.test(line);

    addIssue(
      isHighRisk ? "WARNING" : "INFO",
      13, relPath(config.paths.routersFile, config.paths.rootDir), lineNum,
      `z.string() with no .max() constraint — unbounded input is a DoS vector. Add .max(255) for names, .max(10000) for content, or appropriate limit.`,
      config
    );
    if (isHighRisk) count++;
  }

  return { check: 13, label, passed: count === 0, count };
}
