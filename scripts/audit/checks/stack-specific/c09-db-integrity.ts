// ─── CHECK 09 — Database Data Integrity ──────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue, fileExists } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check09_dbIntegrity(config: AuditConfig): CheckResult {
  const label = "Database Data Integrity";
  let count = 0;

  if (!config.stack.hasDrizzle && !config.stack.hasPrisma) {
    return { check: 9, label, passed: true, count: 0, skipped: true, skipReason: "No supported ORM detected" };
  }

  const { paths } = config;

  // ── Check 1: Unguarded DELETE operations ─────────────────────────────────
  const serverFiles = getAllFiles(paths.serverSrc, [".ts", ".js"]);

  for (const file of serverFiles) {
    const rel = relPath(file, paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Drizzle: db.delete(table) without .where()
      if (/\bdb\.delete\s*\(/.test(line)) {
        // Support inline suppression: // audit-ok: intentional full-table clear
        if (/\/\/\s*audit-ok/i.test(line)) continue;
        // Look ahead 5 lines for a .where() clause (handles multi-line chained calls)
        const lookahead = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
        if (!lookahead.includes(".where(")) {
          // Check if this is a known single-row config table pattern
          // (tables that store exactly one row of global config, safe to delete all)
          const tableArg = line.match(/db\.delete\s*\(\s*(\w+)/)?.[1] ?? "";
          const isSingleRowTable = /[Tt]oken|[Cc]onfig|[Ss]etting|[Cc]redential|[Ss]ecret|[Kk]ey/i.test(tableArg);
          const severity = isSingleRowTable ? "WARNING" : "CRITICAL";
          const note = isSingleRowTable
            ? ` ("${tableArg}" appears to be a single-row config table — if intentional, add // audit-ok comment)`
            : "";
          addIssue(severity, 9, rel, lineNum,
            `db.delete() without .where() clause — this will DELETE ALL ROWS in the table${note}`,
            config);
          count++;
        }
      }

      // Drizzle: db.update(table) without .where()
      if (/\bdb\.update\s*\(/.test(line)) {
        // Support inline suppression: // audit-ok
        if (/\/\/\s*audit-ok/i.test(line)) continue;
        // Look ahead 10 lines — .set({...}).where() can span many lines
        const lookahead = lines.slice(i, Math.min(i + 11, lines.length)).join("\n");
        if (!lookahead.includes(".where(")) {
          addIssue("WARNING", 9, rel, lineNum,
            `db.update() without .where() clause — this will UPDATE ALL ROWS in the table`,
            config);
          count++;
        }
      }

      // Raw SQL with DROP or TRUNCATE (extremely dangerous)
      if (/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(line)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("//") && !trimmed.startsWith("*")) {
          addIssue("CRITICAL", 9, rel, lineNum,
            `Raw DROP TABLE or TRUNCATE TABLE in server code — this is a destructive operation that cannot be undone`,
            config);
          count++;
        }
      }
    }
  }

  // ── Check 2: Seed files accessible in production ─────────────────────────
  const seedFiles = getAllFiles(paths.rootDir, [".ts", ".js", ".mjs"])
    .filter(f => f.includes("seed") && !f.includes("node_modules"));

  for (const file of seedFiles) {
    const rel = relPath(file, paths.rootDir);
    const src = readFile(file);

    // Check if seed file has a production guard
    const hasProductionGuard =
      /NODE_ENV.*production|process\.env\.ALLOW_SEED|SEED_GUARD/.test(src);

    if (!hasProductionGuard) {
      addIssue("WARNING", 9, rel, 0,
        `Seed file has no production environment guard — could accidentally be run in production. Add: if (process.env.NODE_ENV === 'production') process.exit(1)`,
        config);
      count++;
    }
  }

  return { check: 9, label, passed: count === 0, count };
}
