// ─── CHECK 11 — Required Env Var Coverage ────────────────────────────────────
import * as path from "path";
import { getAllFiles, readFile, relPath, addIssue, fileExists } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check11_envCoverage(config: AuditConfig): CheckResult {
  const label = "Required Env Var Coverage";
  let count = 0;

  const { paths, patterns } = config;

  // ── Step 1: Collect all env vars referenced in the codebase ──────────────
  const referencedEnvVars = new Set<string>();

  // Server-side: process.env.VAR_NAME
  const serverFiles = getAllFiles(paths.serverSrc, [".ts", ".js", ".mjs"]);
  for (const file of serverFiles) {
    const src = readFile(file);
    const processEnvRe = /process\.env\.([A-Z][A-Z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = processEnvRe.exec(src)) !== null) {
      referencedEnvVars.add(m[1]);
    }
  }

  // Client-side: import.meta.env.VITE_VAR or process.env.NEXT_PUBLIC_VAR
  const clientFiles = getAllFiles(paths.clientSrc, [".ts", ".tsx", ".js", ".jsx"]);
  for (const file of clientFiles) {
    const src = readFile(file);

    // Vite pattern
    const viteEnvRe = /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = viteEnvRe.exec(src)) !== null) {
      referencedEnvVars.add(m[1]);
    }

    // Next.js pattern
    const nextEnvRe = /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g;
    while ((m = nextEnvRe.exec(src)) !== null) {
      referencedEnvVars.add(m[1]);
    }
  }

  // ── Step 2: Collect env vars that are properly declared/validated ─────────
  const declaredEnvVars = new Set<string>();

  // Check env.ts / env.mjs (t3-env, custom env validators)
  if (paths.envFile && fileExists(paths.envFile)) {
    const envSrc = readFile(paths.envFile);
    let m: RegExpExecArray | null;

    // Pattern 1: SCREAMING_SNAKE_CASE key in object literal (t3-env style)
    // DATABASE_URL: z.string() or DATABASE_URL: process.env.DATABASE_URL
    const declaredRe = /([A-Z][A-Z0-9_]+)\s*:/g;
    while ((m = declaredRe.exec(envSrc)) !== null) {
      declaredEnvVars.add(m[1]);
    }

    // Pattern 2: requireEnv("VAR_NAME") — custom wrapper functions
    // Handles: cookieSecret: requireEnv("JWT_SECRET")
    const requireEnvRe = /requireEnv\s*\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g;
    while ((m = requireEnvRe.exec(envSrc)) !== null) {
      declaredEnvVars.add(m[1]);
    }

    // Pattern 3: process.env["VAR_NAME"] or process.env.VAR_NAME
    const processEnvDirectRe = /process\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\])/g;
    while ((m = processEnvDirectRe.exec(envSrc)) !== null) {
      const varName = m[1] || m[2];
      if (varName) declaredEnvVars.add(varName);
    }
  }

  // Check .env.example for declared vars
  const envExamplePath = path.join(paths.rootDir, ".env.example");
  if (fileExists(envExamplePath)) {
    const envExample = readFile(envExamplePath);
    for (const line of envExample.split("\n")) {
      const match = line.match(/^([A-Z][A-Z0-9_]+)\s*=/);
      if (match) declaredEnvVars.add(match[1]);
    }
  }

  // Check .env file itself
  const envPath = path.join(paths.rootDir, ".env");
  if (fileExists(envPath)) {
    const envContent = readFile(envPath);
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([A-Z][A-Z0-9_]+)\s*=/);
      if (match) declaredEnvVars.add(match[1]);
    }
  }

  // ── Step 3: Check for env vars with empty-string fallbacks ───────────────
  // process.env.SECRET_KEY || "" — silently fails in production
  if (paths.envFile && fileExists(paths.envFile)) {
    const envSrc = readFile(paths.envFile);
    const emptyFallbackRe = /process\.env\.([A-Z][A-Z0-9_]+)\s*\|\|\s*["']{2}/g;
    let m: RegExpExecArray | null;
    while ((m = emptyFallbackRe.exec(envSrc)) !== null) {
      addIssue("WARNING", 11, relPath(paths.envFile, paths.rootDir), 0,
        `${m[1]} has empty-string fallback ("" or '') — will silently fail in production with no error. Use z.string().min(1) or throw if missing.`,
        config);
      count++;
    }
  }

  // ── Step 4: Check required env vars are declared ──────────────────────────
  for (const requiredVar of patterns.requiredEnvVars) {
    if (!declaredEnvVars.has(requiredVar)) {
      addIssue("CRITICAL", 11, ".env.example", 0,
        `Required env var ${requiredVar} is not declared in .env.example or env.ts — deployment will fail silently`,
        config);
      count++;
    }
  }

  // ── Step 5: Flag referenced vars not in any declaration ──────────────────
  const COMMON_SYSTEM_VARS = new Set([
    "NODE_ENV", "PORT", "HOST", "PATH", "HOME", "USER", "PWD",
    "CI", "GITHUB_ACTIONS", "VERCEL", "RAILWAY_ENVIRONMENT",
    "npm_package_version", "npm_lifecycle_event",
  ]);

  for (const varName of referencedEnvVars) {
    if (COMMON_SYSTEM_VARS.has(varName)) continue;
    if (declaredEnvVars.has(varName)) continue;

    addIssue("WARNING", 11, "env", 0,
      `Env var ${varName} is referenced in code but not declared in .env.example or env.ts — may be missing from deployment`,
      config);
    count++;
  }

  return { check: 11, label, passed: count === 0, count };
}
