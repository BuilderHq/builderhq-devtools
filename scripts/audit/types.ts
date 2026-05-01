// ─── UNIVERSAL AUDITOR — TYPES ────────────────────────────────────────────────
// Shared type definitions for all checks, config, and reporting

export type Severity = "CRITICAL" | "WARNING" | "INFO";

export interface Issue {
  severity: Severity;
  check: number;
  file: string;
  line: number;
  message: string;
}

export interface CheckResult {
  check: number;
  label: string;
  passed: boolean;
  count: number;       // number of CRITICAL/WARNING issues (not INFO)
  skipped?: boolean;   // true if check was skipped due to stack mismatch
  skipReason?: string;
}

// ─── STACK DETECTION FLAGS ────────────────────────────────────────────────────

export interface StackFlags {
  // API Layer
  hasTrpc: boolean;
  hasNextjsApi: boolean;
  hasRemix: boolean;
  hasGraphql: boolean;
  hasExpress: boolean;
  hasFastify: boolean;
  hasHono: boolean;

  // ORM / Database
  hasDrizzle: boolean;
  hasPrisma: boolean;
  hasTypeorm: boolean;
  hasMongoose: boolean;

  // Frontend Framework
  hasReact: boolean;
  hasNextjs: boolean;
  hasSvelte: boolean;
  hasVue: boolean;
  hasRemixFrontend: boolean;

  // Data Fetching
  hasReactQuery: boolean;
  hasSwr: boolean;
  hasApollo: boolean;

  // Auth
  hasNextAuth: boolean;
  hasClerk: boolean;
  hasSupabase: boolean;

  // Build Tools
  hasVite: boolean;
  hasTurbopack: boolean;

  // Validation
  hasZod: boolean;
  hasYup: boolean;
  hasJoi: boolean;

  // Misc
  hasStripe: boolean;
  hasOpenai: boolean;
  hasAnthropic: boolean;
}

// ─── RUNTIME AUDIT CONFIG ─────────────────────────────────────────────────────

export interface AuditPaths {
  rootDir: string;
  clientSrc: string;           // e.g. "client/src" | "src" | "app"
  serverSrc: string;           // e.g. "server" | "src/server" | "api"
  schemaFile: string | null;   // e.g. "drizzle/schema.ts" | "prisma/schema.prisma"
  routersFile: string | null;  // e.g. "server/routers.ts" | null
  envFile: string | null;      // e.g. "server/_core/env.ts" | ".env.example"
  migrationsDir: string | null;
  migrationJournal: string | null;
  tsConfigFile: string;
  pathAliases: Record<string, string>;
  allSourceDirs: string[];     // all dirs to scan for source files
  excludeDirs: string[];       // dirs to always skip
}

export interface AuditPatterns {
  // Data fetching hooks to track for dead variable check
  mutationHooks: string[];     // ["useMutation"] | ["useSWR"] | ["useQuery"]
  queryHooks: string[];        // ["useQuery", "useInfiniteQuery"]

  // Auth procedure/guard names
  authProcedures: string[];    // ["protectedProcedure"] | ["getServerSession"] | ["requireAuth"]

  // Env var prefix for client-side vars
  envPrefix: string;           // "VITE_" | "NEXT_PUBLIC_" | ""

  // Build command
  buildCommand: string;        // "vite build" | "next build" | "tsc --noEmit"

  // File globs for server-side code
  serverFileGlob: string;

  // Patterns that indicate a sensitive/protected route
  sensitiveRouteKeywords: string[];

  // Schema field accessor patterns (how fields are accessed from DB results)
  schemaAccessPatterns: string[];

  // Known server-computed fields (JOIN results, virtual fields) — not raw schema columns
  serverComputedFields: string[];

  // Branding terms to flag (from audit.config.json or defaults)
  brandingTerms: string[];

  // Required env vars (from audit.config.json or auto-detected)
  requiredEnvVars: string[];
}

export interface AuditConfig {
  projectName: string;
  version: string;
  stack: StackFlags;
  paths: AuditPaths;
  patterns: AuditPatterns;
  suppressions: SuppressionRule[];
}

export interface SuppressionRule {
  check: number;
  file?: string;
  reason: string;
}

// ─── USER CONFIG FILE (audit.config.json) ────────────────────────────────────

export interface UserAuditConfig {
  version?: string;
  overrides?: {
    paths?: Partial<AuditPaths>;
    patterns?: Partial<AuditPatterns>;
  };
  suppressions?: SuppressionRule[];
  brandingTerms?: string[];
  requiredEnvVars?: string[];
  serverComputedFields?: string[];
}
