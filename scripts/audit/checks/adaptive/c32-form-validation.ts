// ─── CHECK 32 — Missing Form Validation Feedback ─────────────────────────────
// Forms that submit without client-side validation or show no field-level errors
// frustrate users — they don't know what went wrong or what to fix.
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check32_formValidation(config: AuditConfig): CheckResult {
  const label = "Missing Form Validation Feedback";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 32, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  const files = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx"]);

  // Patterns that indicate proper form validation is in place
  const validationPatterns = [
    /react-hook-form/i,
    /useForm\s*\(/,
    /register\s*\(/,        // react-hook-form register
    /formik/i,
    /useFormik/i,
    /errors\.\w+/,          // error object access
    /fieldState/,           // react-hook-form fieldState
    /formState/,            // react-hook-form formState
    /zodResolver/,
    /yupResolver/,
    /\.errors\b/,
    /error\s*&&\s*<p/,      // inline error message pattern
    /error\s*&&\s*<span/,
    /helperText/,           // MUI pattern
    /errorMessage/i,
  ];

  for (const file of files) {
    const rel = relPath(file, config.paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    // Find form elements with onSubmit
    const formRe = /<form\b[^>]*onSubmit\s*=/g;
    let m: RegExpExecArray | null;

    while ((m = formRe.exec(src)) !== null) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      if (line.startsWith("//") || line.startsWith("{/*")) continue;

      // Check if the file has any validation mechanism
      const hasValidation = validationPatterns.some(re => re.test(src));
      if (hasValidation) continue;

      // Check if there are multiple inputs (single-field forms often don't need validation UI)
      const inputCount = (src.match(/<input\b/g) || []).length;
      if (inputCount < 2) continue;

      addIssue("WARNING", 32, rel, lineNum,
        `<form> with ${inputCount} inputs has no validation library or field-level error display — users won't know what to fix on submission failure`,
        config);
      count++;
    }
  }

  return { check: 32, label, passed: count === 0, count };
}
