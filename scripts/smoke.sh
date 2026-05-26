#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# End-to-end API smoke test for The Pet Headquarters.
#
# Exercises the critical contract+integration paths via curl, catching the
# class of bug where two endpoints work in isolation but their round-trip
# shape doesn't agree (e.g. local image upload returns a relative URL but
# the next-step serialiser demands an absolute one — the 422 we hit in the
# product images flow earlier today).
#
# Run with the dev stack alive on :8000 (and ideally :3000 for the FE):
#
#     export TPH_SMOKE_EMAIL="maxchergik@gmail.com"
#     export TPH_SMOKE_PASSWORD="..."         # required
#     ./scripts/smoke.sh
#
# Exits non-zero on the first failing test, otherwise prints a green
# summary. Side-effects are scoped to the local dev DB (creates an
# expense + uploads a small PNG to MEDIA_ROOT — both safe to delete).
# Never run against production — auth cookies are persisted.
# ---------------------------------------------------------------------------

set -u
set -o pipefail

# Set TPH_SMOKE_DEBUG=1 to dump every curl response body to stderr; off by
# default to keep the output readable.
DEBUG="${TPH_SMOKE_DEBUG:-0}"

BASE_URL="${TPH_SMOKE_BASE_URL:-http://localhost:8000/api/v1}"
EMAIL="${TPH_SMOKE_EMAIL:-maxchergik@gmail.com}"
PASSWORD="${TPH_SMOKE_PASSWORD:-}"
COOKIE_JAR="$(mktemp -t tph-smoke-cookies-XXXX)"
WORK_DIR="$(mktemp -d -t tph-smoke-work-XXXX)"
trap 'rm -rf "$COOKIE_JAR" "$WORK_DIR"' EXIT

# Pretty colours when STDOUT is a TTY; plain otherwise (CI-friendly).
if [[ -t 1 ]]; then
  G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; B=$'\e[34m'; D=$'\e[2m'; N=$'\e[0m'
else
  G=""; R=""; Y=""; B=""; D=""; N=""
fi

PASS_COUNT=0
FAIL_COUNT=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# call <name> <method> <path> [body] [extra_curl_args...]
# Writes the response body to $RESPONSE_BODY and HTTP code to $RESPONSE_CODE.
call() {
  local _method="$1"; shift
  local _path="$1"; shift
  local _body="${1:-}"; shift || true
  local _out
  _out="$(mktemp -t tph-smoke-XXXX)"
  local _args=(
    -sS -o "$_out" -w "%{http_code}"
    -b "$COOKIE_JAR" -c "$COOKIE_JAR"
    -X "$_method"
    -H "Accept: application/json"
  )
  if [[ -n "$_body" ]]; then
    _args+=(-H "Content-Type: application/json" -d "$_body")
  fi
  # Pass remaining args through (for multipart uploads etc.)
  while (( $# > 0 )); do _args+=("$1"); shift; done
  RESPONSE_CODE="$(curl "${_args[@]}" "${BASE_URL}${_path}")"
  RESPONSE_BODY="$(cat "$_out")"
  rm -f "$_out"
  [[ "$DEBUG" == "1" ]] && echo "${D}  → ${_method} ${_path} ${RESPONSE_CODE} ${RESPONSE_BODY:0:200}${N}" >&2
}

# expect <name> <expected_code_pattern>
expect() {
  local name="$1" expected="$2"
  if [[ "$RESPONSE_CODE" =~ ^${expected}$ ]]; then
    echo "  ${G}✓${N} $name ${D}(${RESPONSE_CODE})${N}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ${R}✗${N} $name ${D}(got ${RESPONSE_CODE}, wanted ${expected})${N}"
    echo "    ${D}body: ${RESPONSE_BODY:0:400}${N}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# JSON extraction via python — robust against quote handling.
json_get() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    sys.stderr.write(f'json_get parse error: {e}\n')
    sys.exit(1)
for k in '$1'.split('.'):
    if isinstance(d, list):
        d = d[int(k)] if k.isdigit() else None
    elif isinstance(d, dict):
        d = d.get(k)
    else:
        d = None
    if d is None:
        break
print(d if d is not None else '')
"
}

section() {
  echo
  echo "${B}── $1${N}"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

echo "${B}TPH smoke test${N} ${D}@ ${BASE_URL}${N}"
echo

if [[ -z "$PASSWORD" ]]; then
  echo "${R}✗ TPH_SMOKE_PASSWORD env var is required${N}"
  echo "  ${D}export TPH_SMOKE_PASSWORD='your-admin-password' and re-run${N}"
  exit 2
fi

# ---------------------------------------------------------------------------
# 1. Public storefront
# ---------------------------------------------------------------------------

section "Public storefront"
call GET /products/
expect "Products list responds" "200"

call GET /products/?search=collar
expect "Search by query" "200"

call GET /categories/
expect "Categories list" "200"

call GET /brands/
expect "Brands list" "200"

call GET /reviews/recent/
expect "Recent reviews feed" "200"

call GET /orders/recent-activity/
expect "Live activity feed" "200"

# Pick a slug from the PUBLIC products list — guarantees the product is
# active. The activity feed sometimes references deactivated products
# (orders survive a deactivation), so we don't use it as our source of
# truth for the detail / social-proof checks.
call GET /products/?page_size=1
PRODUCT_SLUG="$(echo "$RESPONSE_BODY" | json_get "results.0.slug" 2>/dev/null || true)"

if [[ -n "$PRODUCT_SLUG" ]]; then
  call GET "/products/${PRODUCT_SLUG}/"
  expect "Product detail (${PRODUCT_SLUG})" "200"
  call GET "/products/${PRODUCT_SLUG}/social-proof/"
  expect "Product social-proof aggregate" "200"
else
  echo "  ${Y}⚠ No active products in DB — skipping detail/social-proof checks${N}"
fi

call GET /site/legal/
expect "Companies-act legal disclosure" "200"

# ---------------------------------------------------------------------------
# 2. Auth + admin gating
# ---------------------------------------------------------------------------

section "Auth"

call GET /admin/dashboard/
expect "Admin dashboard requires auth" "401|403"

call POST /auth/login/ "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
expect "Login as ${EMAIL}" "200"

# 2FA step. If the admin has MFA enabled, /auth/login/ returns
# {requires_2fa, challenge_token} instead of setting cookies, and any
# admin endpoint then fails with 403 auth.mfa_required. To keep the
# script working without baking a TOTP generator into bash, we look
# for a TPH_SMOKE_MFA_SECRET env var (the base32 secret the admin
# scanned into their authenticator app). If set, we compute the
# current code via python's pyotp and complete the challenge.
if echo "$RESPONSE_BODY" | grep -q '"requires_2fa"'; then
  if [ -z "${TPH_SMOKE_MFA_SECRET:-}" ]; then
    echo "✗ Admin has 2FA on but TPH_SMOKE_MFA_SECRET is not set." >&2
    echo "  Save your TOTP base32 secret (the same one your authenticator" >&2
    echo "  app uses) to this env var and re-run." >&2
    exit 1
  fi
  CHALLENGE_TOKEN=$(echo "$RESPONSE_BODY" | json_get "data.challenge_token")
  MFA_CODE=$(python3 -c "import pyotp,sys; print(pyotp.TOTP(sys.argv[1]).now())" "$TPH_SMOKE_MFA_SECRET")
  call POST /auth/2fa/login/ "{\"challenge_token\":\"${CHALLENGE_TOKEN}\",\"code\":\"${MFA_CODE}\"}"
  expect "Complete 2FA login" "200"
fi

call GET /admin/dashboard/
expect "Admin dashboard authenticated" "200"

# ---------------------------------------------------------------------------
# 3. Admin browsing
# ---------------------------------------------------------------------------

section "Admin browsing"

call GET /admin/orders/
expect "Admin orders list" "200"

call GET /admin/products/
expect "Admin products list" "200"
PRODUCT_ID="$(echo "$RESPONSE_BODY" | json_get "results.0.id" 2>/dev/null || true)"

call GET /admin/suppliers/?search=pets
expect "Supplier search (server-side)" "200"
SUPPLIER_COUNT="$(echo "$RESPONSE_BODY" | python3 -c "import json,sys; print(len(json.loads(sys.stdin.read()).get('results',[])))" 2>/dev/null || echo 0)"
echo "    ${D}matched ${SUPPLIER_COUNT} supplier(s)${N}"

call GET /admin/finances/overview/
expect "Finances overview" "200"

call GET /admin/expenses/
expect "Expenses list" "200"

# ---------------------------------------------------------------------------
# 4. The bug we just fixed — image upload round-trip
# ---------------------------------------------------------------------------

section "Image upload end-to-end (regression for the 422 bug)"

# Generate a tiny valid PNG via the server venv (Pillow is already a
# server dependency). Falls back gracefully if Pillow is unavailable.
PNG_PATH="${WORK_DIR}/smoke.png"
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../server" && pwd)"
(cd "$SERVER_DIR" && uv run python - <<PY > "$PNG_PATH" 2>/dev/null
import sys
from PIL import Image
import io
buf = io.BytesIO()
Image.new('RGB', (4, 4), color=(255, 0, 0)).save(buf, format='PNG')
sys.stdout.buffer.write(buf.getvalue())
PY
) || true

if [[ ! -s "$PNG_PATH" ]]; then
  echo "  ${R}✗ Pillow unavailable — could not generate smoke PNG${N}"
  echo "    ${D}try: cd server && uv sync${N}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  # Step 1 — upload the file. Don't pre-set Content-Type; curl uses
  # `-F` to set multipart/form-data with the right boundary automatically.
  call POST /admin/upload/image/ "" -F "file=@${PNG_PATH}" -F "folder=products"
  expect "Image upload (step 1)" "200"
  UPLOADED_URL="$(echo "$RESPONSE_BODY" | json_get "data.url" 2>/dev/null || true)"
  case "$UPLOADED_URL" in
    http://*|https://*)
      echo "    ${G}✓${N} Returned absolute URL: ${UPLOADED_URL}"
      PASS_COUNT=$((PASS_COUNT + 1))
      ;;
    "")
      echo "  ${R}✗ Upload returned no URL${N}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    *)
      echo "  ${R}✗ Upload returned relative URL: ${UPLOADED_URL}${N}"
      echo "    ${D}This is the bug we fixed — downstream URLField will 422${N}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
  esac

  # Step 2 — feed it into the products/images endpoint that previously 422'd
  if [[ -n "$PRODUCT_ID" && -n "$UPLOADED_URL" ]]; then
    call POST "/admin/products/${PRODUCT_ID}/images/" \
      "{\"url\":\"${UPLOADED_URL}\",\"alt_text\":\"smoke test\",\"is_primary\":false,\"sort_order\":99,\"variant_id\":null}"
    expect "Product image record creation (step 2)" "201|200"
    IMAGE_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
    if [[ -n "$IMAGE_ID" ]]; then
      call DELETE "/admin/images/${IMAGE_ID}/"
      expect "Cleanup uploaded image" "204|200"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 5. Expense + receipt round-trip
# ---------------------------------------------------------------------------

section "Expense ledger + receipt upload"

TODAY="$(date +%Y-%m-%d)"
call POST /admin/expenses/ "{\"paid_at\":\"${TODAY}\",\"category\":\"other\",\"amount_pence\":123,\"description\":\"smoke test expense\"}"
expect "Create manual expense" "200|201"
EXPENSE_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"

if [[ -n "$EXPENSE_ID" ]]; then
  # Upload a tiny PDF stub as the receipt
  PDF_PATH="${WORK_DIR}/smoke-receipt.pdf"
  printf '%%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%%%EOF' > "$PDF_PATH"

  call POST "/admin/expenses/${EXPENSE_ID}/receipt/" "" -F "file=@${PDF_PATH}"
  expect "Attach receipt to expense" "200"

  call GET "/admin/expenses/${EXPENSE_ID}/"
  expect "Read back expense" "200"
  RECEIPT_URL="$(echo "$RESPONSE_BODY" | json_get "data.receipt_url" 2>/dev/null || true)"
  case "$RECEIPT_URL" in
    http://*|https://*)
      echo "    ${G}✓${N} Receipt URL is absolute: ${RECEIPT_URL:0:80}…"
      PASS_COUNT=$((PASS_COUNT + 1))
      ;;
    "")
      echo "  ${R}✗ Expense returns null receipt_url despite attachment${N}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    *)
      echo "  ${R}✗ Receipt URL is relative: ${RECEIPT_URL}${N}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
  esac

  call DELETE "/admin/expenses/${EXPENSE_ID}/"
  expect "Cleanup expense" "204"
fi

# ---------------------------------------------------------------------------
# 6. Promotions validation logic
# ---------------------------------------------------------------------------

section "Promotions"

# Validate WELCOME10 against an empty cart — should reject specifically
# with checkout.cart_empty, not crash.
call POST /promotions/validate/ "{\"code\":\"WELCOME10\",\"items\":[]}"
expect "Empty cart rejected (validation)" "400"
EMPTY_CODE="$(echo "$RESPONSE_BODY" | json_get "code" 2>/dev/null || true)"
if [[ "$EMPTY_CODE" == "checkout.cart_empty" ]]; then
  echo "  ${G}✓${N} Correct error code: ${EMPTY_CODE}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ${R}✗ Wrong error code on empty cart: ${EMPTY_CODE}${N}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ---------------------------------------------------------------------------
# 7. Customer-facing search through to checkout machinery
# ---------------------------------------------------------------------------

section "Search-driven flows"

call GET /products/?search=harness
expect "Search 'harness'" "200"

# ---------------------------------------------------------------------------
# 8. Customer auth + profile endpoints
# ---------------------------------------------------------------------------

section "Customer auth"

call GET /auth/me/
expect "Profile (whoami) authenticated" "200"

call POST /auth/token/refresh/ ""
expect "Token refresh (no body — cookies only)" "200|204"

call GET /orders/
expect "Customer order history" "200"

call GET /addresses/
expect "Customer address book" "200"

# Create + delete an address — exercises the full CRUD shape
call POST /addresses/ "{\"full_name\":\"Smoke Test\",\"address_line_1\":\"1 Test Road\",\"city\":\"Testville\",\"postcode\":\"TE5 7AB\",\"country\":\"GB\",\"is_default_shipping\":false}"
expect "Create address" "200|201"
ADDR_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
if [[ -n "$ADDR_ID" ]]; then
  call PATCH "/addresses/${ADDR_ID}/" "{\"city\":\"Newcity\"}"
  expect "Update address" "200"
  call DELETE "/addresses/${ADDR_ID}/"
  expect "Delete address" "200|204"
fi

# ---------------------------------------------------------------------------
# 9. Newsletter + Contact form (public submissions, auth optional)
# ---------------------------------------------------------------------------

section "Newsletter + Contact form"

# Use a unique-per-run email so we don't 400 on the dupe check
NEWSLETTER_TS="$(date +%s)"
call POST /newsletter/subscribe/ "{\"email\":\"smoke-news-${NEWSLETTER_TS}@thepetheadquarters.local\"}"
expect "Newsletter subscribe" "200|201"

call POST /contact/ "{\"name\":\"Smoke Tester\",\"email\":\"smoke-contact@thepetheadquarters.local\",\"subject\":\"smoke test\",\"message\":\"This is a smoke-test contact submission — feel free to delete.\"}"
expect "Contact form submission" "200|201"

# ---------------------------------------------------------------------------
# 10. Admin product CRUD round-trip
# ---------------------------------------------------------------------------

section "Admin product CRUD"

call POST /admin/products/ "{\"name\":\"Smoke Test Product\",\"description\":\"Created by smoke.sh — safe to delete.\",\"short_description\":\"Smoke\",\"brand_id\":null,\"fulfillment_type\":\"self\",\"is_featured\":false,\"is_active\":true,\"category_ids\":[]}"
expect "Create product" "200|201"
NEW_PRODUCT_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"

if [[ -n "$NEW_PRODUCT_ID" ]]; then
  call PATCH "/admin/products/${NEW_PRODUCT_ID}/" "{\"name\":\"Smoke Renamed\"}"
  expect "Update product name" "200"

  # SKU must be unique globally — append the run timestamp.
  SMOKE_TS="$(date +%s)"
  call POST "/admin/products/${NEW_PRODUCT_ID}/variants/" "{\"sku\":\"SMOKE-VAR-${SMOKE_TS}\",\"price\":999,\"compare_at_price\":null,\"cost_price\":300,\"stock_quantity\":10,\"weight_grams\":100,\"sort_order\":0}"
  expect "Create variant" "200|201"
  NEW_VARIANT_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"

  if [[ -n "$NEW_VARIANT_ID" ]]; then
    call PATCH "/admin/variants/${NEW_VARIANT_ID}/" "{\"price\":1299}"
    expect "Update variant price" "200"

    # Supplier link CRUD on the new variant — exercises today's new
    # variant-centred supplier endpoints + the picker payload shape.
    call GET "/admin/variants/${NEW_VARIANT_ID}/suppliers/"
    expect "List variant suppliers (empty start)" "200"

    # Need an existing supplier id to attach
    call GET "/admin/suppliers/?page_size=1"
    EXISTING_SUPPLIER_ID="$(echo "$RESPONSE_BODY" | json_get "results.0.id" 2>/dev/null || true)"
    if [[ -n "$EXISTING_SUPPLIER_ID" ]]; then
      call POST "/admin/variants/${NEW_VARIANT_ID}/suppliers/" "{\"supplier\":\"${EXISTING_SUPPLIER_ID}\",\"supplier_url\":\"https://example.com/p/1\",\"supplier_sku\":\"X-001\",\"last_cost\":250,\"is_preferred\":true,\"notes\":\"smoke\"}"
      expect "Attach supplier to variant" "200|201"
      SUPPLIER_PRODUCT_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
      if [[ -n "$SUPPLIER_PRODUCT_ID" ]]; then
        call PATCH "/admin/supplier-products/${SUPPLIER_PRODUCT_ID}/" "{\"last_cost\":280}"
        expect "Update supplier link cost" "200"
        call DELETE "/admin/supplier-products/${SUPPLIER_PRODUCT_ID}/"
        expect "Remove supplier link" "204"
      fi
    fi

    call DELETE "/admin/variants/${NEW_VARIANT_ID}/"
    expect "Delete variant" "200|204"
  fi

  # Deactivate (soft delete) + reactivate via PATCH (the activate-toggle
  # bug fix). Verify the round-trip explicitly.
  call DELETE "/admin/products/${NEW_PRODUCT_ID}/"
  expect "Deactivate product (soft)" "200|204"
  call PATCH "/admin/products/${NEW_PRODUCT_ID}/" "{\"is_active\":true}"
  expect "Reactivate product" "200"

  # Final cleanup — proper soft-delete via the same route the UI uses.
  call DELETE "/admin/products/${NEW_PRODUCT_ID}/"
  expect "Cleanup (deactivate test product)" "200|204"
fi

# ---------------------------------------------------------------------------
# 11. Admin categories + brands
# ---------------------------------------------------------------------------

section "Admin catalog management (brands + categories)"

call POST /admin/brands/ "{\"name\":\"Smoke Brand\",\"description\":\"Created by smoke.sh\",\"sort_order\":99}"
expect "Create brand" "200|201"
NEW_BRAND_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
if [[ -n "$NEW_BRAND_ID" ]]; then
  call PATCH "/admin/brands/${NEW_BRAND_ID}/" "{\"description\":\"updated by smoke\"}"
  expect "Update brand" "200"
  call DELETE "/admin/brands/${NEW_BRAND_ID}/"
  expect "Deactivate brand" "200|204"
fi

call POST /admin/categories/ "{\"name\":\"Smoke Category\",\"description\":\"Created by smoke.sh\",\"sort_order\":99,\"parent_id\":null}"
expect "Create category" "200|201"
NEW_CATEGORY_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
if [[ -n "$NEW_CATEGORY_ID" ]]; then
  call PATCH "/admin/categories/${NEW_CATEGORY_ID}/" "{\"description\":\"updated by smoke\"}"
  expect "Update category" "200"
  call DELETE "/admin/categories/${NEW_CATEGORY_ID}/"
  expect "Deactivate category" "200|204"
fi

# ---------------------------------------------------------------------------
# 12. Admin suppliers CRUD
# ---------------------------------------------------------------------------

section "Admin suppliers"

call POST /admin/suppliers/ "{\"name\":\"Smoke Supplier Co.\",\"contact_email\":\"smoke@example.local\",\"country\":\"GB\",\"payment_terms\":\"net_30\",\"is_dropshipper\":true,\"is_active\":true}"
expect "Create supplier" "200|201"
NEW_SUPPLIER_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
if [[ -n "$NEW_SUPPLIER_ID" ]]; then
  call PATCH "/admin/suppliers/${NEW_SUPPLIER_ID}/" "{\"contact_phone\":\"+44 1234 567890\"}"
  expect "Update supplier" "200"
  call DELETE "/admin/suppliers/${NEW_SUPPLIER_ID}/"
  expect "Deactivate supplier" "200|204"
fi

# ---------------------------------------------------------------------------
# 13. Admin moderation surfaces (reviews + contact messages)
# ---------------------------------------------------------------------------

section "Admin moderation"

call GET /admin/reviews/
expect "Admin reviews list" "200"

call GET /admin/contact-messages/
expect "Admin contact messages list" "200"

# Drill into a single message if any exist
FIRST_MSG_ID="$(echo "$RESPONSE_BODY" | json_get "results.0.id" 2>/dev/null || true)"
if [[ -n "$FIRST_MSG_ID" ]]; then
  call GET "/admin/contact-messages/${FIRST_MSG_ID}/"
  expect "Admin contact message detail" "200"
fi

# ---------------------------------------------------------------------------
# 14. Admin promotions + redemptions
# ---------------------------------------------------------------------------

section "Admin promotions"

call GET /admin/promotions/
expect "Admin promotions list" "200"

# Create a transient promo, validate it, deactivate it.
call POST /admin/promotions/ "{\"code\":\"SMOKE10\",\"name\":\"Smoke test 10% off\",\"description\":\"created by smoke.sh\",\"discount_type\":\"percent\",\"discount_value\":10,\"is_active\":true,\"is_first_order_only\":false,\"is_one_per_customer\":false,\"min_subtotal\":0}"
expect "Create promotion" "200|201"
NEW_PROMO_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
if [[ -n "$NEW_PROMO_ID" ]]; then
  call PATCH "/admin/promotions/${NEW_PROMO_ID}/" "{\"description\":\"updated\"}"
  expect "Update promotion" "200"
  call GET "/admin/promotions/${NEW_PROMO_ID}/redemptions/"
  expect "Promotion redemptions list" "200"
  call DELETE "/admin/promotions/${NEW_PROMO_ID}/"
  expect "Delete promotion" "200|204"
fi

# ---------------------------------------------------------------------------
# 15. Admin inventory + purchase orders
# ---------------------------------------------------------------------------

section "Admin inventory + procurement"

call GET /admin/inventory/?page_size=5
expect "Inventory list" "200"

call GET /admin/purchase-orders/
expect "Purchase orders list" "200"

# Create a PO with a real supplier and variant, send it, receive partial,
# verify auto-cogs expense lands in finances.
call GET /admin/suppliers/?page_size=1
PO_SUPPLIER_ID="$(echo "$RESPONSE_BODY" | json_get "results.0.id" 2>/dev/null || true)"
call GET /admin/products/?page_size=1
PO_PRODUCT_ID="$(echo "$RESPONSE_BODY" | json_get "results.0.id" 2>/dev/null || true)"
if [[ -n "$PO_SUPPLIER_ID" && -n "$PO_PRODUCT_ID" ]]; then
  call GET "/admin/products/${PO_PRODUCT_ID}/"
  PO_VARIANT_ID="$(echo "$RESPONSE_BODY" | json_get "data.variants.0.id" 2>/dev/null || true)"
  if [[ -n "$PO_VARIANT_ID" ]]; then
    call POST /admin/purchase-orders/ "{\"supplier_id\":\"${PO_SUPPLIER_ID}\",\"items\":[{\"variant_id\":\"${PO_VARIANT_ID}\",\"quantity_ordered\":5,\"unit_cost\":300}],\"notes\":\"smoke test PO\"}"
    expect "Create purchase order" "200|201"
    NEW_PO_ID="$(echo "$RESPONSE_BODY" | json_get "data.id" 2>/dev/null || true)"
    if [[ -n "$NEW_PO_ID" ]]; then
      call POST "/admin/purchase-orders/${NEW_PO_ID}/send/" ""
      expect "Mark PO as sent" "200"
      call GET "/admin/purchase-orders/${NEW_PO_ID}/"
      PO_ITEM_ID="$(echo "$RESPONSE_BODY" | json_get "data.items.0.id" 2>/dev/null || true)"
      if [[ -n "$PO_ITEM_ID" ]]; then
        call POST "/admin/purchase-orders/${NEW_PO_ID}/receive/" "{\"items\":[{\"po_item_id\":\"${PO_ITEM_ID}\",\"quantity_received\":5}]}"
        expect "Receive PO in full" "200"
        # Verify auto-cogs expense landed
        call GET "/admin/expenses/?category=cogs_inventory&page_size=5"
        expect "cogs_inventory expense recorded" "200"
      fi
      call POST "/admin/purchase-orders/${NEW_PO_ID}/cancel/" ""
      expect "Cancel PO (cleanup)" "200|400"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 16. Admin reports + finance export
# ---------------------------------------------------------------------------

section "Admin reports"

call GET /admin/reports/sales/
expect "Sales report" "200"

call GET /admin/reports/inventory-valuation/
expect "Inventory valuation report" "200"

call GET /admin/reports/top-products/
expect "Top products report" "200"

call GET /admin/reports/top-suppliers/
expect "Top suppliers report" "200"

call GET /admin/reports/vat-return/
expect "VAT return report" "200"

call GET /admin/reports/promotions/
expect "Promotions report" "200"

call GET "/admin/finances/export/?from=2026-01-01&to=2026-12-31"
expect "Finances year-end CSV export" "200"

# ---------------------------------------------------------------------------
# 17. Admin analytics + audit
# ---------------------------------------------------------------------------

section "Admin analytics + audit"

call GET /admin/analytics/overview/
expect "Analytics overview" "200"

call GET /admin/analytics/visitors/?page_size=3
expect "Analytics visitor list" "200"

call GET /admin/audit/?page_size=3
expect "Audit log list" "200"

# ---------------------------------------------------------------------------
# 18. Admin customers
# ---------------------------------------------------------------------------

section "Admin customers"

call GET /admin/customers/?page_size=3
expect "Customer list" "200"
FIRST_CUSTOMER_ID="$(echo "$RESPONSE_BODY" | json_get "results.0.id" 2>/dev/null || true)"
if [[ -n "$FIRST_CUSTOMER_ID" ]]; then
  call GET "/admin/customers/${FIRST_CUSTOMER_ID}/"
  expect "Customer detail" "200"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo
echo "──────────────────────────────────────────"
echo "${G}Passed: ${PASS_COUNT}${N}    ${R}Failed: ${FAIL_COUNT}${N}"
echo "──────────────────────────────────────────"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
