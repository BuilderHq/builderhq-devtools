// ─── UNIVERSAL AUDITOR — STACK DETECTOR ──────────────────────────────────────
import * as fs from "fs";
import * as path from "path";
import { readPackageJson, getDeps, fileExists, readFile, readPathAliases } from "./utils.js";
import type { StackFlags, AuditConfig, AuditPaths, AuditPatterns, UserAuditConfig } from "./types.js";

// ─── STACK FLAG DETECTION ─────────────────────────────────────────────────────

export function detectStackFlags(rootDir: string): StackFlags {
  const pkg = readPackageJson(rootDir);
  const deps = getDeps(pkg);

  return {
    // API Layer
    hasTrpc: deps.has("@trpc/server") || deps.has("@trpc/client"),
    hasNextjsApi: deps.has("next"),
    hasRemix: deps.has("@remix-run/node") || deps.has("@remix-run/react"),
    hasGraphql: deps.has("graphql"),
    hasExpress: deps.has("express"),
    hasFastify: deps.has("fastify"),
    hasHono: deps.has("hono"),

    // ORM
    hasDrizzle: deps.has("drizzle-orm"),
    hasPrisma: deps.has("@prisma/client") || deps.has("prisma"),
    hasTypeorm: deps.has("typeorm"),
    hasMongoose: deps.has("mongoose"),

    // Frontend
    hasReact: deps.has("react"),
    hasNextjs: deps.has("next"),
    hasSvelte: deps.has("svelte"),
    hasVue: deps.has("vue"),
    hasRemixFrontend: deps.has("@remix-run/react"),

    // Data Fetching
    hasReactQuery: deps.has("@tanstack/react-query"),
    hasSwr: deps.has("swr"),
    hasApollo: deps.has("@apollo/client"),

    // Auth
    hasNextAuth: deps.has("next-auth") || deps.has("@auth/core"),
    hasClerk: deps.has("@clerk/nextjs") || deps.has("@clerk/clerk-sdk-node"),
    hasSupabase: deps.has("@supabase/supabase-js"),

    // Build
    hasVite: deps.has("vite"),
    hasTurbopack: !!(pkg.scripts && JSON.stringify(pkg.scripts).includes("--turbo")),

    // Validation
    hasZod: deps.has("zod"),
    hasYup: deps.has("yup"),
    hasJoi: deps.has("joi"),

    // Misc
    hasStripe: deps.has("stripe"),
    hasOpenai: deps.has("openai"),
    hasAnthropic: deps.has("@anthropic-ai/sdk"),
  };
}

// ─── PATH AUTO-DETECTION ──────────────────────────────────────────────────────

function detectClientSrc(rootDir: string, stack: StackFlags): string {
  // Priority order: check common patterns
  const candidates = [
    "client/src",      // BuilderHQ pattern
    "src/app",         // Next.js App Router
    "app",             // Remix / Next.js App Router
    "src/pages",       // Next.js Pages Router
    "src",             // Standard Vite/CRA
    "pages",           // Next.js Pages Router root
    "frontend/src",    // Monorepo frontend
    "web/src",         // Monorepo web
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(rootDir, candidate))) return candidate;
  }
  return "src"; // fallback
}

function detectServerSrc(rootDir: string, stack: StackFlags): string {
  const candidates = [
    "server",          // BuilderHQ / Express pattern
    "src/server",      // Monorepo server
    "api",             // Next.js / Remix API
    "src/api",         // Vite + API
    "backend",         // Generic backend
    "backend/src",
    "functions",       // Serverless
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(rootDir, candidate))) return candidate;
  }
  return "server"; // fallback
}

function detectSchemaFile(rootDir: string, stack: StackFlags): string | null {
  if (stack.hasDrizzle) {
    const candidates = [
      "drizzle/schema.ts", "db/schema.ts", "src/db/schema.ts",
      "server/db/schema.ts", "database/schema.ts", "schema.ts",
    ];
    for (const c of candidates) {
      if (fileExists(path.join(rootDir, c))) return c;
    }
  }
  if (stack.hasPrisma) {
    const candidates = [
      "prisma/schema.prisma", "schema.prisma", "db/schema.prisma",
    ];
    for (const c of candidates) {
      if (fileExists(path.join(rootDir, c))) return c;
    }
  }
  if (stack.hasMongoose) {
    // Mongoose schemas are spread across files — return the models dir
    const candidates = ["src/models", "models", "server/models", "backend/models"];
    for (const c of candidates) {
      if (fs.existsSync(path.join(rootDir, c))) return c;
    }
  }
  return null;
}

function detectRoutersFile(rootDir: string, stack: StackFlags): string | null {
  if (!stack.hasTrpc) return null;
  const candidates = [
    "server/routers.ts", "server/router.ts", "src/server/routers.ts",
    "server/trpc/routers.ts", "src/trpc/routers.ts", "trpc/routers.ts",
    "server/api/routers.ts", "server/api/root.ts",
  ];
  for (const c of candidates) {
    if (fileExists(path.join(rootDir, c))) return c;
  }
  return null;
}

function detectEnvFile(rootDir: string, stack: StackFlags): string | null {
  const candidates = [
    "server/_core/env.ts",   // BuilderHQ pattern
    "src/env.ts",            // t3-env pattern
    "src/env.mjs",           // t3-env pattern
    "env.ts",
    ".env.example",
    ".env.local",
    "src/lib/env.ts",
    "lib/env.ts",
  ];
  for (const c of candidates) {
    if (fileExists(path.join(rootDir, c))) return c;
  }
  return null;
}

function detectMigrationsDir(rootDir: string, stack: StackFlags): string | null {
  if (stack.hasDrizzle) {
    const candidates = ["drizzle", "migrations", "db/migrations", "src/db/migrations"];
    for (const c of candidates) {
      if (fs.existsSync(path.join(rootDir, c))) return c;
    }
  }
  if (stack.hasPrisma) {
    const candidates = ["prisma/migrations", "migrations"];
    for (const c of candidates) {
      if (fs.existsSync(path.join(rootDir, c))) return c;
    }
  }
  return null;
}

function detectMigrationJournal(rootDir: string, stack: StackFlags, migrationsDir: string | null): string | null {
  if (!migrationsDir) return null;
  if (stack.hasDrizzle) {
    const journal = path.join(migrationsDir, "meta/_journal.json");
    if (fileExists(path.join(rootDir, journal))) return journal;
  }
  // Prisma uses a different tracking mechanism (migration_lock.toml)
  if (stack.hasPrisma) {
    const lock = path.join(migrationsDir, "migration_lock.toml");
    if (fileExists(path.join(rootDir, lock))) return path.join(migrationsDir, "migration_lock.toml");
  }
  return null;
}

// ─── PATTERN DETECTION ────────────────────────────────────────────────────────

function detectMutationHooks(stack: StackFlags): string[] {
  const hooks: string[] = [];
  if (stack.hasTrpc || stack.hasReactQuery) {
    hooks.push("useMutation", "useQuery", "useInfiniteQuery", "useSuspenseQuery");
  }
  if (stack.hasSwr) {
    hooks.push("useSWR", "useSWRMutation");
  }
  if (stack.hasApollo) {
    hooks.push("useMutation", "useQuery", "useLazyQuery", "useSubscription");
  }
  if (hooks.length === 0) {
    hooks.push("useMutation", "useQuery"); // safe defaults
  }
  return [...new Set(hooks)];
}

function detectAuthProcedures(rootDir: string, stack: StackFlags): string[] {
  const procedures: string[] = [];

  if (stack.hasTrpc) {
    // Scan for procedure names defined in the tRPC context file
    const contextCandidates = [
      "server/trpc.ts", "server/_core/trpc.ts", "src/server/trpc.ts",
      "src/trpc.ts", "trpc.ts", "server/context.ts",
    ];
    for (const c of contextCandidates) {
      const src = readFile(path.join(rootDir, c));
      if (!src) continue;
      const procRe = /export\s+const\s+(\w*[Pp]rocedure\w*)\s*=/g;
      let m: RegExpExecArray | null;
      while ((m = procRe.exec(src)) !== null) {
        if (m[1] !== "publicProcedure") procedures.push(m[1]);
      }
    }
    if (procedures.length === 0) {
      procedures.push("protectedProcedure", "adminProcedure", "superAdminProcedure");
    }
  }

  if (stack.hasNextAuth) {
    procedures.push("getServerSession", "getSession", "withAuth");
  }
  if (stack.hasClerk) {
    procedures.push("auth()", "currentUser()", "clerkMiddleware", "requireAuth");
  }
  if (stack.hasSupabase) {
    procedures.push("supabase.auth.getSession", "supabase.auth.getUser");
  }

  return [...new Set(procedures)];
}

function detectEnvPrefix(stack: StackFlags): string {
  if (stack.hasVite && !stack.hasNextjs) return "VITE_";
  if (stack.hasNextjs) return "NEXT_PUBLIC_";
  return ""; // Remix / Express / generic — no prefix required
}

function detectBuildCommand(rootDir: string, stack: StackFlags): string {
  const pkg = readPackageJson(rootDir);
  const scripts = (pkg.scripts as Record<string, string>) || {};

  // Check package.json scripts first
  if (scripts.build) return `pnpm run build`;
  if (scripts.typecheck) return `pnpm run typecheck`;
  if (scripts["type-check"]) return `pnpm run type-check`;
  if (stack.hasNextjs) return "next build";
  if (stack.hasRemix) return "remix build";
  if (stack.hasVite) return "vite build";
  // Use local tsc if available
  const localTsc = path.join(rootDir, "node_modules", ".bin", "tsc");
  if (fs.existsSync(localTsc)) return `${localTsc} --noEmit`;
  return "tsc --noEmit";
}

function detectAllSourceDirs(rootDir: string, clientSrc: string, serverSrc: string): string[] {
  const dirs = new Set<string>();
  dirs.add(path.join(rootDir, clientSrc));
  dirs.add(path.join(rootDir, serverSrc));

  // Also add common shared dirs
  const sharedCandidates = ["shared", "lib", "src/lib", "src/shared", "packages", "common"];
  for (const c of sharedCandidates) {
    const full = path.join(rootDir, c);
    if (fs.existsSync(full)) dirs.add(full);
  }

  return [...dirs].filter(d => fs.existsSync(d));
}

// ─── MAIN DETECTOR ────────────────────────────────────────────────────────────

export function detectConfig(rootDir: string, userConfig?: UserAuditConfig): AuditConfig {
  const pkg = readPackageJson(rootDir);
  const projectName = (pkg.name as string) || path.basename(rootDir);
  const stack = detectStackFlags(rootDir);
  const pathAliases = readPathAliases(rootDir);

  const clientSrc = userConfig?.overrides?.paths?.clientSrc || detectClientSrc(rootDir, stack);
  const serverSrc = userConfig?.overrides?.paths?.serverSrc || detectServerSrc(rootDir, stack);
  const schemaFile = userConfig?.overrides?.paths?.schemaFile ?? detectSchemaFile(rootDir, stack);
  const routersFile = userConfig?.overrides?.paths?.routersFile ?? detectRoutersFile(rootDir, stack);
  const envFile = userConfig?.overrides?.paths?.envFile ?? detectEnvFile(rootDir, stack);
  const migrationsDir = userConfig?.overrides?.paths?.migrationsDir ?? detectMigrationsDir(rootDir, stack);
  const migrationJournal = userConfig?.overrides?.paths?.migrationJournal ?? detectMigrationJournal(rootDir, stack, migrationsDir);

  const paths: AuditPaths = {
    rootDir,
    clientSrc: path.join(rootDir, clientSrc),
    serverSrc: path.join(rootDir, serverSrc),
    schemaFile: schemaFile ? path.join(rootDir, schemaFile) : null,
    routersFile: routersFile ? path.join(rootDir, routersFile) : null,
    envFile: envFile ? path.join(rootDir, envFile) : null,
    migrationsDir: migrationsDir ? path.join(rootDir, migrationsDir) : null,
    migrationJournal: migrationJournal ? path.join(rootDir, migrationJournal) : null,
    tsConfigFile: path.join(rootDir, "tsconfig.json"),
    pathAliases,
    allSourceDirs: detectAllSourceDirs(rootDir, clientSrc, serverSrc),
    excludeDirs: userConfig?.overrides?.paths?.excludeDirs || [],
  };

  const patterns: AuditPatterns = {
    mutationHooks: userConfig?.overrides?.patterns?.mutationHooks || detectMutationHooks(stack),
    queryHooks: userConfig?.overrides?.patterns?.queryHooks || ["useQuery", "useInfiniteQuery", "useSuspenseQuery"],
    authProcedures: userConfig?.overrides?.patterns?.authProcedures || detectAuthProcedures(rootDir, stack),
    envPrefix: userConfig?.overrides?.patterns?.envPrefix || detectEnvPrefix(stack),
    buildCommand: userConfig?.overrides?.patterns?.buildCommand || detectBuildCommand(rootDir, stack),
    serverFileGlob: userConfig?.overrides?.patterns?.serverFileGlob || `${serverSrc}/**/*.ts`,
    sensitiveRouteKeywords: userConfig?.overrides?.patterns?.sensitiveRouteKeywords || [
      "delete", "admin", "update", "create", "upload", "generate", "seed", "reset", "purge",
    ],
    schemaAccessPatterns: userConfig?.overrides?.patterns?.schemaAccessPatterns || [],
    serverComputedFields: [
      ...(userConfig?.serverComputedFields || []),
      "assigneeName", "createdByName", "updatedByName", "clientName", "projectName",
      "fullName", "displayName", "totalCount", "rowCount",
    ],
    brandingTerms: userConfig?.brandingTerms || [],
    requiredEnvVars: userConfig?.requiredEnvVars || [],
  };

  return {
    projectName,
    version: "5.0",
    stack,
    paths,
    patterns,
    suppressions: userConfig?.suppressions || [],
  };
}

// ─── USER CONFIG LOADER ───────────────────────────────────────────────────────

export function loadUserConfig(rootDir: string): UserAuditConfig {
  const configPath = path.join(rootDir, "scripts", "audit.config.json");
  const altPath = path.join(rootDir, "audit.config.json");

  for (const p of [configPath, altPath]) {
    if (fileExists(p)) {
      try {
        return JSON.parse(readFile(p)) as UserAuditConfig;
      } catch {
        console.warn(`[WARN] Could not parse ${p} — using defaults`);
      }
    }
  }
  return {};
}

// ─── CONFIG PRINTER ───────────────────────────────────────────────────────────

export function printDetectedConfig(config: AuditConfig): void {
  const { stack, paths } = config;

  const apiLayer = stack.hasTrpc ? "tRPC" :
    stack.hasGraphql ? "GraphQL" :
    stack.hasNextjs ? "Next.js API" :
    stack.hasRemix ? "Remix" :
    stack.hasExpress ? "Express REST" :
    stack.hasFastify ? "Fastify REST" : "Unknown";

  const orm = stack.hasDrizzle ? "Drizzle ORM" :
    stack.hasPrisma ? "Prisma" :
    stack.hasTypeorm ? "TypeORM" :
    stack.hasMongoose ? "Mongoose" : "None detected";

  const frontend = stack.hasNextjs ? "Next.js" :
    stack.hasRemixFrontend ? "Remix" :
    stack.hasSvelte ? "SvelteKit" :
    stack.hasVue ? "Vue/Nuxt" :
    stack.hasReact ? "React" : "Unknown";

  const auth = stack.hasClerk ? "Clerk" :
    stack.hasNextAuth ? "NextAuth.js" :
    stack.hasSupabase ? "Supabase Auth" :
    stack.hasTrpc ? "tRPC Procedures" : "Custom";

  console.log(`  Project:    ${config.projectName}`);
  console.log(`  API Layer:  ${apiLayer}`);
  console.log(`  ORM:        ${orm}`);
  console.log(`  Frontend:   ${frontend}`);
  console.log(`  Auth:       ${auth}`);
  console.log(`  Env Prefix: ${config.patterns.envPrefix || "(none)"}`);
  console.log(`  Client Src: ${paths.clientSrc}`);
  console.log(`  Server Src: ${paths.serverSrc}`);
  if (paths.schemaFile) console.log(`  Schema:     ${paths.schemaFile}`);
  if (paths.routersFile) console.log(`  Routers:    ${paths.routersFile}`);
  console.log();
}
