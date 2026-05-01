# BuilderHQ DevTools

Universal platform audit engine for all BuilderHQ repositories. 22 checks, zero false positives, self-auditing.

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
    uses: ZechariahBHQ/builderhq-devtools/.github/workflows/reusable-audit.yml@main
    secrets:
      DEVTOOLS_TOKEN: ${{ secrets.DEVTOOLS_TOKEN }}
```

Then add `DEVTOOLS_TOKEN` as a repository secret (Settings → Secrets → Actions) using the BuilderHQ PAT with `repo` + `workflow` scopes.

That's it. The audit runs automatically on every push and PR.

## The 22 Checks

| # | Check | Catches |
|---|-------|---------|
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
| 15 | Orphaned Migrations | Migration files without matching SQL |
| 16 | Type Safety | @ts-ignore suppressing real errors |
| 17 | Raw Fetch Bypass | Bypassing the tRPC client layer |
| 18 | Hidden Features | NOCOMMIT/FIXME/HACK in production code |
| 19 | Missing Loading States | UI with no loading/error handling |
| 20 | Console.log in Server | Sensitive data in server logs |
| 21 | Unprotected Routes | Sensitive Express routes without auth |
| 22 | Memory Leaks | useEffect without cleanup functions |

## Running locally

```bash
# From any repo root that has the audit engine installed
pnpm exec tsx scripts/audit.ts

# Or point at any directory
AUDIT_ROOT=/path/to/project npx tsx /path/to/devtools/scripts/audit.ts
```
