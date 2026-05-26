"""
RBAC catalogue for the admin panel.

Three pieces:

  1. `PERMISSIONS` — the full set of permission codes (source of truth
     for what permissions exist in the system). Adding a new admin
     endpoint means picking a code from here (or adding one).

  2. `PERMISSION_GROUPS` — the same codes, grouped + labelled for the
     UI. The Owner sees this when editing a custom role: collapsible
     sections per resource, each with labelled checkboxes. The
     backend exposes it via /admin/roles/catalogue/ so the frontend
     doesn't have to duplicate it.

  3. `permissions_for_role(code)` — runtime lookup. Reads from the
     DB-backed Role table. Owner is the one special case: it always
     returns the live PERMISSIONS set so newly added codes auto-grant
     to Owner without needing a migration. Custom roles return
     exactly the codes saved on their record.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Permission codes — full catalogue.
#
# Pattern: <resource>.<action>. Actions cover:
#   - view    → read access (list + detail)
#   - update  → create + edit; non-destructive write
#   - delete  → remove (only when destructive enough for its own gate)
#   - <verb>  → domain-specific actions (refund, ship, cancel, …)
#
# This set is the only thing the UI lets Owners check off — Owners
# can't invent new permission strings, only bundle existing ones.
# ---------------------------------------------------------------------------
PERMISSIONS: set[str] = {
    # Products / variants / images / options / customizations
    "products.view",
    "products.update",
    "products.delete",
    # Orders + fulfilment
    "orders.view",
    "orders.update",
    "orders.ship",
    "orders.refund",
    "orders.cancel",
    # Customers
    "customers.view",
    "customers.update",
    # Inventory adjustments / batches / movements
    "inventory.view",
    "inventory.update",
    # Suppliers + supplier-product links
    "suppliers.view",
    "suppliers.update",
    "suppliers.delete",
    # Purchase orders
    "purchase_orders.view",
    "purchase_orders.update",
    "purchase_orders.receive",
    "purchase_orders.cancel",
    # Brands + categories (catalog meta)
    "catalog.view",
    "catalog.update",
    "catalog.delete",
    # Promotions / discount codes
    "promotions.view",
    "promotions.update",
    "promotions.delete",
    # Reviews moderation
    "reviews.view",
    "reviews.moderate",
    "reviews.delete",
    # Contact form submissions
    "contact.view",
    "contact.respond",
    # Analytics + visitor sessions
    "analytics.view",
    # Reports (sales, VAT, inventory valuation, …)
    "reports.view",
    "reports.export",
    # Finances overview + exports
    "finances.view",
    "finances.export",
    # Business expenses (Stripe-side cost tracking)
    "expenses.view",
    "expenses.update",
    "expenses.delete",
    # Audit log
    "audit.view",
    # Team / RBAC management
    "team.view",
    "team.manage",
    # Third-party integrations (Telegram, etc.)
    "integrations.view",
    "integrations.update",
}


# ---------------------------------------------------------------------------
# Role code constants — the slugs used on User.role and Role.code.
# System role codes are reserved (see Role.is_system); custom roles
# can use any slug but must not collide with these.
# ---------------------------------------------------------------------------
ROLE_OWNER = "OWNER"
ROLE_ORDER_MANAGER = "ORDER_MANAGER"
ROLE_INVENTORY_MANAGER = "INVENTORY_MANAGER"
ROLE_MARKETING = "MARKETING"
ROLE_AUDITOR = "AUDITOR"

SYSTEM_ROLE_CODES = {
    ROLE_OWNER,
    ROLE_ORDER_MANAGER,
    ROLE_INVENTORY_MANAGER,
    ROLE_MARKETING,
    ROLE_AUDITOR,
}


# ---------------------------------------------------------------------------
# Permission groups — UI-facing structure.
#
# Each group has:
#   - code:        url-safe id, used by the frontend for keys
#   - label:       what shows as the section heading
#   - description: shown under the heading to clarify what the section
#                  covers (e.g. "everything to do with refunds and
#                  fulfilment")
#   - permissions: ordered list of {code, label, hint} describing each
#                  checkbox under the section
#
# Order matters — this is the order rendered in the editor. Group order
# follows the most-used → least-used flow from typical admin work.
# ---------------------------------------------------------------------------
PERMISSION_GROUPS: list[dict] = [
    {
        "code": "orders",
        "label": "Orders",
        "description": "Sales, fulfilment, refunds, customer support.",
        "permissions": [
            {"code": "orders.view", "label": "View orders", "hint": "See the list and detail of every order."},
            {"code": "orders.update", "label": "Edit orders", "hint": "Change status, internal notes, and email the customer."},
            {"code": "orders.ship", "label": "Ship orders", "hint": "Mark as shipped + forward dropship items to suppliers."},
            {"code": "orders.refund", "label": "Refund orders", "hint": "Process a Stripe refund. Irreversible."},
            {"code": "orders.cancel", "label": "Cancel orders", "hint": "Cancel a paid order without refunding."},
        ],
    },
    {
        "code": "products",
        "label": "Products",
        "description": "Catalogue editing — products, variants, images, options, customisations.",
        "permissions": [
            {"code": "products.view", "label": "View products", "hint": "See the product catalogue."},
            {"code": "products.update", "label": "Edit products", "hint": "Create + edit products, variants, images, option types, customisations."},
            {"code": "products.delete", "label": "Delete products", "hint": "Hard-delete a product. Inventory rows survive."},
        ],
    },
    {
        "code": "inventory",
        "label": "Inventory",
        "description": "Stock levels, batches, and movement history.",
        "permissions": [
            {"code": "inventory.view", "label": "View inventory", "hint": "See stock levels, batches, and stock movement history."},
            {"code": "inventory.update", "label": "Adjust inventory", "hint": "Manually correct stock counts."},
        ],
    },
    {
        "code": "suppliers",
        "label": "Suppliers",
        "description": "Where the stock comes from.",
        "permissions": [
            {"code": "suppliers.view", "label": "View suppliers", "hint": "Supplier directory + their products."},
            {"code": "suppliers.update", "label": "Edit suppliers", "hint": "Add suppliers, edit contact details, manage supplier-product links."},
            {"code": "suppliers.delete", "label": "Delete suppliers", "hint": "Soft-delete a supplier (deactivate)."},
        ],
    },
    {
        "code": "purchase_orders",
        "label": "Purchase orders",
        "description": "POs sent to suppliers; receiving + cancelling.",
        "permissions": [
            {"code": "purchase_orders.view", "label": "View POs", "hint": "See open and historical purchase orders."},
            {"code": "purchase_orders.update", "label": "Create & edit POs", "hint": "Draft a PO, edit drafts, send to supplier."},
            {"code": "purchase_orders.receive", "label": "Receive POs", "hint": "Confirm stock arrived; auto-bumps inventory."},
            {"code": "purchase_orders.cancel", "label": "Cancel POs", "hint": "Cancel an unreceived PO."},
        ],
    },
    {
        "code": "customers",
        "label": "Customers",
        "description": "Customer accounts + their order history.",
        "permissions": [
            {"code": "customers.view", "label": "View customers", "hint": "Customer list + per-customer detail page."},
            {"code": "customers.update", "label": "Edit customers", "hint": "Toggle active status, change basic details."},
        ],
    },
    {
        "code": "catalog",
        "label": "Brands & categories",
        "description": "Catalog metadata — brand list, category tree.",
        "permissions": [
            {"code": "catalog.view", "label": "View brands & categories", "hint": "Read the brand list and category tree."},
            {"code": "catalog.update", "label": "Edit brands & categories", "hint": "Add / rename / reorder brands and categories."},
            {"code": "catalog.delete", "label": "Delete brands & categories", "hint": "Soft-delete a brand or category."},
        ],
    },
    {
        "code": "promotions",
        "label": "Promotions",
        "description": "Discount codes + campaign tracking.",
        "permissions": [
            {"code": "promotions.view", "label": "View promotions", "hint": "List active and historical promo codes."},
            {"code": "promotions.update", "label": "Create & edit promotions", "hint": "Create new codes, edit existing campaigns."},
            {"code": "promotions.delete", "label": "Delete promotions", "hint": "Remove unused codes; used codes are deactivated instead."},
        ],
    },
    {
        "code": "reviews",
        "label": "Reviews",
        "description": "Customer review moderation.",
        "permissions": [
            {"code": "reviews.view", "label": "View reviews", "hint": "See all customer reviews."},
            {"code": "reviews.moderate", "label": "Moderate reviews", "hint": "Hide / unhide reviews, post admin replies."},
            {"code": "reviews.delete", "label": "Delete reviews", "hint": "Permanent removal."},
        ],
    },
    {
        "code": "contact",
        "label": "Contact messages",
        "description": "Inbound enquiries from the public contact form.",
        "permissions": [
            {"code": "contact.view", "label": "View messages", "hint": "Read incoming contact form submissions."},
            {"code": "contact.respond", "label": "Respond & manage", "hint": "Mark read / unread, delete spam, reply to the customer."},
        ],
    },
    {
        "code": "analytics",
        "label": "Analytics",
        "description": "Storefront traffic + per-visitor session data.",
        "permissions": [
            {"code": "analytics.view", "label": "View analytics", "hint": "Overview dashboard + visitor session detail."},
        ],
    },
    {
        "code": "reports",
        "label": "Reports",
        "description": "Sales, VAT, inventory valuation, promo performance.",
        "permissions": [
            {"code": "reports.view", "label": "View reports", "hint": "All report dashboards."},
            {"code": "reports.export", "label": "Export reports as CSV", "hint": "Download sales / VAT CSV files. Useful for accountants."},
        ],
    },
    {
        "code": "finances",
        "label": "Finances",
        "description": "P&L overview + year-end exports.",
        "permissions": [
            {"code": "finances.view", "label": "View financials", "hint": "Revenue, COGS, expenses, profit overview."},
            {"code": "finances.export", "label": "Export finances", "hint": "Year-end CSV combining revenue + every expense."},
        ],
    },
    {
        "code": "expenses",
        "label": "Expenses",
        "description": "Business expense ledger.",
        "permissions": [
            {"code": "expenses.view", "label": "View expenses", "hint": "List expenses, view receipts."},
            {"code": "expenses.update", "label": "Add & edit expenses", "hint": "Create new expense entries + attach receipts."},
            {"code": "expenses.delete", "label": "Delete expenses", "hint": "Remove manually-created expenses (auto-rows are protected)."},
        ],
    },
    {
        "code": "audit",
        "label": "Audit log",
        "description": "Who-did-what trail.",
        "permissions": [
            {"code": "audit.view", "label": "View audit log", "hint": "Read the immutable record of every admin action."},
        ],
    },
    {
        "code": "team",
        "label": "Team & roles",
        "description": "Manage staff accounts and the RBAC system itself.",
        "permissions": [
            {"code": "team.view", "label": "View team", "hint": "List staff and see who has which role."},
            {"code": "team.manage", "label": "Manage team & roles", "hint": "Create / edit custom roles. Assign roles to admins. Owner-only by default."},
        ],
    },
    {
        "code": "integrations",
        "label": "Integrations",
        "description": "Third-party services (Telegram alerts, …).",
        "permissions": [
            {"code": "integrations.view", "label": "View integrations", "hint": "See connected services + current config."},
            {"code": "integrations.update", "label": "Configure integrations", "hint": "Add / remove integrations, run discovery, send test messages."},
        ],
    },
]


# Sanity check at import time: every permission listed in a group must
# exist in the catalogue, and every catalogue code must appear in some
# group. Catches typos and missing UI entries before they ship.
def _assert_catalogue_consistent() -> None:
    grouped: set[str] = set()
    for group in PERMISSION_GROUPS:
        for p in group["permissions"]:
            grouped.add(p["code"])
    unknown = grouped - PERMISSIONS
    if unknown:
        raise AssertionError(
            f"PERMISSION_GROUPS references unknown codes: {sorted(unknown)}"
        )
    ungrouped = PERMISSIONS - grouped
    if ungrouped:
        raise AssertionError(
            f"PERMISSIONS contains codes missing from PERMISSION_GROUPS "
            f"(add to the UI catalogue): {sorted(ungrouped)}"
        )


_assert_catalogue_consistent()


# ---------------------------------------------------------------------------
# Runtime lookup.
# ---------------------------------------------------------------------------
def permissions_for_role(code: str | None) -> set[str]:
    """
    Resolve a role code to its permission set.

    Owner is the special case: always returns the live PERMISSIONS set
    so a newly added code in the catalogue automatically grants to
    Owner without a migration to update the Role row. Every other
    role returns exactly what's stored on its Role record.

    Unknown / None / non-existent role → empty set (deny everything).
    """
    if not code:
        return set()
    if code == ROLE_OWNER:
        return set(PERMISSIONS)
    # Lazy import to avoid circular: this module is imported by models.py.
    from apps.accounts.models import Role
    try:
        role = Role.objects.get(code=code)
    except Role.DoesNotExist:
        return set()
    # Defensive copy + filter to the catalogue so deprecated codes
    # left over on a role row don't leak through.
    return {p for p in role.permissions if p in PERMISSIONS}
