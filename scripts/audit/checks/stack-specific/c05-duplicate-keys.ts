// ─── CHECK 05 — Duplicate Object Keys ────────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue, getTsTypeRanges, isInTsTypeRange } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check05_duplicateKeys(config: AuditConfig): CheckResult {
  const label = "Duplicate Object Keys";
  let count = 0;

  const files = getAllFiles(config.paths.rootDir, [".ts", ".tsx", ".js", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Pre-compute TypeScript type ranges to exclude
    const tsTypeRanges = getTsTypeRanges(src);

    // Track object literal scopes using brace depth
    // We scan line by line and track key declarations within each object scope
    const keyStack: Map<string, number>[] = []; // stack of {keyName -> lineNum} maps
    let inObjectLiteral = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip lines inside TypeScript type definitions
      if (isInTsTypeRange(lineNum, tsTypeRanges)) continue;

      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

      // ── CRITICAL FIX: Process key detection BEFORE brace counting.
      // If we count braces first, a line like 'body: JSON.stringify({' will push a new scope
      // for the '{', and then 'body' will be assigned to that inner scope instead of the outer.
      // By checking the key first (using the scope BEFORE any new braces on this line),
      // we correctly assign 'body' to the outer scope.

      // Simpler, more reliable approach: match runtime value assignments
      // key: someValue, (where value is not a TypeScript type)
      const runtimeKeyRe = /^\s{0,8}(\w+)\s*:\s*(?:["'`\d\[\{]|(?:true|false|null|undefined|new\s|async\s|\([^)]*\)\s*=>|\w+\s*(?:\(|=>|\[|\.|,|\))))/;

      const keyMatch = runtimeKeyRe.exec(line);
      const keyName = keyMatch?.[1];

      // Check key BEFORE updating brace counts (correct scope assignment)
      if (keyName) {
        // Skip function parameter declarations: 'paramName: TypeAnnotation = default'
        // These look like 'options: { ... } = {}' which matches the key pattern
        // but are NOT object literal keys — they're TypeScript function parameters.
        // Detect: key followed by a TypeScript type annotation (contains ?, |, <, or ends with = {})
        const isTypescriptParam = /^\s{0,8}\w+\s*:\s*(?:\{[^}]*\}|\w+(?:[<|?][\w<>|?\s,]*)?|\[[^\]]*\])\s*=/.test(line);
        if (isTypescriptParam) {
          // Still count braces for this line
          for (const ch of line) {
            if (ch === "{") keyStack.push(new Map());
            else if (ch === "}") keyStack.pop();
          }
          continue;
        }
        // Skip TypeScript keywords that look like keys
        const isKeyword = ["type", "interface", "class", "enum", "namespace", "module",
             "import", "export", "return", "const", "let", "var", "function",
             "if", "else", "for", "while", "switch", "case", "default",
             "try", "catch", "finally", "throw", "new", "delete", "typeof",
             "instanceof", "in", "of", "from", "as", "extends", "implements",
             "public", "private", "protected", "static", "readonly", "abstract",
             "override", "declare", "async", "await", "yield"].includes(keyName);

        if (!isKeyword) {
          const currentScope = keyStack[keyStack.length - 1];
          if (currentScope) {
            if (currentScope.has(keyName)) {
              const firstLine = currentScope.get(keyName)!;
              addIssue("WARNING", 5, rel, lineNum,
                `Duplicate object key "${keyName}" — first declared at line ${firstLine}, redeclared here. JavaScript silently discards the first value.`,
                config);
              count++;
            } else {
              currentScope.set(keyName, lineNum);
            }
          }
        }
      }

      // Count braces AFTER key detection (so key is in the correct outer scope)
      for (const ch of line) {
        if (ch === "{") {
          keyStack.push(new Map());
        } else if (ch === "}") {
          keyStack.pop();
        }
      }
    }
  }

  return { check: 5, label, passed: count === 0, count };
}
