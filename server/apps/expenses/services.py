"""
Auto-recording helpers for the Expense ledger.

These are called from elsewhere in the codebase (orders.fulfill_order,
admin "forward to supplier", procurement.receive_purchase_order_items)
to create Expense rows automatically as money goes out the door.

Every function here is idempotent — replaying the upstream event must
never double-count, because in practice we DO replay them (Stripe
webhook retries, manual sync-by-session calls, partial PO receipts).
Idempotency is enforced via the (category, external_ref) unique
constraint on the model + get_or_create here.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from django.db import transaction
from django.utils import timezone

from .models import Expense

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stripe fees
# ---------------------------------------------------------------------------

def record_stripe_fee_for_order(order, *, paid_at_dt=None) -> Optional[Expense]:
    """
    Pulls the actual fee from Stripe's balance_transaction for this order's
    payment intent and writes it as an Expense. Returns None if Stripe
    can't tell us the fee (e.g. test sessions with no PaymentIntent yet,
    or any unexpected API error — logged, not raised, because the order
    has already been fulfilled and we don't want to fail that flow).
    """
    if not order.stripe_payment_intent_id:
        return None

    try:
        import stripe
        from django.conf import settings

        stripe.api_key = settings.STRIPE_SECRET_KEY

        pi = stripe.PaymentIntent.retrieve(
            order.stripe_payment_intent_id,
            expand=["latest_charge.balance_transaction"],
        )
        charge = pi.get("latest_charge") if isinstance(pi, dict) else pi.latest_charge
        bt = None
        if charge:
            bt = charge.get("balance_transaction") if isinstance(charge, dict) else charge.balance_transaction
        if not bt:
            return None
        # `bt` may be a string id or a fully-expanded object — handle both.
        if isinstance(bt, str):
            bt = stripe.BalanceTransaction.retrieve(bt)

        fee_amount = int(bt.get("fee", 0) if isinstance(bt, dict) else getattr(bt, "fee", 0))
        if fee_amount <= 0:
            return None

        bt_id = bt.get("id") if isinstance(bt, dict) else getattr(bt, "id", "")
    except Exception:
        logger.exception("Failed to fetch Stripe fee for order %s", order.order_number)
        return None

    paid_at_value = (paid_at_dt or order.paid_at or timezone.now()).date()
    expense, _ = Expense.objects.get_or_create(
        category=Expense.Category.STRIPE_FEE,
        external_ref=str(bt_id),
        defaults={
            "paid_at": paid_at_value,
            "amount_pence": fee_amount,
            "currency": "GBP",
            "description": f"Stripe fee on {order.order_number}",
            "order": order,
            "auto_created": True,
        },
    )
    return expense


# ---------------------------------------------------------------------------
# Dropship cost-of-goods
# ---------------------------------------------------------------------------

def record_dropship_cogs(order_item) -> Optional[Expense]:
    """
    Called when an OrderItem is forwarded to its supplier with a
    supplier_cost set. Records the per-line cost as an Expense tagged
    with category=cogs_dropship.

    `external_ref = "orderitem:<id>"` keeps replays idempotent. If the
    admin later edits the supplier_cost we overwrite the row's amount
    (not just skip), so the ledger reflects the latest cost.
    """
    if not order_item or not order_item.supplier_cost or order_item.supplier_cost <= 0:
        return None

    paid_at_value = (
        order_item.forwarded_to_supplier_at.date()
        if order_item.forwarded_to_supplier_at
        else timezone.now().date()
    )

    with transaction.atomic():
        expense, created = Expense.objects.get_or_create(
            category=Expense.Category.COGS_DROPSHIP,
            external_ref=f"orderitem:{order_item.id}",
            defaults={
                "paid_at": paid_at_value,
                "amount_pence": order_item.supplier_cost * (order_item.quantity or 1),
                "currency": "GBP",
                "description": (
                    f"Dropship cost — {order_item.product_name} x{order_item.quantity} "
                    f"on {order_item.order.order_number}"
                ),
                "supplier_id": order_item.supplier_id,
                "order": order_item.order,
                "auto_created": True,
            },
        )
        if not created:
            # Amount may have been edited by admin; keep ledger in sync.
            new_amount = order_item.supplier_cost * (order_item.quantity or 1)
            updates = []
            if expense.amount_pence != new_amount:
                expense.amount_pence = new_amount
                updates.append("amount_pence")
            if expense.supplier_id != order_item.supplier_id:
                expense.supplier_id = order_item.supplier_id
                updates.append("supplier_id")
            if updates:
                expense.save(update_fields=updates)
    return expense


# ---------------------------------------------------------------------------
# Inventory cost-of-goods (wholesale PO)
# ---------------------------------------------------------------------------

def record_inventory_purchase_cogs(po) -> Optional[Expense]:
    """
    Records the total cost of a received PurchaseOrder as a single
    cogs_inventory Expense. Called from procurement.receive_* once the
    PO is fully or partially received — we re-run this on every receipt
    and the amount is recomputed from the PO items each time, so a
    partially-received PO that gets the rest later updates correctly.

    Note: most small UK businesses use cash-basis accounting (turnover
    < £150k), where inventory purchases are an expense at purchase time
    rather than COGS at sale time. That matches what we record here.
    A future migration to accrual accounting would change the semantics
    (track inventory as an asset, only recognise COGS on sale via
    StockMovement) but the row stays in this ledger either way.
    """
    if not po:
        return None

    # Total = sum(quantity_received * unit_cost) across all items
    total_pence = 0
    for item in po.items.all():
        total_pence += (item.quantity_received or 0) * (item.unit_cost or 0)

    if total_pence <= 0:
        return None

    paid_at_value = (po.received_at or timezone.now()).date()

    with transaction.atomic():
        expense, created = Expense.objects.get_or_create(
            category=Expense.Category.COGS_INVENTORY,
            external_ref=f"po:{po.id}",
            defaults={
                "paid_at": paid_at_value,
                "amount_pence": total_pence,
                "currency": "GBP",
                "description": (
                    f"Inventory purchase — PO #{po.po_number if hasattr(po, 'po_number') else po.id}"
                    + (f" from {po.supplier.name}" if po.supplier_id else "")
                ),
                "supplier_id": po.supplier_id,
                "purchase_order": po,
                "auto_created": True,
            },
        )
        if not created and expense.amount_pence != total_pence:
            expense.amount_pence = total_pence
            expense.save(update_fields=["amount_pence"])
    return expense


# ---------------------------------------------------------------------------
# Refund given (manual call from admin refund flow)
# ---------------------------------------------------------------------------

def record_refund_expense(order, *, amount_pence: int, refund_id: str) -> Optional[Expense]:
    """
    When an admin issues a Stripe refund, record it as a refund_given
    Expense. external_ref = the Stripe refund id makes it idempotent.
    """
    if amount_pence <= 0 or not refund_id:
        return None

    expense, _ = Expense.objects.get_or_create(
        category=Expense.Category.REFUND_GIVEN,
        external_ref=str(refund_id),
        defaults={
            "paid_at": timezone.now().date(),
            "amount_pence": amount_pence,
            "currency": "GBP",
            "description": f"Refund issued on {order.order_number}",
            "order": order,
            "auto_created": True,
        },
    )
    return expense
