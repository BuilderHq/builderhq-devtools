// ─── CHECK 04 — Broken Import Paths ──────────────────────────────────────────
import * as fs from "fs";
import * as path from "path";
import { getAllFiles, readFile, relPath, addIssue, fileExists, isInsideBlockComment, isInsideTemplateLiteral } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check04_brokenImports(config: AuditConfig): CheckResult {
  const label = "Broken Import Paths";
  let count = 0;

  const { paths } = config;
  const files = getAllFiles(paths.rootDir, [".ts", ".tsx", ".js", ".jsx"]);

  // Extensions to try when resolving imports
  const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

  function resolveImport(importPath: string, fromFile: string): boolean {
    // Skip package imports (no leading . or /)
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      // Check if it's a path alias — sort by length descending so @shared matches before @
      const sortedAliases = Object.entries(paths.pathAliases)
        .sort(([a], [b]) => b.length - a.length);
      const aliasMatch = sortedAliases.find(([alias]) =>
        importPath === alias || importPath.startsWith(alias + "/")
      );
      if (!aliasMatch) return true; // Assume package imports are valid

      const [alias, aliasTarget] = aliasMatch;
      const resolvedPath = importPath.replace(alias, aliasTarget);
      return resolveLocalPath(resolvedPath, fromFile);
    }

    // Relative import
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);
    return resolveLocalPath(resolved, fromFile);
  }

  function resolveLocalPath(resolved: string, fromFile: string): boolean {
    // Try exact path first
    if (fileExists(resolved)) return true;

    // Try with extensions
    for (const ext of RESOLVE_EXTENSIONS) {
      if (fileExists(resolved + ext)) return true;
    }
    // ESM TypeScript: import "../../utils.js" is valid when utils.ts exists on disk
    if (resolved.endsWith(".js")) {
      const tsPath = resolved.slice(0, -3) + ".ts";
      if (fileExists(tsPath)) return true;
      const tsxPath = resolved.slice(0, -3) + ".tsx";
      if (fileExists(tsxPath)) return true;
    }

    return false;
  }

  for (const file of files) {
    const rel = relPath(file, paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Match: import ... from "path" and require("path")
    const importRe = /(?:import\s+.*?\s+from\s+|require\s*\(\s*)["'`]([^"'`]+)["'`]/g;
    let m: RegExpExecArray | null;

    while ((m = importRe.exec(src)) !== null) {
      const importPath = m[1];
      const lineNum0 = src.slice(0, m.index).split("\n").length;

      // Skip imports inside block comments or JSDoc code blocks
      if (isInsideBlockComment(src, m.index)) continue;
      if (isInsideTemplateLiteral(src, m.index)) continue;

      // Skip: node builtins, URLs, data URIs, virtual modules
      if (importPath.startsWith("node:") ||
          importPath.startsWith("http") ||
          importPath.startsWith("data:") ||
          importPath.startsWith("virtual:") ||
          importPath.startsWith("~") ||
          importPath === "") continue;

      // Skip: known package patterns (scoped packages, simple names)
      if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
        // Check if it's a registered alias — must match exactly or be followed by /
        // This prevents "@" alias from matching "@radix-ui/react-accordion"
        const isAlias = Object.keys(paths.pathAliases).some(alias =>
          importPath === alias ||
          importPath.startsWith(alias + "/")
        );
        if (!isAlias) continue; // Skip non-alias package imports
      }

      if (!resolveImport(importPath, file)) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        addIssue("CRITICAL", 4, rel, lineNum,
          `Broken import: "${importPath}" — file not found. Check path and extension.`,
          config);
        count++;
      }
    }
  }

  return { check: 4, label, passed: count === 0, count };
}
