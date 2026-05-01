// ─── CHECK 12 — Auth Guard Audit ─────────────────────────────────────────────
import { getAllFiles, readFile, relPath, addIssue, fileExists } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check12_authGuards(config: AuditConfig): CheckResult {
  const label = "Auth Guard Audit";
  let count = 0;

  if (!config.stack.hasTrpc) {
    return { check: 12, label, passed: true, count: 0, skipped: true, skipReason: "tRPC not detected" };
  }

  if (!config.paths.routersFile || !fileExists(config.paths.routersFile)) {
    return { check: 12, label, passed: true, count: 0, skipped: true, skipReason: "Routers file not found" };
  }

  const src = readFile(config.paths.routersFile);
  const lines = src.split("\n");

  // Sensitive procedure name patterns that should NEVER be on publicProcedure
  // These patterns match operations that require authentication by their nature.
  // Note: 'create', 'add', 'insert' are intentionally excluded because public forms
  // (contact forms, lead capture, registration) legitimately use publicProcedure.
  const SENSITIVE_PATTERNS = [
    /delete/i, /remove/i, /destroy/i,
    /update/i, /edit/i, /modify/i,
    /admin/i, /manage/i,
    /listAll/i, /getAll/i, /export/i,
    /approve/i, /reject/i,
    /billing/i, /invoice/i,
    /secret/i,
    /upload/i,
  ];

  // Detect the public procedure name — anything that is NOT in the auth procedures list
  // Default to 'publicProcedure' if not overridden
  const publicProcName = "publicProcedure";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Find: procedureName: publicProcedure.input(...).mutation/query
    const publicProcRe = new RegExp(`(\\w+)\\s*:\\s*${publicProcName}\\s*\\.`);
    const match = publicProcRe.exec(line);
    if (!match) continue;

    const procedureName = match[1];

    // Skip known safe public procedures — these are legitimately accessible without auth
    if (["login", "register", "signup", "forgotPassword", "resetPassword",
         "verifyEmail", "health", "ping", "status", "publicInfo",
         "getPublicData", "listPublic", "demo", "webhook",
         // Auth procedures that must be public by design
         "loginWithPassword", "loginWithOAuth", "loginWithToken", "loginWithMagicLink",
         "logout", "refreshToken", "exchangeToken", "oauthCallback",
         // Public data entry points (e.g. contact forms, lead capture)
         "create", "submit", "contact", "enquiry", "subscribe",
         // Public read endpoints
         "list", "get", "fetch", "search", "find", "lookup",
         "getConfig", "getSettings", "getFeatures", "getPricing",
         // Webhook and callback handlers
         "stripeWebhook", "xeroWebhook", "paymentCallback",
         ].includes(procedureName)) continue;

    // Check if the procedure name matches any sensitive patterns
    // Note: 'create', 'add', 'insert' removed from patterns since they can be legitimately public
    // (e.g. contact form, lead capture, public registration)
    const isSensitive = SENSITIVE_PATTERNS.some(re => re.test(procedureName));

    if (isSensitive) {
      addIssue("CRITICAL", 12, relPath(config.paths.routersFile, config.paths.rootDir), lineNum,
        `"${procedureName}" is exposed via ${publicProcName} — this is a sensitive operation that should require authentication. Change to protectedProcedure or adminProcedure.`,
        config);
      count++;
    }
  }

  return { check: 12, label, passed: count === 0, count };
}
