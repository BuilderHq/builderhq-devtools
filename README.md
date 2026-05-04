# BuilderHQ DevTools

Universal QC system for all BuilderHQ repositories. 41 checks, zero false positives, self-auditing. Includes the `bhq:ready` pre-demo readiness tool and feature flag enforcement.

## Adding the audit to a new repo

Create `.github/workflows/audit.yml` in your repo with this content:

```yaml
name: Platform Audit

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  audit:
    uses: BuilderHq/builderhq-devtools/.github/workflows/reusable-audit.yml@main
    secrets:
      DEVTOOLS_TOKEN: ${{ secrets.DEVTOOLS_TOKEN }}
```

`DEVTOOLS_TOKEN` is set at the `BuilderHq` org level — no manual secret setup needed for repos inside the org. The audit runs automatically on every push and PR.

## The 41 Checks

### Tier 0 — Core Integrity (Critical, Exit 1)

| # | Check | Catches |
|---|-------|------|
| 01 | Dead Variable References | Unused React Query hook results |
| 02 | Schema Field Mismatches | Accessing DB fields that don't exist |
| 03 | tRPC Procedure Mismatches | Calling API routes that don't exist |
| 04 | Broken Import Paths | Imports pointing to missing files |
| 05 | Duplicate Object Keys | Silent data overwrites in objects |
| 06 | Hardcoded Bad URLs | localhost URLs that break in production |
| 07 | Broken JSX Structure | Malformed React component trees |
| 08 | Build Verification | TypeScript compilation errors |
| 09 | DB Data Integrity | Deletes/updates without WHERE clause |
| 10 | Old Branding | Placeholder text left in production |
| 11 | Env Var Coverage | Missing environment variable declarations |
| 12 | Auth Guard Audit | Public API routes that should be protected |
| 13 | Unbounded String Inputs | DoS vectors via unlimited string lengths |
| 14 | XSS Vulnerabilities | eval, innerHTML, dangerouslySetInnerHTML |

### Tier 0 — Tech Debt (Warnings, Exit 0)

| # | Check | Catches |
|---|-------|------|
| 15 | Orphaned Migrations | Migration files without matching SQL |
| 16 | Type Safety | @ts-ignore suppressing real errors |
| 17 | Raw Fetch Bypass | Bypassing the tRPC client layer |
| 18 | Hidden Features | NOCOMMIT/FIXME/HACK in production code |
| 19 | Missing Loading States | UI with no loading/error handling |
| 20 | Console.log in Server | Sensitive data in server logs |
| 21 | Unprotected Routes | Sensitive Express routes without auth |
| 22 | Memory Leaks | useEffect without cleanup functions |

### Tier 1 — UX Fundamentals

| # | Check | Catches |
|---|-------|------|
| 23 | Unhandled Mutation Errors | Silent failures — button clicks that do nothing |
| 24 | Missing Empty State Handling | Blank screens where data should be |
| 25 | Submit Buttons Not Disabled | Double-submits, duplicate records |
| 26 | Missing Accessibility Labels | Broken for screen readers, bad UX |
| 27 | Missing Error Boundaries | Full page crashes instead of graceful errors |
| 28 | Hardcoded Colours | UI inconsistency, off-brand elements |
| 29 | Fixed Pixel Widths | Breaks on mobile during client demos |
| 30 | No User Feedback on Mutations | Client clicks save, nothing happens visually |
| 31 | No Loading Skeleton | Jarring blank flash before data loads |
| 32 | No Form Validation Feedback | Client submits a form, no idea what went wrong |

### Tier 2 — Code Quality

| # | Check | Catches |
|---|-------|------|
| 33 | God Components (400+ lines) | Unmaintainable, hard to debug under pressure |
| 34 | Excessive Inline Styles | Inconsistent UI |
| 35 | TODO/FIXME in Production | Known broken code shipped to clients |
| 36 | Magic Numbers in UI | Fragile layout that breaks unexpectedly |

### Tier 3 — Workflow & DX

| # | Check | Catches |
|---|-------|------|
| 37 | tRPC Missing Zod Validation | Unvalidated inputs crashing the API |
| 38 | Direct process.env Access | Env vars bypassing validation, silent crashes |
| 39 | No Optimistic Updates | Sluggish perceived performance on key actions |
| 40 | No Keyboard Navigation | Accessibility failures |
| 41 | Unguarded WIP Features | Half-built features visible to clients |

## Pre-Demo Readiness Check

Run before every client walkthrough. Returns green or red in under 60 seconds.

```bash
pnpm bhq:ready

# Quick version (skips build step)
pnpm bhq:ready:quick
```

## Feature Flags

Hide WIP features from clients. Defined in `shared/flags.ts`, enforced by Check 41.

```typescript
"new-dashboard": {
  development: true,
  staging: true,
  production: false,
  demo: false,  // never shows in client walkthroughs
}
```

Set `DEMO_MODE=true` in `.env` to simulate the demo environment locally.

## Running locally

```bash
# Full audit
AUDIT_ROOT=$(pwd) SKIP_BUILD_CHECK=true npx tsx scripts/audit.ts

# Point at any directory
AUDIT_ROOT=/path/to/project npx tsx /path/to/devtools/scripts/audit.ts

# Pre-demo readiness check
AUDIT_ROOT=$(pwd) npx tsx scripts/ready.ts
```

## Slack Notifications (Optional)

Add `SLACK_WEBHOOK_URL` as an org-level secret in `BuilderHq` Settings → Secrets → Actions. All repos inherit it automatically.
