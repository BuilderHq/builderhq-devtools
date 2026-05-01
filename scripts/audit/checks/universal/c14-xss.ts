// ─── CHECK 14 — XSS Vulnerability Scan ───────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue, isInsideTemplateLiteral } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check14_xss(config: AuditConfig): CheckResult {
  const label = "XSS Vulnerability Scan";
  let count = 0;

  const files = getAllFiles(config.paths.rootDir, [".ts", ".tsx", ".js", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    // Skip audit engine files — they contain XSS/eval patterns as string literals in check definitions
    if (rel.includes('scripts/audit/')) continue;
    const src = readFile(file);
    const lines = src.split("\n");

    // dangerouslySetInnerHTML with dynamic content
    const dangerRe = /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = dangerRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      // Check if the value is a static string (safe) or dynamic (unsafe)
      const surrounding = src.slice(m.index, m.index + 300);
      const isStaticString = /:\s*["'`][^"'`]*["'`]/.test(surrounding);
      if (isStaticString) continue;
      // ── SAFE PATTERN: CSS-only dangerouslySetInnerHTML (shadcn/ui chart, styled components)
      // Detect when the element is a <style> tag and content is CSS variables/rules only.
      // Look back 200 chars for a <style tag context.
      const lookback = src.slice(Math.max(0, m.index - 200), m.index);
      const isCssStyleTag = /<style[^>]*>\s*$/.test(lookback.trimEnd()) ||
                            lookback.includes("<style") ||
                            // Also check if the surrounding content only generates CSS (--color-, px, %, etc.)
                            /--[\w-]+\s*:/.test(surrounding);
      if (isCssStyleTag) {
        // Still flag as WARNING (CSS injection is lower risk but not zero risk)
        addIssue("WARNING", 14, rel, lineNum,
          `dangerouslySetInnerHTML on a <style> element — CSS injection risk is low but verify content is not user-controlled. This is a known shadcn/ui chart pattern.`,
          config);
        count++;
        continue;
      }
      addIssue("CRITICAL", 14, rel, lineNum,
        `dangerouslySetInnerHTML with dynamic content — potential XSS vulnerability. Sanitize with DOMPurify before rendering.`,
        config);
      count++;
    }

    // Direct innerHTML assignment
    const innerHtmlRe = /\.innerHTML\s*=/g;
    while ((m = innerHtmlRe.exec(src)) !== null) {
      if (isInsideTemplateLiteral(src, m.index)) continue;
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;
      // Skip if assigning empty string or static string
      if (/\.innerHTML\s*=\s*["'`][^"'`]*["'`]/.test(line) ||
          /\.innerHTML\s*=\s*""/.test(line) ||
          /\.innerHTML\s*=\s*''/.test(line)) continue;

      addIssue("WARNING", 14, rel, lineNum,
        `Direct .innerHTML assignment — potential XSS if content is user-controlled. Use textContent or sanitize first.`,
        config);
      count++;
    }

    // eval() usage
    const evalRe = /\beval\s*\(/g;
    while ((m = evalRe.exec(src)) !== null) {
      if (isInsideTemplateLiteral(src, m.index)) continue;
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;

      addIssue("CRITICAL", 14, rel, lineNum,
        `eval() detected — never use eval() with user-supplied input. Use JSON.parse() or Function() alternatives.`,
        config);
      count++;
    }

    // document.write()
    const docWriteRe = /document\.write\s*\(/g;
    while ((m = docWriteRe.exec(src)) !== null) {
      if (isInsideTemplateLiteral(src, m.index)) continue;
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;

      addIssue("WARNING", 14, rel, lineNum,
        `document.write() detected — deprecated and XSS-prone. Use DOM manipulation methods instead.`,
        config);
      count++;
    }
  }

  return { check: 14, label, passed: count === 0, count };
}
