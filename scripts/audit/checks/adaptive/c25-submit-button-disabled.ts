// ─── CHECK 25 — Submit Buttons Not Disabled During Submission ────────────────
// A submit button that stays enabled during an async operation allows users to
// double-submit forms — creating duplicate records, duplicate payments, etc.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check25_submitButtonDisabled(config: AuditConfig): CheckResult {
  const label = "Submit Buttons Not Disabled During Submission";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 25, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Find <button type="submit" or <button onClick={handleSubmit style patterns
    // that don't have a disabled prop
    const submitButtonRe = /<button\b([^>]*?)>/g;
    let m: RegExpExecArray | null;

    while ((m = submitButtonRe.exec(src)) !== null) {
      const attrs = m[1];
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";

      // Skip comments
      if (line.startsWith("//") || line.startsWith("{/*")) continue;

      // Only care about submit buttons or buttons with submit-like onClick
      const isSubmitButton =
        /type\s*=\s*["']submit["']/.test(attrs) ||
        /onClick\s*=\s*\{[^}]*(?:submit|save|create|update|delete|confirm|pay|send)\b/i.test(attrs);

      if (!isSubmitButton) continue;

      // Check if disabled prop is present
      const hasDisabled = /\bdisabled\b/.test(attrs);
      if (hasDisabled) continue;

      // Check if the file has any loading/pending state that could be used
      const hasLoadingState = /isLoading|isPending|isSubmitting|loading|submitting/i.test(src);

      if (hasLoadingState) {
        // There IS a loading state in the file but it's not applied to this button
        addIssue("CRITICAL", 25, rel, lineNum,
          `Submit button has no disabled={isLoading/isPending} — allows double-submission while async operation is in progress`,
          config);
        count++;
      }
    }
  }

  return { check: 25, label, passed: count === 0, count };
}
