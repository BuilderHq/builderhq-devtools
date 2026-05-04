// ─── UNIVERSAL AUDITOR — UTILS ────────────────────────────────────────────────
import * as fs from "fs";
import * as path from "path";
import type { Issue, Severity, AuditConfig, SuppressionRule } from "./types.js";

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────

export const issues: Issue[] = [];

export function addIssue(
  severity: Severity,
  check: number,
  file: string,
  line: number,
  message: string,
  config?: AuditConfig
): void {
  // Check suppressions
  if (config) {
    for (const rule of config.suppressions) {
      if (rule.check !== check) continue;
      if (rule.file && !file.includes(rule.file)) continue;
      // Suppressed — log as INFO instead
      issues.push({ severity: "INFO", check, file, line, message: `[SUPPRESSED] ${message} — ${rule.reason}` });
      return;
    }
  }
  issues.push({ severity, check, file, line, message });
}

export function clearIssues(): void {
  issues.length = 0;
}

export function getIssues(): Issue[] {
  return [...issues];
}

// ─── FILE SYSTEM ──────────────────────────────────────────────────────────────

export function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function relPath(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath);
}

const ALWAYS_EXCLUDE = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".turbo",
  ".cache", "coverage", ".nyc_output", "out", ".svelte-kit",
  ".nuxt", ".output", "storybook-static", ".manus-logs",
  "__pycache__", ".pytest_cache",
]);

export function getAllFiles(
  dir: string,
  extensions: string[],
  extraExclude: string[] = []
): string[] {
  const results: string[] = [];
  const excludeSet = new Set([...ALWAYS_EXCLUDE, ...extraExclude]);

  function walk(current: string): void {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeSet.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

export function getAllSourceFiles(config: AuditConfig, extensions: string[]): string[] {
  const files: string[] = [];
  for (const dir of config.paths.allSourceDirs) {
    if (fs.existsSync(dir)) {
      files.push(...getAllFiles(dir, extensions, config.paths.excludeDirs));
    }
  }
  return [...new Set(files)]; // deduplicate
}

// ─── TEMPLATE LITERAL PARSER ──────────────────────────────────────────────────
// Determines if a given character position in source code is inside a template literal.
// Handles: nested template literals, escaped backticks (\`), string literals, comments.

export function isInsideTemplateLiteral(src: string, pos: number): boolean {
  let inTemplateLiteral = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let templateDepth = 0;

  let i = 0;
  while (i < pos) {
    const ch = src[i];
    const next = src[i + 1] || "";

    // Handle escape sequences — skip the next character
    if (ch === "\\" && (inTemplateLiteral || inSingleQuote || inDoubleQuote)) {
      i += 2;
      continue;
    }

    // Line comment
    if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral && !inBlockComment) {
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 2;
        continue;
      }
    }
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }

    // Block comment
    if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral && !inLineComment) {
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Single-quoted string
    if (!inDoubleQuote && !inTemplateLiteral && ch === "'") {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }
    if (inSingleQuote) { i++; continue; }

    // Double-quoted string
    if (!inSingleQuote && !inTemplateLiteral && ch === "\"") {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }
    if (inDoubleQuote) { i++; continue; }

    // Template literal
    if (ch === "`") {
      if (inTemplateLiteral) {
        templateDepth--;
        if (templateDepth === 0) inTemplateLiteral = false;
      } else {
        inTemplateLiteral = true;
        templateDepth++;
      }
      i++;
      continue;
    }

    i++;
  }

  return inTemplateLiteral;
}

// ─── BLOCK COMMENT DETECTOR ─────────────────────────────────────────────────
// Determines if a given character position is inside a /* ... */ block comment.
// Used to skip documentation examples that contain code patterns.

export function isInsideBlockComment(src: string, pos: number): boolean {
  let i = 0;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateLiteral = false;

  while (i < pos) {
    const ch = src[i];
    const next = src[i + 1] || "";

    // Handle escape sequences
    if (ch === "\\" && (inSingleQuote || inDoubleQuote || inTemplateLiteral)) {
      i += 2;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral) {
      if (!inBlockComment && ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (inBlockComment && ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      if (inBlockComment) { i++; continue; }

      // Skip line comments
      if (ch === "/" && next === "/") {
        while (i < pos && src[i] !== "\n") i++;
        continue;
      }

      if (ch === "'") { inSingleQuote = true; i++; continue; }
      if (ch === '"') { inDoubleQuote = true; i++; continue; }
      if (ch === "`") { inTemplateLiteral = true; i++; continue; }
    } else if (inSingleQuote && ch === "'") {
      inSingleQuote = false; i++; continue;
    } else if (inDoubleQuote && ch === '"') {
      inDoubleQuote = false; i++; continue;
    } else if (inTemplateLiteral && ch === "`") {
      inTemplateLiteral = false; i++; continue;
    }

    i++;
  }

  return inBlockComment;
}

// ─── TYPESCRIPT TYPE RANGE DETECTOR ─────────────────────────────────────────────
// Returns line number ranges that are inside TypeScript type/interface definitions.
// Used to prevent false positives in duplicate key and schema checks.

export interface LineRange { start: number; end: number; }

export function getTsTypeRanges(src: string): LineRange[] {
  const ranges: LineRange[] = [];
  const lines = src.split("\n");

  // Patterns that open a TS type scope
  const typeOpenRe = /^\s*(export\s+)?(type|interface)\s+\w+.*\{|^\s*(export\s+)?(?:const|let|var)\s+\w+\s*:\s*\{/;
  // Also catch function parameter type annotations: (param: { key: Type }) =>
  const paramTypeRe = /\(\s*\w+\s*:\s*\{/;

  let depth = 0;
  let startLine = -1;
  let inTypeScope = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inTypeScope) {
      if (typeOpenRe.test(line) || paramTypeRe.test(line)) {
        inTypeScope = true;
        startLine = i + 1;
        depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (depth <= 0) {
          // Single-line type definition
          ranges.push({ start: startLine, end: i + 1 });
          inTypeScope = false;
          depth = 0;
        }
      }
    } else {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (depth <= 0) {
        ranges.push({ start: startLine, end: i + 1 });
        inTypeScope = false;
        depth = 0;
      }
    }
  }

  return ranges;
}

export function isInTsTypeRange(lineNum: number, ranges: LineRange[]): boolean {
  return ranges.some(r => lineNum >= r.start && lineNum <= r.end);
}

// ─── PACKAGE.JSON READER ──────────────────────────────────────────────────────

export function readPackageJson(rootDir: string): Record<string, unknown> {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fileExists(pkgPath)) return {};
  try {
    return JSON.parse(readFile(pkgPath));
  } catch {
    return {};
  }
}

export function getDeps(pkg: Record<string, unknown>): Set<string> {
  const deps = new Set<string>();
  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = pkg[key] as Record<string, string> | undefined;
    if (section) Object.keys(section).forEach(d => deps.add(d));
  }
  return deps;
}

// ─── TSCONFIG PATH ALIAS READER ───────────────────────────────────────────────

export function readPathAliases(rootDir: string): Record<string, string> {
  const aliases: Record<string, string> = {};

  // Try tsconfig.json, tsconfig.app.json, tsconfig.base.json
  const candidates = ["tsconfig.json", "tsconfig.app.json", "tsconfig.base.json"];
  for (const candidate of candidates) {
    const tscPath = path.join(rootDir, candidate);
    if (!fileExists(tscPath)) continue;
    try {
      // Strip comments from tsconfig (it's JSON5-ish)
      const raw = readFile(tscPath).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const tsconfig = JSON.parse(raw);
      const paths = tsconfig?.compilerOptions?.paths || {};
      for (const [alias, targets] of Object.entries(paths)) {
        const cleanAlias = alias.replace(/\/\*$/, "");
        const target = (targets as string[])[0]?.replace(/\/\*$/, "") || "";
        aliases[cleanAlias] = path.resolve(rootDir, target);
      }
      break;
    } catch {
      // continue
    }
  }

  // Also check vite.config.ts for resolve.alias
  const viteConfig = readFile(path.join(rootDir, "vite.config.ts")) ||
                     readFile(path.join(rootDir, "vite.config.js"));
  const viteAliasRe = /["'](@[^"']+)["']\s*:\s*(?:path\.resolve|resolve)\s*\([^,)]+,\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = viteAliasRe.exec(viteConfig)) !== null) {
    aliases[m[1]] = path.resolve(rootDir, m[2]);
  }

  return aliases;
}

// ─── INTENTIONAL COMMENT DETECTOR ────────────────────────────────────────────
// Checks if the N lines before a given line number contain an explanatory comment.

const INTENTIONAL_PATTERNS = [
  /intentional/i, /tRPC cannot/i, /multipart/i, /form.?data/i,
  /external api/i, /third.?party/i, /direct upload/i, /binary stream/i,
  /webhook/i, /server.?sent event/i, /SSE/i, /streaming/i,
];

export function hasIntentionalComment(lines: string[], lineNum: number, lookback = 3): boolean {
  const start = Math.max(0, lineNum - 1 - lookback);
  const end = lineNum - 1;
  const context = lines.slice(start, end).join(" ");
  return INTENTIONAL_PATTERNS.some(re => re.test(context));
}

// ─── LINE COMMENT DETECTOR ───────────────────────────────────────────────────
// Returns true if the given position is inside a single-line // comment.
export function isInsideLineComment(src: string, pos: number): boolean {
  // Find the start of the line
  const lineStart = src.lastIndexOf("\n", pos - 1) + 1;
  const lineUpToPos = src.slice(lineStart, pos);
  // Check if there's a // before pos on the same line (not inside a string)
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < lineUpToPos.length - 1; i++) {
    const ch = lineUpToPos[i];
    const next = lineUpToPos[i + 1];
    if (ch === "\\" && (inSingle || inDouble)) { i++; continue; }
    if (!inSingle && !inDouble) {
      if (ch === "/" && next === "/") return true;
      if (ch === "'") { inSingle = true; continue; }
      if (ch === '"') { inDouble = true; continue; }
    } else if (inSingle && ch === "'") { inSingle = false; }
    else if (inDouble && ch === '"') { inDouble = false; }
  }
  return false;
}
