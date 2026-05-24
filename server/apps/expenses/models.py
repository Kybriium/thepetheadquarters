"""
Expense ledger — every penny that leaves the business gets a row here.

Drives the admin Finances dashboard and the HMRC year-end CSV export.
For UK Ltd / sole-trader compliance we need to retain receipts for 6
years; uploaded receipt files live in S3-compatible private storage
(Railway Bucket / Cloudflare R2) and `receipt_key` points to them.

Auto-recording rules:
  - `stripe_fee`     — created by fulfill_order when an order is paid
  - `cogs_dropship`  — created when admin forwards an OrderItem to a
                       supplier with supplier_cost set
  - `cogs_inventory` — created when a PurchaseOrder is marked received

Manual rows (ads, software, accounting fees, postage, packaging, etc.)
are added through the admin Finances page.

`auto_created=True` flags rows the system added — they shouldn't be
hand-edited except to attach a receipt. The admin form for manual
entries always sets `auto_created=False`.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class Expense(BaseModel):
    class Category(models.TextChoices):
        # Cost of sales — directly tied to fulfilled orders
        COGS_DROPSHIP = "cogs_dropship", "Cost of goods (dropship)"
        COGS_INVENTORY = "cogs_inventory", "Cost of goods (inventory)"
        # Variable per-order costs
        STRIPE_FEE = "stripe_fee", "Stripe fee"
        SHIPPING_PAID = "shipping_paid", "Outbound shipping paid by us"
        REFUND_GIVEN = "refund_given", "Refund given to customer"
        # Operating expenses
        ADS = "ads", "Advertising / marketing"
        SOFTWARE = "software", "Software subscriptions"
        POSTAGE = "postage", "Postage / packaging materials"
        ACCOUNTING = "accounting", "Accounting / legal fees"
        OFFICE = "office", "Office supplies / utilities"
        OTHER = "other", "Other"

    # All monetary values are in PENCE — matches Order.subtotal/total
    # convention across the codebase. Decimal sums are computed at
    # display time only.
    paid_at = models.DateField(
        db_index=True,
        help_text="The actual date the money left the business — used for "
        "HMRC year filing, not the row creation date.",
    )
    category = models.CharField(
        max_length=32,
        choices=Category.choices,
        db_index=True,
    )
    amount_pence = models.PositiveIntegerField(
        help_text="Total amount paid in pence (gross — includes any VAT).",
    )
    vat_amount_pence = models.PositiveIntegerField(
        default=0,
        help_text=(
            "VAT included in `amount_pence`, in pence. Only relevant for "
            "VAT-registered businesses claiming input tax. Leave 0 if not "
            "VAT-registered."
        ),
    )
    currency = models.CharField(
        max_length=3,
        default="GBP",
        help_text="ISO 4217. Always GBP for now — kept for future expansion.",
    )
    description = models.CharField(
        max_length=500,
        help_text="Short human-readable description (e.g. 'Temu order for "
        "TPH-000005', 'Google Ads — March', 'Vistaprint packaging').",
    )

    # Optional foreign keys for context — kept nullable so an ad-hoc
    # expense (e.g. accountant invoice) doesn't need a fake supplier row.
    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
        help_text="Set for per-order expenses (Stripe fees, dropship cost).",
    )
    purchase_order = models.ForeignKey(
        "procurement.PurchaseOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
        help_text="Set for inventory expenses tied to a wholesale PO.",
    )

    # Receipt file — stored in S3-compatible private bucket. Empty when
    # the admin hasn't uploaded a receipt yet (e.g. auto-recorded Stripe
    # fees never have a separate receipt — the Stripe dashboard is the
    # record of truth and `description` references the payment intent).
    receipt_key = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Storage key inside the private bucket. Empty until uploaded.",
    )
    receipt_filename = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Original filename the admin uploaded — preserved for "
        "the year-end CSV export so the accountant sees 'temu-invoice-mar.pdf' "
        "not the uuid key.",
    )
    receipt_content_type = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )

    notes = models.TextField(blank=True, default="")

    # Provenance — distinguishes admin-entered rows from auto-recorded
    # ones. Helps the admin UI flag rows that don't yet have a receipt
    # attached (auto-recorded Stripe fees don't need one; manual rows do).
    auto_created = models.BooleanField(
        default=False,
        db_index=True,
        help_text=(
            "True for system-generated rows (Stripe fees, COGS). Manual "
            "rows added via the admin Finances form are False."
        ),
    )
    # Used as the idempotency key for auto-recorded rows so we never
    # double-count when fulfill_order or PO-receipt is replayed (e.g.
    # webhook retries, manual replays via sync-by-session).
    external_ref = models.CharField(
        max_length=200,
        blank=True,
        default="",
        db_index=True,
        help_text=(
            "Stable upstream identifier for idempotent auto-creates "
            "(Stripe balance_transaction id, OrderItem id, PurchaseOrder id)."
        ),
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_expenses",
    )

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["category", "paid_at"]),
            models.Index(fields=["paid_at"]),
            models.Index(fields=["auto_created", "category"]),
        ]
        constraints = [
            # An external_ref + category pair must be unique when
            # external_ref is non-empty — prevents double-recording the
            # same Stripe fee or dropship cost. Empty external_refs are
            # NOT covered by this constraint because manual entries
            # legitimately have none.
            models.UniqueConstraint(
                fields=["category", "external_ref"],
                condition=models.Q(external_ref__gt=""),
                name="uniq_auto_expense_per_ref",
            ),
        ]

    def __str__(self) -> str:
        pounds = self.amount_pence / 100
        return f"{self.paid_at} {self.get_category_display()} £{pounds:.2f}"

    @property
    def amount_pounds(self) -> float:
        return self.amount_pence / 100.0

    @property
    def is_cogs(self) -> bool:
        return self.category in {
            self.Category.COGS_DROPSHIP,
            self.Category.COGS_INVENTORY,
        }
