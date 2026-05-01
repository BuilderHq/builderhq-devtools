# Push & Verify — Self-Correcting CI Loop

This script is the core of the BuilderHQ self-correcting workflow. Every Manus task that pushes code to a BuilderHQ repo uses this to ensure the audit passes before declaring the work done.

## How It Works

```
git commit -m "feat: your changes"
         ↓
npx tsx scripts/push-and-verify.ts
         ↓
Pushes to GitHub → waits for CI → checks result
         ↓
    GREEN ✅              RED ❌
    Exit 0                Print every [CRITICAL] issue
    Done                  with file + line number
                          Exit 1
                          ↓
                  Manus reads the output,
                  fixes the issues,
                  commits, and calls again
                          ↓
                  Repeat until GREEN ✅
```

## Usage

### From the command line (Manus tasks)

```bash
# Push current branch and check once
npx tsx scripts/push-and-verify.ts

# Push a specific branch
npx tsx scripts/push-and-verify.ts feature/my-feature

# Push and retry up to 3 times (waits for manual fixes between attempts)
npx tsx scripts/push-and-verify.ts main 3
```

### As a module (in other scripts)

```typescript
import { pushAndVerify } from './push-and-verify.js'

const result = await pushAndVerify({ branch: 'main', verbose: true })

if (result.passed) {
  console.log('Audit passed — all clear')
} else {
  console.log('Criticals to fix:')
  result.criticals.forEach(c => console.log(c))
  // Fix the issues, commit, then call pushAndVerify again
}
```

## Return Value

| Field | Type | Description |
|-------|------|-------------|
| `passed` | boolean | Whether the audit passed |
| `branch` | string | Branch that was pushed |
| `commitSha` | string | Full SHA of the pushed commit |
| `runUrl` | string | GitHub Actions run URL |
| `criticals` | string[] | All `[CRITICAL]` lines from the audit report |
| `warnings` | string[] | All `[WARNING]` lines from the audit report |
| `reportPath` | string \| null | Local path to the downloaded audit report |
| `scorecard` | string \| null | Scorecard section from the report |

## The Self-Correcting Loop in Practice

A Manus task working on `builderhq-property-saas` follows this pattern:

1. Make code changes
2. `git add . && git commit -m "feat: ..."`
3. `npx tsx scripts/push-and-verify.ts`
4. If exit 0 → done, report success to user
5. If exit 1 → read the printed criticals, fix each one, go to step 2

The task never declares success until the audit is green. No human needed.

## Requirements

- `gh` CLI authenticated (already set up in Manus sandbox)
- `npx tsx` available (comes with the devtools `pnpm install`)
- Repo must have the `Platform Audit` workflow in `.github/workflows/audit.yml`
