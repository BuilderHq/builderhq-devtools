// ─── CHECK 28 — Hardcoded Colours Outside Design System ──────────────────────
// Inline hex/rgb colours bypass the design system — leading to inconsistent UI,
// impossible dark mode support, and brand drift across the product.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check28_hardcodedColours(config: AuditConfig): CheckResult {
  const label = "Hardcoded Colours Outside Design System";
  let count = 0;

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx", ".ts", ".css", ".scss"]);

  const colourPatterns = [
    { re: /style\s*=\s*\{\{[^}]*(?:color|background(?:Color)?|borderColor|fill|stroke)\s*:\s*["']#[0-9a-fA-F]{3,8}["']/g, label: "hex colour in inline style" },
    { re: /style\s*=\s*\{\{[^}]*(?:color|background(?:Color)?|borderColor)\s*:\s*["']rgb(?:a)?\s*\([^)]+\)["']/g, label: "rgb colour in inline style" },
  ];

  // Legitimate files where hardcoded colours are expected
  const legitimateFiles = [
    ".config.", "tailwind", "theme", "tokens", "colors", "colours",
    ".test.", ".spec.", "storybook", ".stories."
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    for (const { re, label: colLabel } of colourPatterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const lineNum = src.slice(0, m.index).split("\n").length;
        const line = lines[lineNum - 1]?.trim() || "";
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
        if (line.includes("// design-system-override")) continue;

        addIssue("WARNING", 28, rel, lineNum,
          `${colLabel} found — use Tailwind classes or CSS variables from the design system instead`,
          config);
        count++;
      }
    }
  }

  return { check: 28, label, passed: count === 0, count };
}
