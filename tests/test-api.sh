#!/bin/bash
# =============================================================================
# Real Estate CRM — API Test Script
# =============================================================================
# Usage: bash tests/test-api.sh [BASE_URL]
# Default: http://localhost:4000 (npm start / npm run dev's API port).
# For npm run dev through the webpack-dev-server proxy, pass http://localhost:3000.
#
# Requires: curl, python3
# Covers: unauthenticated protected endpoints reject with UNAUTHORIZED, a full
# signup -> cookie -> auth.me round trip, and a few real CRM endpoints post-auth.
# =============================================================================

BASE="${1:-http://localhost:4000}"
API="${BASE}/api/trpc"
COOKIE_JAR=$(mktemp)
TEST_EMAIL="test-api-$(date +%s)@example.com"
PASS=0
FAIL=0
TOTAL=0

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

# Extracts a top-level error.data.code field, e.g. "UNAUTHORIZED" / "FORBIDDEN".
error_code() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('data',{}).get('code',''))" 2>/dev/null
}

# Extracts a field from result.data (e.g. "id" or "email").
result_field() {
  local field="$1"
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result',{}).get('data',{}).get('$field',''))" 2>/dev/null
}

result_data_is_null() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result',{}).get('data') is None)" 2>/dev/null
}

test_unauthorized() {
  local name="$1"
  local url="$2"
  TOTAL=$((TOTAL + 1))
  code=$(curl -s "$url" | error_code)
  if [ "$code" = "UNAUTHORIZED" ]; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected UNAUTHORIZED, got '$code')"
    FAIL=$((FAIL + 1))
  fi
}

test_field_equals() {
  local name="$1"
  local response="$2"
  local field="$3"
  local expected="$4"
  TOTAL=$((TOTAL + 1))
  actual=$(echo "$response" | result_field "$field")
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "Real Estate CRM — API Tests"
echo "Base: $BASE"
echo "============================================"
echo ""

# --- Auth-Protected Endpoints (should return UNAUTHORIZED without a session) ---
echo "[Auth Protection — expect UNAUTHORIZED for protected endpoints]"
test_unauthorized "leads.getAllLeads requires auth" "$API/leads.getAllLeads"
test_unauthorized "contacts.getAll requires auth" "$API/contacts.getAll"
test_unauthorized "opportunities.getAllOpportunities requires auth" "$API/opportunities.getAllOpportunities"
test_unauthorized "dashboard.getAgentMetrics requires auth" "$API/dashboard.getAgentMetrics"
test_unauthorized "tenants.list requires auth" "$API/tenants.list"
test_unauthorized "audit.getLogs requires auth" "$API/audit.getLogs"
test_unauthorized "reports.list requires auth" "$API/reports.list"
test_unauthorized "orgSettings.getOrgMembers requires auth" "$API/orgSettings.getOrgMembers"

# --- auth.me without a session should return null, not throw ---
echo ""
echo "[Public Endpoints]"
TOTAL=$((TOTAL + 1))
if curl -s "$API/auth.me" | result_data_is_null | grep -q True; then
  echo "  PASS  auth.me returns null when logged out"
  PASS=$((PASS + 1))
else
  echo "  FAIL  auth.me returns null when logged out"
  FAIL=$((FAIL + 1))
fi

# --- Signup -> cookie -> auth.me round trip ---
echo ""
echo "[Auth Round Trip]"
signup_response=$(curl -s -c "$COOKIE_JAR" -X POST "$API/auth.signup" \
  -H "content-type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"correct-horse-battery-staple\",\"name\":\"API Test\"}")
test_field_equals "signup creates a user" "$signup_response" "email" "$TEST_EMAIL"

TOTAL=$((TOTAL + 1))
if grep -q "session" "$COOKIE_JAR" 2>/dev/null; then
  echo "  PASS  signup sets a session cookie"
  PASS=$((PASS + 1))
else
  echo "  FAIL  signup sets a session cookie"
  FAIL=$((FAIL + 1))
fi

me_after=$(curl -s -b "$COOKIE_JAR" "$API/auth.me")
test_field_equals "auth.me resolves the signed-up user" "$me_after" "email" "$TEST_EMAIL"

# --- A real CRM endpoint, now authenticated ---
echo ""
echo "[Authenticated CRM Endpoints]"
TOTAL=$((TOTAL + 1))
lead_stats=$(curl -s -b "$COOKIE_JAR" "$API/leads.getLeadStats")
if echo "$lead_stats" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if 'pool' in d.get('result',{}).get('data',{}) else 1)" 2>/dev/null; then
  echo "  PASS  leads.getLeadStats returns real stats once authenticated"
  PASS=$((PASS + 1))
else
  echo "  FAIL  leads.getLeadStats (got: $lead_stats)"
  FAIL=$((FAIL + 1))
fi

# --- Logout invalidates the session server-side ---
echo ""
echo "[Logout]"
curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$API/auth.logout" -H "content-type: application/json" -d "{}" > /dev/null
TOTAL=$((TOTAL + 1))
if curl -s -b "$COOKIE_JAR" "$API/auth.me" | result_data_is_null | grep -q True; then
  echo "  PASS  auth.me returns null after logout"
  PASS=$((PASS + 1))
else
  echo "  FAIL  auth.me returns null after logout"
  FAIL=$((FAIL + 1))
fi

# --- Summary ---
echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed, $TOTAL total"
if [ "$FAIL" -eq 0 ]; then
  echo "STATUS: ALL TESTS PASSED"
else
  echo "STATUS: $FAIL TESTS FAILED"
fi
echo "============================================"

exit $FAIL
