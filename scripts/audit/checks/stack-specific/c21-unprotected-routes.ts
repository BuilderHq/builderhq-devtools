// ─── CHECK 21 — Unprotected Sensitive Express Routes ─────────────────────────
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check21_unprotectedRoutes(config: AuditConfig): CheckResult {
  const label = "Unprotected Sensitive Express Routes";
  let count = 0;

  const { paths, patterns } = config;
  const serverFiles = getAllFiles(paths.serverSrc, [".ts", ".js"]);

  // Sensitive route path patterns that must have auth middleware
  const SENSITIVE_ROUTE_PATTERNS = [
    /\/admin/i, /\/delete/i, /\/remove/i,
    /\/update/i, /\/edit/i, /\/create/i,
    /\/upload/i, /\/import/i, /\/export/i,
    /\/users/i, /\/clients/i, /\/billing/i,
    /\/payment/i, /\/invoice/i, /\/webhook/i,
    /\/seed/i, /\/reset/i, /\/migrate/i,
  ];

  // Auth middleware patterns — configurable via config
  const AUTH_PATTERNS = [
    ...(patterns.authProcedures || []).map(name => new RegExp(`\\b${name}\\b`)),
    /authenticateRequest/,
    /verifyToken/,
    /requireAuth/,
    /isAuthenticated/,
    /checkAuth/,
    /authMiddleware/,
    /bearerAuth/,
    /jwtAuth/,
    /sdk\.authenticateRequest/,
    /passport\.authenticate/,
    /session\s*\(/,
    // Webhook signature verification patterns (intentionally public but cryptographically secured)
    /constructEvent/,           // Stripe webhook signature verification
    /verifyXeroWebhookSignature/, // Xero webhook HMAC verification
    /webhooks\.constructEvent/,
    /stripe-signature/,
    /x-xero-signature/,
    /webhook.*signature/i,
    /signature.*webhook/i,
    /HMAC/,
    /hmac/,
  ];

  for (const file of serverFiles) {
    const rel = relPath(file, paths.rootDir);
    const src = readFile(file);
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Match Express route declarations: app.get/post/put/delete/patch("/path", ...)
      const routeRe = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/;
      const routeMatch = routeRe.exec(line);
      if (!routeMatch) continue;

      const method = routeMatch[1].toUpperCase();
      const routePath = routeMatch[2];

      // Check if the route path is sensitive
      const isSensitive = SENSITIVE_ROUTE_PATTERNS.some(re => re.test(routePath));
      if (!isSensitive) continue;

      // Look at the full route handler (this line + next 3 lines) for auth middleware
      const context = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      const hasAuth = AUTH_PATTERNS.some(re => re.test(context));

      if (!hasAuth) {
        addIssue("WARNING", 21, rel, lineNum,
          `${method} ${routePath} — sensitive route has no auth middleware. Add authentication before the handler.`,
          config);
        count++;
      }
    }
  }

  return { check: 21, label, passed: count === 0, count };
}
