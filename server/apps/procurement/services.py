"""
Procurement / FIFO services.

Core operations:
- receive_purchase_order_items: create StockBatches + StockMovements + bump variant.stock_quantity
- consume_fifo: deduct stock from oldest batches first, return total COGS
- restock_to_batch: increase a batch's remaining qty (used for refund restocks)
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.products.models import ProductVariant
from apps.procurement.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    StockBatch,
    StockMovement,
)


class StockError(Exception):
    pass


@transaction.atomic
def receive_purchase_order_items(po, item_quantities, user=None):
    """
    Process a (partial or full) PO receipt.

    Args:
        po: PurchaseOrder instance
        item_quantities: list of {"po_item_id": str, "quantity_received": int}
        user: User performing the action (for audit)

    Creates StockBatches, StockMovements, increments variant stock,
    updates SupplierProduct.last_cost. Updates PO status accordingly.
    """
    from apps.suppliers.models import SupplierProduct

    if po.status not in (PurchaseOrder.Status.SENT, PurchaseOrder.Status.PARTIAL):
        raise StockError("po.invalid_status_for_receipt")

    received_at = timezone.now()
    fully_received = True

    for entry in item_quantities:
        po_item_id = entry["po_item_id"]
        qty = int(entry["quantity_received"])

        if qty <= 0:
            continue

        try:
            po_item = po.items.select_for_update().get(id=po_item_id)
        except PurchaseOrderItem.DoesNotExist:
            raise StockError("po.item_not_found")

        outstanding = po_item.quantity_ordered - po_item.quantity_received
        if qty > outstanding:
            raise StockError("po.over_received")

        # Create stock batch (FIFO basis)
        batch = StockBatch.objects.create(
            variant=po_item.variant,
            purchase_order_item=po_item,
            quantity_received=qty,
            quantity_remaining=qty,
            unit_cost=po_item.unit_cost,
            received_at=received_at,
        )

        # Increment variant stock atomically
        ProductVariant.objects.filter(id=po_item.variant_id).update(
            stock_quantity=F("stock_quantity") + qty
        )

        # Movement record
        StockMovement.objects.create(
            variant=po_item.variant,
            type=StockMovement.MovementType.PURCHASE_RECEIVED,
            quantity=qty,
            batch=batch,
            purchase_order_item=po_item,
            unit_cost_at_time=po_item.unit_cost,
            total_cost=qty * po_item.unit_cost,
            user=user,
        )

        # Update item received quantity
        po_item.quantity_received += qty
        po_item.save(update_fields=["quantity_received"])

        # Update SupplierProduct.last_cost
        SupplierProduct.objects.update_or_create(
            supplier=po.supplier,
            variant=po_item.variant,
            defaults={
                "last_cost": po_item.unit_cost,
                "last_purchased_at": received_at,
            },
        )

        if po_item.quantity_received < po_item.quantity_ordered:
            fully_received = False

    # Check if any items still outstanding across the PO
    for item in po.items.all():
        if item.quantity_received < item.quantity_ordered:
            fully_received = False
            break

    if fully_received:
        po.status = PurchaseOrder.Status.RECEIVED
        po.received_at = received_at
    else:
        po.status = PurchaseOrder.Status.PARTIAL
    po.save(update_fields=["status", "received_at"])

    # Auto-record / refresh the cogs_inventory Expense for this PO so
    # the Finances ledger reflects the inventory spend. Recomputed from
    # PO items each call, so partial receipts update the row as more
    # stock lands.
    try:
        from apps.expenses.services import record_inventory_purchase_cogs
        record_inventory_purchase_cogs(po)
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            "Failed to record inventory COGS for PO %s", po.id
        )

    return po


@transaction.atomic
def consume_fifo(variant, quantity_to_consume, order_item=None, user=None):
    """
    Consume stock from oldest batches first.
    Returns total COGS in pence.

    If insufficient batch coverage exists (e.g. opening stock without batches),
    falls back to using variant.cost_price (or 0).
    """
    if quantity_to_consume <= 0:
        return 0

    total_cogs = 0
    remaining = quantity_to_consume

    batches = (
        StockBatch.objects
        .select_for_update()
        .filter(variant=variant, quantity_remaining__gt=0)
        .order_by("received_at")
    )

    for batch in batches:
        if remaining <= 0:
            break
        take = min(batch.quantity_remaining, remaining)
        line_cost = take * batch.unit_cost
        total_cogs += line_cost

        batch.quantity_remaining -= take
        batch.save(update_fields=["quantity_remaining"])

        StockMovement.objects.create(
            variant=variant,
            type=StockMovement.MovementType.SALE,
            quantity=-take,
            batch=batch,
            order_item=order_item,
            unit_cost_at_time=batch.unit_cost,
            total_cost=line_cost,
            user=user,
        )

        remaining -= take

    # Fallback: if there isn't enough batched stock (e.g. opening stock),
    # consume against variant.cost_price as fallback
    if remaining > 0:
        fallback_cost = variant.cost_price or 0
        total_cogs += remaining * fallback_cost
        StockMovement.objects.create(
            variant=variant,
            type=StockMovement.MovementType.SALE,
            quantity=-remaining,
            batch=None,
            order_item=order_item,
            unit_cost_at_time=fallback_cost,
            total_cost=remaining * fallback_cost,
            user=user,
            notes="Fallback consumption (no batch available)",
        )

    return total_cogs


@transaction.atomic
def restock_for_refund(variant, quantity, order_item=None, user=None):
    """
    Restock variant after a refund/cancel.
    Creates a fresh StockBatch with the variant's last known cost (or cost_price).
    """
    if quantity <= 0:
        return

    # Use last batch cost if available, else cost_price
    last_batch = (
        StockBatch.objects
        .filter(variant=variant)
        .order_by("-received_at")
        .first()
    )
    unit_cost = last_batch.unit_cost if last_batch else (variant.cost_price or 0)

    batch = StockBatch.objects.create(
        variant=variant,
        purchase_order_item=None,
        quantity_received=quantity,
        quantity_remaining=quantity,
        unit_cost=unit_cost,
        received_at=timezone.now(),
        notes="Refund restock",
    )

    ProductVariant.objects.filter(id=variant.id).update(
        stock_quantity=F("stock_quantity") + quantity
    )

    StockMovement.objects.create(
        variant=variant,
        type=StockMovement.MovementType.REFUND_RESTOCK,
        quantity=quantity,
        batch=batch,
        order_item=order_item,
        unit_cost_at_time=unit_cost,
        total_cost=quantity * unit_cost,
        user=user,
    )

    return batch


@transaction.atomic
def adjust_stock(variant, new_quantity, user=None, notes=""):
    """
    Manually set a variant's stock to an absolute value.
    Logs as ADJUSTMENT movement with the delta.
    """
    current = variant.stock_quantity
    delta = new_quantity - current

    if delta == 0:
        return

    variant.stock_quantity = new_quantity
    variant.save(update_fields=["stock_quantity"])

    # If positive delta, create a new batch with cost_price (no PO)
    batch = None
    if delta > 0:
        cost = variant.cost_price or 0
        batch = StockBatch.objects.create(
            variant=variant,
            purchase_order_item=None,
            quantity_received=delta,
            quantity_remaining=delta,
            unit_cost=cost,
            received_at=timezone.now(),
            notes=f"Manual adjustment: {notes}" if notes else "Manual adjustment",
        )
    else:
        # Negative delta — consume from oldest batches
        consume_fifo(variant, abs(delta), order_item=None, user=user)
        return

    StockMovement.objects.create(
        variant=variant,
        type=StockMovement.MovementType.ADJUSTMENT,
        quantity=delta,
        batch=batch,
        unit_cost_at_time=batch.unit_cost if batch else 0,
        total_cost=delta * (batch.unit_cost if batch else 0),
        user=user,
        notes=notes,
    )
