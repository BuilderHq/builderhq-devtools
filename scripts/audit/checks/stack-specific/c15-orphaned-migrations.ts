// ─── CHECK 15 — Orphaned Migration Files ─────────────────────────────────────
import * as fs from "fs";
import * as path from "path";
import { relPath, addIssue, fileExists } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check15_orphanedMigrations(config: AuditConfig): CheckResult {
  const label = "Orphaned Migration Files";
  let count = 0;

  if (!config.stack.hasDrizzle && !config.stack.hasPrisma) {
    return { check: 15, label, passed: true, count: 0, skipped: true, skipReason: "No supported ORM detected" };
  }

  const { paths } = config;

  if (!paths.migrationsDir || !fs.existsSync(paths.migrationsDir)) {
    return { check: 15, label, passed: true, count: 0, skipped: true, skipReason: "Migrations directory not found" };
  }

  // ── Drizzle: Check _journal.json ──────────────────────────────────────────
  if (config.stack.hasDrizzle) {
    const journalPath = path.join(paths.migrationsDir, "meta", "_journal.json");

    if (!fileExists(journalPath)) {
      addIssue("WARNING", 15, relPath(paths.migrationsDir, paths.rootDir), 0,
        `Drizzle migration journal not found at ${journalPath} — run "drizzle-kit generate" to initialize`,
        config);
      count++;
      return { check: 15, label, passed: false, count };
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const trackedFiles = new Set<string>(
      (journal.entries || []).map((e: { tag: string }) => e.tag)
    );

    // Find all SQL files in the migrations directory
    const sqlFiles = fs.readdirSync(paths.migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .map(f => path.basename(f, ".sql"));

    for (const sqlFile of sqlFiles) {
      if (!trackedFiles.has(sqlFile)) {
        addIssue("CRITICAL", 15, `${relPath(paths.migrationsDir, paths.rootDir)}/${sqlFile}.sql`, 0,
          `Migration file "${sqlFile}.sql" exists on disk but is NOT tracked in the Drizzle journal. It will NEVER be applied automatically in a fresh deployment. Run "drizzle-kit generate" and "drizzle-kit push" to sync.`,
          config);
        count++;
      }
    }

    // Also check for snapshot files without corresponding SQL
    const metaDir = path.join(paths.migrationsDir, "meta");
    if (fs.existsSync(metaDir)) {
      const snapshotFiles = fs.readdirSync(metaDir)
        .filter(f => f.endsWith("_snapshot.json"))
        .map(f => f.replace("_snapshot.json", ""));

      for (const snapshot of snapshotFiles) {
        if (snapshot === "0000" || trackedFiles.has(snapshot)) continue;
        // Drizzle SQL files use descriptive names like "0001_smiling_peter_parker.sql"
        // so we match by prefix (e.g. snapshot "0001" matches "0001_smiling_peter_parker")
        const hasMatchingSql = sqlFiles.some(f => f.startsWith(snapshot)) || trackedFiles.has(snapshot);
        if (!hasMatchingSql) {
          addIssue("WARNING", 15, `drizzle/meta/${snapshot}_snapshot.json`, 0,
            `Snapshot file exists without a corresponding SQL migration — schema may be out of sync`,
            config);
        }
      }
    }
  }

  // ── Prisma: Check migration lock file ────────────────────────────────────
  if (config.stack.hasPrisma) {
    const lockFile = path.join(paths.migrationsDir, "migration_lock.toml");

    if (!fileExists(lockFile)) {
      addIssue("WARNING", 15, relPath(paths.migrationsDir, paths.rootDir), 0,
        `Prisma migration lock file not found — run "prisma migrate dev" to initialize`,
        config);
      count++;
      return { check: 15, label, passed: false, count };
    }

    // Check each migration directory has a migration.sql file
    const migrationDirs = fs.readdirSync(paths.migrationsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of migrationDirs) {
      const sqlPath = path.join(paths.migrationsDir, dir, "migration.sql");
      if (!fileExists(sqlPath)) {
        addIssue("WARNING", 15, `prisma/migrations/${dir}`, 0,
          `Migration directory "${dir}" has no migration.sql file — incomplete migration`,
          config);
        count++;
      }
    }
  }

  return { check: 15, label, passed: count === 0, count };
}
