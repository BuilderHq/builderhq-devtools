// ─── CHECK 02 — Schema Field Mismatches ───────────────────────────────────────
// Detects UI code accessing DB fields that don't exist in the schema.
// Supports Drizzle ORM and Prisma.
import * as path from "path";
import { getAllFiles, readFile, relPath, addIssue, fileExists } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

// ── Drizzle Schema Parser ─────────────────────────────────────────────────────
function parseDrizzleSchema(schemaPath: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const src = readFile(schemaPath);

  // Match: export const tableName = mysqlTable("table_name", { ... })
  // or pgTable, sqliteTable
  const tableRe = /export\s+const\s+(\w+)\s*=\s*(?:mysql|pg|sqlite)Table\s*\(\s*["'`][^"'`]+["'`]\s*,\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = tableRe.exec(src)) !== null) {
    const tableName = m[1];
    const fields = new Set<string>();

    // Extract the table body using brace-depth counting
    const openBrace = src.indexOf("{", m.index + m[0].length - 1);
    if (openBrace === -1) continue;

    let depth = 1;
    let pos = openBrace + 1;
    let body = "";

    while (pos < src.length && depth > 0) {
      const ch = src[pos];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      }
      body += ch;
      pos++;
    }

    // Extract field names: fieldName: someType(...)
    const fieldRe = /^\s*(\w+)\s*:/gm;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.add(fm[1]);
    }

    tables.set(tableName, fields);
  }

  return tables;
}

// ── Prisma Schema Parser ──────────────────────────────────────────────────────
function parsePrismaSchema(schemaPath: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const src = readFile(schemaPath);

  // Match: model ModelName { ... }
  const modelRe = /^model\s+(\w+)\s*\{([^}]+)\}/gm;
  let m: RegExpExecArray | null;

  while ((m = modelRe.exec(src)) !== null) {
    const modelName = m[1].toLowerCase() + "s"; // Convert to plural for matching
    const body = m[2];
    const fields = new Set<string>();

    // Extract field names: fieldName Type
    const fieldRe = /^\s+(\w+)\s+\w/gm;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      if (!["@@", "//"].includes(fm[1].slice(0, 2))) {
        fields.add(fm[1]);
      }
    }

    tables.set(modelName, fields);
    // Also store by original model name
    tables.set(m[1], fields);
  }

  return tables;
}

export function check02_schemaMismatches(config: AuditConfig): CheckResult {
  const label = "Schema Field Mismatches";
  let count = 0;

  if (!config.stack.hasDrizzle && !config.stack.hasPrisma) {
    return {
      check: 2, label, passed: true, count: 0,
      skipped: true, skipReason: "No supported ORM detected (Drizzle/Prisma)"
    };
  }

  if (!config.paths.schemaFile || !fileExists(config.paths.schemaFile)) {
    return {
      check: 2, label, passed: true, count: 0,
      skipped: true, skipReason: `Schema file not found: ${config.paths.schemaFile}`
    };
  }

  // Parse schema
  const tables = config.stack.hasDrizzle
    ? parseDrizzleSchema(config.paths.schemaFile)
    : parsePrismaSchema(config.paths.schemaFile);

  if (tables.size === 0) {
    return { check: 2, label, passed: true, count: 0, skipped: true, skipReason: "No tables found in schema" };
  }

  // Build a flat set of all valid field names across all tables
  const allValidFields = new Set<string>();
  for (const fields of tables.values()) {
    for (const f of fields) allValidFields.add(f);
  }

  // Add server-computed fields (JOIN results, virtual fields)
  for (const f of config.patterns.serverComputedFields) {
    allValidFields.add(f);
  }

  // Scan client files for property accesses on DB-like objects
  const files = getAllFiles(config.paths.clientSrc, [".ts", ".tsx"]);

  // Common DB entity variable name patterns
  const entityVarRe = /\b(\w+)\.([\w]+)\b/g;

  // Words that are definitely not DB field accesses
  const SKIP_ACCESSORS = new Set([
    "length", "push", "pop", "map", "filter", "find", "forEach", "reduce",
    "slice", "splice", "join", "split", "trim", "toLowerCase", "toUpperCase",
    "toString", "valueOf", "hasOwnProperty", "then", "catch", "finally",
    "mutate", "mutateAsync", "isPending", "isLoading", "isError", "isSuccess",
    "data", "error", "refetch", "invalidate", "reset", "status", "fetchStatus",
    "current", "style", "className", "id", "key", "ref", "children",
    "onClick", "onChange", "onSubmit", "onBlur", "onFocus",
    "preventDefault", "stopPropagation", "target", "value", "checked",
    "prototype", "constructor", "name", "message", "stack",
  ]);

  // Browser/DOM API objects that should NEVER be treated as DB entities
  const SKIP_VAR_NAMES = new Set([
    "document", "window", "navigator", "location", "history", "screen",
    "localStorage", "sessionStorage", "indexedDB", "console", "performance",
    "fetch", "XMLHttpRequest", "WebSocket", "Worker", "ServiceWorker",
    "process", "global", "globalThis", "self", "top", "parent", "frames",
    "event", "e", "err", "error", "ex", "exception",
    "Math", "Date", "JSON", "Object", "Array", "String", "Number", "Boolean",
    "Promise", "Symbol", "Map", "Set", "WeakMap", "WeakSet",
    "React", "ReactDOM", "router", "route", "params", "query", "ctx",
    "req", "res", "next", "app", "server", "db", "orm",
  ]);

  // Variable names that suggest DB entity access
  // Note: 'document' removed — it matches document.addEventListener etc.
  const DB_ENTITY_PATTERNS = [
    /^(client|project|task|user|invoice|quote|proposal|site|job|lead|contact|staff|member|record|entry|row|result)s?$/i,
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);

    entityVarRe.lastIndex = 0;
    let m: RegExpExecArray | null;

    // Check if this file uses i18n (t() translation function)
    const usesI18n = /useTranslation|i18next|react-i18next/.test(src);
    // Build a set of i18n namespace names used in this file (e.g. t("tasks.xxx") -> "tasks")
    const i18nNamespaces = new Set<string>();
    if (usesI18n) {
      const i18nRe = /\bt\s*\(\s*["'`](\w+)\./g;
      let im: RegExpExecArray | null;
      while ((im = i18nRe.exec(src)) !== null) {
        i18nNamespaces.add(im[1]);
      }
    }

    while ((m = entityVarRe.exec(src)) !== null) {
      const varName = m[1];
      const fieldName = m[2];

      // Skip common non-entity patterns
      if (SKIP_ACCESSORS.has(fieldName)) continue;
      if (fieldName.length <= 1) continue;
      if (/^[A-Z]/.test(fieldName)) continue; // Skip capitalized (likely component/type)

      // Skip browser/DOM API objects
      if (SKIP_VAR_NAMES.has(varName)) continue;

      // Skip i18n namespace accesses: t("tasks.noTasks") generates varName="tasks", fieldName="noTasks"
      if (i18nNamespaces.has(varName)) continue;

      // Only check variables that look like DB entities
      const isEntityVar = DB_ENTITY_PATTERNS.some(re => re.test(varName));
      if (!isEntityVar) continue;

      // Skip if the field exists in any table
      if (allValidFields.has(fieldName)) continue;

      // Skip if there's a local variable with this name (it might be a local type extension)
      const localVarRe = new RegExp(`\\b(?:const|let|var)\\s+\\w+\\s*=.*\\.${fieldName}\\b|${fieldName}\\s*:\\s*\\w`);
      if (localVarRe.test(src)) continue;

      const lineNum = src.slice(0, m.index).split("\n").length;
      addIssue("WARNING", 2, rel, lineNum,
        `"${varName}.${fieldName}" — field "${fieldName}" not found in any schema table. Verify this is a server-computed field or add it to the schema.`,
        config);
      count++;
    }
  }

  return { check: 2, label, passed: count === 0, count };
}
