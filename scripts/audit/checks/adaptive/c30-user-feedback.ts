// ─── CHECK 30 — Missing User Feedback on Mutations ───────────────────────────
// Mutations that complete with no toast, alert, or notification leave users
// uncertain whether their action worked — causing repeat clicks and confusion.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check30_userFeedback(config: AuditConfig): CheckResult {
  const label = "Missing User Feedback on Mutations";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 30, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx", ".ts"]);
  const mutationHooks = config.patterns.mutationHooks;

  // Patterns that indicate user feedback is being shown
  const feedbackPatterns = [
    /toast\s*\(/i,
    /Toast\s*\(/,
    /notification\s*\(/i,
    /Notification\s*\(/,
    /alert\s*\(/,
    /sonner/i,
    /react-hot-toast/i,
    /useToast/i,
    /addToast/i,
    /showToast/i,
    /enqueueSnackbar/i,
    /message\.success|message\.error/,  // Ant Design
    /notify\s*\(/i,
    /onSuccess\s*:/,  // mutation onSuccess callback
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    const mutationRe = new RegExp(`\\b(${mutationHooks.join("|")})\\s*\\(`, "g");
    let m: RegExpExecArray | null;

    while ((m = mutationRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("*")) continue;

      // Check if the file has any feedback mechanism
      const hasFeedback = feedbackPatterns.some(re => re.test(src));
      if (hasFeedback) continue;

      // Check if it's a fire-and-forget mutation (background sync, analytics etc)
      const surrounding = src.slice(Math.max(0, m.index - 100), m.index + 200);
      if (/analytics|tracking|log|telemetry|background|sync/i.test(surrounding)) continue;

      addIssue("WARNING", 30, rel, lineNum,
        `${m[1]}() has no success/error feedback (toast, notification) — users won't know if their action worked`,
        config);
      count++;
      break; // One warning per file is enough — don't flood the report
    }
  }

  return { check: 30, label, passed: count === 0, count };
}
