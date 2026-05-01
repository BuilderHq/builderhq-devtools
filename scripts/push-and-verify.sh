#!/usr/bin/env bash
# =============================================================================
# BuilderHQ — Push & Verify (Self-Correcting CI Loop)
# =============================================================================
#
# Usage:
#   ./scripts/push-and-verify.sh [branch] [max_attempts]
#
# What it does:
#   1. Pushes the current branch to origin
#   2. Waits for the "Platform Audit" CI workflow to complete
#   3. If GREEN  → exits 0, reports success
#   4. If RED    → downloads the audit report, runs the audit locally,
#                  prints every [CRITICAL] issue with file + line,
#                  then exits 1 so the calling task can fix and retry
#
# Designed to be called by Manus tasks after making code changes.
# The task reads the output, fixes the issues, and calls this script again.
# Loop continues until the audit passes or max_attempts is reached.
#
# Requirements:
#   - gh CLI authenticated (already set up in Manus sandbox)
#   - AUDIT_TOKEN env var set (or gh CLI already authenticated to the org)
#
# =============================================================================

set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
MAX_ATTEMPTS="${2:-5}"
WORKFLOW_NAME="Platform Audit"
POLL_INTERVAL=15   # seconds between status checks
MAX_WAIT=300       # seconds to wait for CI before timing out (5 minutes)

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

log()    { echo -e "${BLUE}[push-and-verify]${NC} $*"; }
success(){ echo -e "${GREEN}[✅ PASS]${NC} $*"; }
warn()   { echo -e "${YELLOW}[⚠️  WARN]${NC} $*"; }
fail()   { echo -e "${RED}[❌ FAIL]${NC} $*"; }

# ─── Get repo info ─────────────────────────────────────────────────────────────
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
if [[ -z "$REPO" ]]; then
  fail "Could not determine repo. Are you inside a git repo with a GitHub remote?"
  exit 1
fi

attempt=1
while [[ $attempt -le $MAX_ATTEMPTS ]]; do
  echo ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "Attempt ${attempt}/${MAX_ATTEMPTS} — pushing ${BRANCH} to ${REPO}"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # ─── Push ──────────────────────────────────────────────────────────────────
  COMMIT_SHA=$(git rev-parse HEAD)
  SHORT_SHA="${COMMIT_SHA:0:7}"

  git push origin "$BRANCH" 2>&1 | sed 's/^/  /'
  log "Pushed commit ${SHORT_SHA} to origin/${BRANCH}"

  # ─── Wait for workflow to appear ───────────────────────────────────────────
  log "Waiting for '${WORKFLOW_NAME}' CI to start..."
  waited=0
  RUN_ID=""
  while [[ -z "$RUN_ID" && $waited -lt 60 ]]; do
    sleep 5
    waited=$((waited + 5))
    RUN_ID=$(gh run list \
      --repo "$REPO" \
      --workflow "$WORKFLOW_NAME" \
      --branch "$BRANCH" \
      --limit 5 \
      --json databaseId,headSha,status \
      --jq ".[] | select(.headSha == \"${COMMIT_SHA}\") | .databaseId" 2>/dev/null | head -1 || echo "")
  done

  if [[ -z "$RUN_ID" ]]; then
    warn "CI workflow did not start within 60s. Checking most recent run instead..."
    RUN_ID=$(gh run list \
      --repo "$REPO" \
      --workflow "$WORKFLOW_NAME" \
      --branch "$BRANCH" \
      --limit 1 \
      --json databaseId \
      --jq '.[0].databaseId' 2>/dev/null || echo "")
  fi

  if [[ -z "$RUN_ID" ]]; then
    fail "No CI run found for '${WORKFLOW_NAME}' on branch '${BRANCH}'."
    fail "Check that the workflow file exists and the branch name is correct."
    exit 1
  fi

  log "CI run ID: ${RUN_ID} — polling for completion..."

  # ─── Poll for completion ────────────────────────────────────────────────────
  elapsed=0
  CONCLUSION=""
  while [[ $elapsed -lt $MAX_WAIT ]]; do
    sleep $POLL_INTERVAL
    elapsed=$((elapsed + POLL_INTERVAL))

    STATUS_JSON=$(gh run view "$RUN_ID" --repo "$REPO" --json status,conclusion 2>/dev/null || echo '{}')
    STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
    CONCLUSION=$(echo "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('conclusion',''))" 2>/dev/null || echo "")

    log "  Status: ${STATUS} | Conclusion: ${CONCLUSION:-pending} (${elapsed}s elapsed)"

    if [[ "$STATUS" == "completed" ]]; then
      break
    fi
  done

  if [[ "$STATUS" != "completed" ]]; then
    warn "CI timed out after ${MAX_WAIT}s. Check manually: gh run view ${RUN_ID} --repo ${REPO}"
    exit 1
  fi

  # ─── Evaluate result ────────────────────────────────────────────────────────
  RUN_URL="https://github.com/${REPO}/actions/runs/${RUN_ID}"

  if [[ "$CONCLUSION" == "success" ]]; then
    echo ""
    success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    success "ALL CLEAR — Audit passed on ${REPO}@${BRANCH} (${SHORT_SHA})"
    success "Run: ${RUN_URL}"
    success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi

  # ─── Failure — extract audit report ────────────────────────────────────────
  echo ""
  fail "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  fail "AUDIT FAILED on ${REPO}@${BRANCH} (${SHORT_SHA})"
  fail "Run: ${RUN_URL}"
  fail "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Try to download the audit report artifact
  ARTIFACT_DIR="/tmp/audit-report-${RUN_ID}"
  mkdir -p "$ARTIFACT_DIR"

  log "Downloading audit report artifact..."
  if gh run download "$RUN_ID" --repo "$REPO" --dir "$ARTIFACT_DIR" 2>/dev/null; then
    REPORT_FILE=$(find "$ARTIFACT_DIR" -name "*.txt" | head -1)
    if [[ -n "$REPORT_FILE" ]]; then
      echo ""
      echo "═══════════════════════════════════════════════════"
      echo "  AUDIT REPORT — CRITICAL ISSUES TO FIX"
      echo "═══════════════════════════════════════════════════"
      grep "\[CRITICAL\]" "$REPORT_FILE" || echo "  (No [CRITICAL] lines found — check [WARNING] issues)"
      echo ""
      grep "STATUS:" "$REPORT_FILE" || true
      echo "═══════════════════════════════════════════════════"
      echo ""
      log "Full report saved to: ${REPORT_FILE}"
    fi
  else
    warn "Could not download artifact. Running local audit instead..."
    if [[ -f "scripts/audit.ts" ]]; then
      echo ""
      echo "═══════════════════════════════════════════════════"
      echo "  LOCAL AUDIT RESULTS"
      echo "═══════════════════════════════════════════════════"
      AUDIT_ROOT=. npx tsx scripts/audit.ts 2>&1 | grep -E "\[CRITICAL\]|\[WARNING\]|STATUS:|SCORECARD" | head -50 || true
      echo "═══════════════════════════════════════════════════"
    fi
  fi

  echo ""
  fail "Fix the [CRITICAL] issues above, commit the changes, then this script will retry automatically."
  echo ""

  # Exit with failure so the calling Manus task can read the output and fix
  exit 1

  attempt=$((attempt + 1))
done

fail "Max attempts (${MAX_ATTEMPTS}) reached without a passing audit."
exit 1
