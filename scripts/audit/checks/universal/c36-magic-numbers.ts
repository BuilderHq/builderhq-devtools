// ─── CHECK 36 — Magic Numbers in UI Layout ────────────────────────────────────
// Hardcoded layout numbers like width: 847 or height: 312 are not part of any
// design system — they make UI inconsistent and impossible to maintain.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

// Common "magic" numbers that indicate arbitrary sizing
const MAGIC_NUMBER_RE = /style\s*=\s*\{\{[^}]*(?:width|height|maxWidth|minWidth|maxHeight|minHeight|margin|padding)\s*:\s*(\d{3,})/g;

// Acceptable round numbers (multiples of 8 or 16 — design system grid)
function isGridAligned(n: number): boolean {
  return n % 8 === 0 || n % 16 === 0 || n % 4 === 0;
}

export function check36_magicNumbers(config: AuditConfig): CheckResult {
  const label = "Magic Numbers in UI Layout";
  let count = 0;

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  const legitimateFiles = [
    ".test.", ".spec.", ".stories.", "chart", "canvas", "graph",
    "animation", "transition", "image", "icon"
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    MAGIC_NUMBER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = MAGIC_NUMBER_RE.exec(src)) !== null) {
      const value = parseInt(m[1]);
      if (isGridAligned(value)) continue; // Grid-aligned numbers are fine

      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("{/*")) continue;
      if (line.includes("// design-token")) continue;

      addIssue("INFO", 36, rel, lineNum,
        `Magic number ${value}px in layout — extract to a named constant or use Tailwind spacing scale`,
        config);
      count++;
    }
  }

  return { check: 36, label, passed: count === 0, count };
}
