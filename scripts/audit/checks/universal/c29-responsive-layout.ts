// ─── CHECK 29 — Fixed Pixel Widths Breaking Responsive Layout ────────────────
// Hardcoded pixel widths on layout containers break mobile views — the #1
// cause of "looks fine on my screen" demo failures on client devices.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check29_responsiveLayout(config: AuditConfig): CheckResult {
  const label = "Fixed Pixel Widths Breaking Responsive Layout";
  let count = 0;

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  // Legitimate uses of fixed pixel widths (images, icons, avatars, charts)
  const legitimateContexts = [
    /width\s*:\s*\d+px[^;]*\/\/ (icon|avatar|image|chart|logo|thumbnail)/i,
  ];

  const fixedWidthRe = /style\s*=\s*\{\{[^}]*\bwidth\s*:\s*["']?\d{3,}px["']?/g;

  const legitimateFiles = [
    ".test.", ".spec.", ".stories.", "storybook", "chart", "graph",
    "canvas", "image", "icon", "avatar", "logo"
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    if (legitimateFiles.some(lf => rel.toLowerCase().includes(lf))) continue;

    const src = readFile(file);
    const lines = src.split("\n");

    fixedWidthRe.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = fixedWidthRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";

      if (line.startsWith("//") || line.startsWith("{/*")) continue;
      if (line.includes("// responsive-override")) continue;

      // Skip if it's clearly an image/icon context
      const context = src.slice(Math.max(0, m.index - 100), m.index + 100);
      if (/img|image|icon|avatar|logo|thumbnail|chart|canvas/i.test(context)) continue;

      // Extract the pixel value
      const pxMatch = m[0].match(/width\s*:\s*["']?(\d+)px/);
      const pxValue = pxMatch ? parseInt(pxMatch[1]) : 0;

      // Only flag widths over 200px on layout elements (smaller ones are likely icons)
      if (pxValue < 200) continue;

      addIssue("WARNING", 29, rel, lineNum,
        `Fixed width: ${pxValue}px on layout element — will overflow or break on mobile screens`,
        config);
      count++;
    }
  }

  return { check: 29, label, passed: count === 0, count };
}
