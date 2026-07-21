#!/bin/bash
# =============================================================================
# Real Estate CRM — Build & Validation Test Script
# =============================================================================
# Usage: bash tests/test-build.sh
# Runs from project root. Tests build pipeline, type checking, linting,
# database schema, and access control validation.
# =============================================================================

PASS=0
FAIL=0
TOTAL=0

run_test() {
  local name="$1"
  local cmd="$2"
  TOTAL=$((TOTAL + 1))

  echo -n "  Testing: $name ... "
  output=$(eval "$cmd" 2>&1)
  if [ $? -eq 0 ]; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    echo "    $output" | head -5
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "Real Estate CRM — Build & Validation Tests"
echo "============================================"
echo ""

# --- Prerequisites ---
echo "[Prerequisites]"
run_test "node_modules exist" "test -d node_modules"
run_test "prisma schema exists" "test -f prisma/schema.prisma"
run_test "scopes.json exists" "test -f scopes.json"

# --- Database ---
echo ""
echo "[Database]"
run_test "Prisma db push" "npm run db:push 2>&1 | grep -q 'in sync\|Your database is now in sync'"
run_test "Prisma generate" "npm run db:generate 2>&1 | grep -q 'Generated Prisma Client'"

# --- Type Checking ---
echo ""
echo "[Type Safety]"
run_test "TypeScript compilation" "npm run typecheck"

# --- Linting ---
echo ""
echo "[Code Quality]"
run_test "ESLint (zero warnings)" "npm run lint"

# --- Build ---
echo ""
echo "[Build]"
run_test "Server build" "npm run build:server"
run_test "Web build" "npm run build:web"

# --- File Structure ---
echo ""
echo "[File Structure]"
run_test "dist/server exists" "test -d dist/server"
run_test "dist/web exists" "test -d dist/web"
run_test "favicon.svg exists" "test -f favicon.svg"
run_test "index.html exists" "test -f index.html"

# --- Schema Checks ---
echo ""
echo "[Schema Integrity]"
MODELS=$(grep -c "^model " prisma/schema.prisma)
TOTAL=$((TOTAL + 1))
if [ "$MODELS" -ge 25 ]; then
  echo "  Prisma models: $MODELS (expected ≥25) ... PASS"
  PASS=$((PASS + 1))
else
  echo "  Prisma models: $MODELS (expected ≥25) ... FAIL"
  FAIL=$((FAIL + 1))
fi

SCOPES=$(python3 -c "import json; print(len(json.load(open('scopes.json'))['scopes']))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$SCOPES" -ge 30 ]; then
  echo "  Scopes defined: $SCOPES (expected ≥30) ... PASS"
  PASS=$((PASS + 1))
else
  echo "  Scopes defined: $SCOPES (expected ≥30) ... FAIL"
  FAIL=$((FAIL + 1))
fi

TABLES=$(python3 -c "import json; print(len(json.load(open('scopes.json'))['tables']))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$TABLES" -ge 15 ]; then
  echo "  RLS table configs: $TABLES (expected ≥15) ... PASS"
  PASS=$((PASS + 1))
else
  echo "  RLS table configs: $TABLES (expected ≥15) ... FAIL"
  FAIL=$((FAIL + 1))
fi

# --- Source File Counts ---
echo ""
echo "[Source Statistics]"
BACKEND=$(find src/server/routes -name "*.ts" | wc -l | tr -d ' ')
FRONTEND=$(find src/web/pages -name "*.tsx" | wc -l | tr -d ' ')
COMPONENTS=$(find src/web/components -name "*.tsx" | wc -l | tr -d ' ')
echo "  Backend route files: $BACKEND"
echo "  Frontend pages: $FRONTEND"
echo "  Reusable components: $COMPONENTS"
echo "  Total source files: $(find src -name '*.ts' -o -name '*.tsx' | wc -l | tr -d ' ')"

# --- Summary ---
echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed, $TOTAL total"
if [ "$FAIL" -eq 0 ]; then
  echo "STATUS: ALL TESTS PASSED — READY FOR DEPLOYMENT"
else
  echo "STATUS: $FAIL TESTS FAILED — FIX BEFORE DEPLOYING"
fi
echo "============================================"
