"""
Service layer for admin order actions: ship, cancel, refund, deliver.
Handles state transitions, restocking, Stripe refunds, and email notifications.
"""

import logging

import stripe
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from apps.orders.models import Order, OrderItem
from apps.products.models import ProductVariant
from apps.procurement.services import restock_for_refund

logger = logging.getLogger(__name__)


class OrderActionError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _is_console_email():
    return (
        getattr(settings, "EMAIL_BACKEND", "")
        == "django.core.mail.backends.console.EmailBackend"
    )


def _money(pence: int) -> str:
    """Format pence as a £-prefixed string with two decimals."""
    return f"£{(pence or 0) / 100:.2f}"


# Subject lines and console-log labels per status, kept in one place so all
# notifications stay consistent.
_STATUS_EMAIL_META = {
    "processing": {
        "subject": "Your order is being prepared — {order_number}",
        "console_icon": "⚙️ ",
        "console_label": "Order Processing",
    },
    "shipped": {
        "subject": "Your order is on the way — {order_number}",
        "console_icon": "📦",
        "console_label": "Order Shipped",
    },
    "delivered": {
        "subject": "Your order has been delivered — {order_number}",
        "console_icon": "✅",
        "console_label": "Order Delivered",
    },
    "cancelled": {
        "subject": "Your order has been cancelled — {order_number}",
        "console_icon": "❌",
        "console_label": "Order Cancelled",
    },
    "refunded": {
        "subject": "Your refund has been issued — {order_number}",
        "console_icon": "💸",
        "console_label": "Order Refunded",
    },
}


def _send_status_email(order, status_key: str, extra_context: dict | None = None) -> None:
    """
    Send a customer notification email for an order status change.

    Renders `orders/emails/{status_key}.html` and `.txt` and sends via the
    configured backend. In the console-backend dev environment, also emits a
    structured log line so you can see at a glance what would have been sent.
    """
    meta = _STATUS_EMAIL_META.get(status_key)
    if not meta:
        logger.warning("No email meta defined for status %s", status_key)
        return

    site_name = "The Pet Headquarters"
    site_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    order_url = f"{site_url}/checkout/success?session_id={order.stripe_checkout_session_id}"

    tracking_url = order.tracking_link or order.tracking_url or ""
    # For shipped emails with a known tracking URL, swap the CTA label to
    # "Track Order" so the gold button matches what clicking it actually
    # does. The template uses {{ cta_label }} so it appears in both the
    # HTML anchor and the Outlook VML fallback button.
    cta_label = "View Order"
    if status_key == "shipped" and tracking_url:
        cta_label = "Track Order"

    context = {
        "order": order,
        "items": order.items.all(),
        "site_name": site_name,
        "order_url": order_url,
        "tracking_url": tracking_url,
        "carrier_label": order.get_tracking_carrier_display() if order.tracking_carrier else "",
        "subtotal_display": _money(order.subtotal),
        "shipping_display": "FREE" if order.shipping_cost == 0 else _money(order.shipping_cost),
        "discount_display": _money(order.discount_amount) if order.discount_amount else "",
        "total_display": _money(order.total),
        "refund_display": _money(order.refund_amount) if order.refund_amount else "",
        "cta_label": cta_label,
    }
    if extra_context:
        context.update(extra_context)

    subject = meta["subject"].format(order_number=order.order_number)

    # Always emit a console summary so devs can see notifications fire even
    # when the SMTP backend is configured.
    logger.info(
        "\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "  %s %s — %s\n"
        "  📬 To: %s\n"
        "  💰 Total: %s\n"
        "%s"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        meta["console_icon"],
        meta["console_label"],
        order.order_number,
        order.email,
        context["total_display"],
        f"  🔗 Tracking: {context['tracking_url']}\n" if context["tracking_url"] else "",
    )

    if _is_console_email():
        return

    try:
        html_message = render_to_string(f"orders/emails/{status_key}.html", context)
        plain_message = render_to_string(f"orders/emails/{status_key}.txt", context)
    except Exception:
        logger.exception("Failed to render %s email for %s", status_key, order.order_number)
        return

    send_mail(
        subject=subject,
        message=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[order.email],
        html_message=html_message,
        fail_silently=True,
    )


@transaction.atomic
def transition_status(order, new_status, user=None):
    """Generic status transition (used for non-shipping moves like processing/delivered)."""
    previous_status = order.status
    order.status = new_status

    if new_status == Order.Status.DELIVERED and not order.delivered_at:
        order.delivered_at = timezone.now()
        order.save(update_fields=["status", "delivered_at"])
        _send_status_email(order, "delivered")
    elif new_status == Order.Status.CANCELLED and not order.cancelled_at:
        order.cancelled_at = timezone.now()
        order.save(update_fields=["status", "cancelled_at"])
        _send_status_email(order, "cancelled")
    elif new_status == Order.Status.PROCESSING and previous_status != Order.Status.PROCESSING:
        order.save(update_fields=["status"])
        _send_status_email(order, "processing")
    else:
        order.save(update_fields=["status"])

    return order


@transaction.atomic
def ship_order(order, carrier, tracking_number, tracking_url, user=None):
    """Mark order as shipped, set tracking, send email."""
    if order.status not in (Order.Status.PAID, Order.Status.PROCESSING):
        raise OrderActionError("admin.orders.cannot_ship")

    order.tracking_carrier = carrier
    order.tracking_number = tracking_number
    order.tracking_url = tracking_url
    order.status = Order.Status.SHIPPED
    order.shipped_at = timezone.now()
    order.save(update_fields=[
        "tracking_carrier",
        "tracking_number",
        "tracking_url",
        "status",
        "shipped_at",
    ])

    # Update each item's fulfillment status (only self-fulfilled items here;
    # dropship items follow their own flow)
    order.items.filter(fulfillment_type="self").update(
        fulfillment_status=OrderItem.FulfillmentStatus.SHIPPED,
    )

    _send_status_email(order, "shipped")
    return order


@transaction.atomic
def deliver_order(order, user=None):
    if order.status != Order.Status.SHIPPED:
        raise OrderActionError("admin.orders.cannot_deliver")
    order.status = Order.Status.DELIVERED
    order.delivered_at = timezone.now()
    order.save(update_fields=["status", "delivered_at"])
    order.items.update(fulfillment_status=OrderItem.FulfillmentStatus.DELIVERED)
    _send_status_email(order, "delivered")
    return order


@transaction.atomic
def cancel_order(order, reason="", user=None):
    """Cancel an order. Restocks self-fulfilled items if order was at least paid."""
    if order.status in (Order.Status.CANCELLED, Order.Status.DELIVERED):
        raise OrderActionError("admin.orders.cannot_cancel")

    should_restock = order.status in (
        Order.Status.PAID,
        Order.Status.PROCESSING,
        Order.Status.SHIPPED,
    )

    order.status = Order.Status.CANCELLED
    order.cancelled_at = timezone.now()
    if reason:
        order.internal_notes = (order.internal_notes or "") + f"\n\nCancelled: {reason}"
    order.save(update_fields=["status", "cancelled_at", "internal_notes"])

    if should_restock:
        for item in order.items.filter(fulfillment_type="self"):
            try:
                variant = ProductVariant.objects.get(id=item.variant_id)
            except ProductVariant.DoesNotExist:
                continue
            restock_for_refund(
                variant=variant,
                quantity=item.quantity,
                order_item=item,
                user=user,
            )

    _send_status_email(
        order,
        "cancelled",
        extra_context={"reason": reason, "refunded": False},
    )
    return order


@transaction.atomic
def refund_order(order, user=None):
    """Issue a Stripe refund and cancel the order with restock."""
    if order.status not in (Order.Status.PAID, Order.Status.PROCESSING, Order.Status.SHIPPED):
        raise OrderActionError("admin.orders.cannot_refund")

    if not order.stripe_payment_intent_id:
        raise OrderActionError("admin.orders.no_payment_intent")

    if not settings.STRIPE_SECRET_KEY:
        raise OrderActionError("admin.orders.stripe_not_configured")

    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Idempotency_key prevents double refund on retry
    stripe.Refund.create(
        payment_intent=order.stripe_payment_intent_id,
        idempotency_key=f"refund_{order.id}",
    )

    order.status = Order.Status.CANCELLED
    order.refunded_at = timezone.now()
    order.cancelled_at = timezone.now()
    order.refund_amount = order.total
    order.save(update_fields=["status", "refunded_at", "cancelled_at", "refund_amount"])

    # Restock self-fulfilled items
    for item in order.items.filter(fulfillment_type="self"):
        try:
            variant = ProductVariant.objects.get(id=item.variant_id)
        except ProductVariant.DoesNotExist:
            continue
        restock_for_refund(
            variant=variant,
            quantity=item.quantity,
            order_item=item,
            user=user,
        )

    _send_status_email(order, "refunded", extra_context={"refunded": True})
    return order
