import json
import logging
from decimal import Decimal

import stripe
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F
from django.template.loader import render_to_string
from django.utils import timezone

from apps.customizations.services import (
    CustomizationError,
    validate_and_snapshot,
)
from apps.products.models import Product, ProductVariant

logger = logging.getLogger(__name__)

_is_console_backend = (
    getattr(settings, "EMAIL_BACKEND", "")
    == "django.core.mail.backends.console.EmailBackend"
)


class CartValidationError(Exception):
    def __init__(self, code, details=None):
        self.code = code
        self.details = details or {}
        super().__init__(code)


def validate_cart(items):
    """
    Validate cart items against the database.
    Returns list of dicts with variant objects and DB prices.
    Raises CartValidationError on any issue.
    """
    if not items:
        raise CartValidationError("checkout.cart_empty")

    variant_ids = [item["variant_id"] for item in items]
    quantity_map = {str(item["variant_id"]): item["quantity"] for item in items}

    variants = (
        ProductVariant.objects
        .filter(id__in=variant_ids, is_active=True)
        .select_related("product")
        .prefetch_related(
            "product__translations",
            "product__images",
            "option_values__translations",
        )
    )

    variant_map = {str(v.id): v for v in variants}

    validated = []
    errors = []

    for item in items:
        vid = str(item["variant_id"])
        quantity = item["quantity"]
        variant = variant_map.get(vid)

        if not variant:
            errors.append({"variant_id": vid, "code": "checkout.variant_not_found"})
            continue

        if not variant.product.is_active:
            errors.append({"variant_id": vid, "code": "checkout.product_unavailable"})
            continue

        if variant.stock_quantity < quantity:
            errors.append({
                "variant_id": vid,
                "code": "checkout.insufficient_stock",
                "available": variant.stock_quantity,
            })
            continue

        # Get product name and image from translations
        translation = variant.product.translations.filter(language="en").first()
        product_name = translation.name if translation else str(variant.product.pk)

        primary_image = variant.product.images.filter(is_primary=True).first()
        image_url = primary_image.url if primary_image else ""

        # Build option label from variant option values
        option_parts = []
        for ov in variant.option_values.all():
            ov_trans = ov.translations.filter(language="en").first()
            if ov_trans:
                option_parts.append(ov_trans.value)
        option_label = " / ".join(option_parts)

        # Validate any customer-supplied customization input against the
        # product's field schema. The surcharge is per-unit and folded into
        # unit_price so Stripe sees the customized price and promotions /
        # VAT calculations stay consistent with the rest of the flow.
        submitted_customizations = item.get("customizations") or []
        try:
            customizations_snapshot, per_unit_surcharge = validate_and_snapshot(
                variant.product, submitted_customizations,
            )
        except CustomizationError as exc:
            errors.append({
                "variant_id": vid,
                "code": str(exc.message) if hasattr(exc, "message") else "customization.invalid",
                "details": getattr(exc, "params", {}) or {},
            })
            continue

        adjusted_unit_price = variant.price + per_unit_surcharge
        validated.append({
            "variant": variant,
            "product": variant.product,
            "product_name": product_name,
            "image_url": image_url,
            "option_label": option_label,
            "quantity": quantity,
            "unit_price": adjusted_unit_price,
            "line_total": adjusted_unit_price * quantity,
            "customizations": customizations_snapshot,
            "customization_surcharge": per_unit_surcharge,
        })

    if errors:
        raise CartValidationError("checkout.validation_failed", details=errors)

    return validated


def calculate_shipping(subtotal_pence):
    """Calculate shipping cost based on subtotal."""
    threshold = getattr(settings, "SHIPPING_FREE_THRESHOLD_PENCE", 3000)
    flat_rate = getattr(settings, "SHIPPING_FLAT_RATE_PENCE", 399)

    if subtotal_pence >= threshold:
        return 0
    return flat_rate


def link_guest_orders_to_user(user) -> int:
    """
    Attach any guest orders that share this user's email to their account.

    Customers often check out as guests first, then create an account later
    with the same email. We need their guest orders to "follow" them so order
    history, review eligibility, and any other per-user lookups recognise the
    purchases. Returns the number of orders that were linked.

    Safe to call from anywhere — idempotent, only touches rows where
    `user IS NULL` and the email matches case-insensitively.
    """
    from apps.orders.models import Order

    if not user or not getattr(user, "is_authenticated", False) or not user.email:
        return 0

    return Order.objects.filter(
        user__isnull=True,
        email__iexact=user.email,
    ).update(user=user)


def create_stripe_checkout_session(
    validated_items,
    shipping_address,
    email,
    user,
    request,
    promotion_code: str = "",
):
    """
    Create a Stripe Checkout session from validated cart data.
    Cart data is stored in a PendingCheckout row; only its UUID is
    passed via Stripe metadata (Stripe limits metadata values to 500 chars).

    If `promotion_code` is supplied and valid, the discount is applied:
      - For percent codes: each item's unit price is scaled down proportionally
        so the final Stripe total matches our discounted total exactly.
        Rounding leftovers are absorbed into the first eligible line item.
      - For free shipping: the shipping line is omitted from Stripe.

    Returns (checkout_url, session_id).
    """
    from apps.orders.models import PendingCheckout
    from apps.promotions.services import (
        PromotionError,
        build_cart_lines_from_validated_items,
        validate_code,
    )

    stripe.api_key = settings.STRIPE_SECRET_KEY

    subtotal = sum(item["line_total"] for item in validated_items)
    shipping_cost = calculate_shipping(subtotal)

    # Validate the promo code (if any) — raises CartValidationError-style on failure
    promotion_id = None
    promotion_code_snapshot = ""
    discount_amount = 0
    free_shipping = False

    if promotion_code:
        cart_lines = build_cart_lines_from_validated_items(validated_items)
        try:
            promo_result = validate_code(
                code=promotion_code,
                cart_lines=cart_lines,
                cart_subtotal=subtotal,
                shipping_cost=shipping_cost,
                user=user,
                email=email,
            )
        except PromotionError as exc:
            # Re-raise as CartValidationError for the view's error handler
            raise CartValidationError(exc.code) from exc

        promotion_id = str(promo_result.promotion.id)
        promotion_code_snapshot = promo_result.promotion.code
        discount_amount = promo_result.discount_amount
        free_shipping = promo_result.applies_to_shipping

    # Apply free-shipping discount before computing the total
    effective_shipping = 0 if free_shipping else shipping_cost
    # Cap discount so total never goes negative
    item_discount = 0 if free_shipping else min(discount_amount, subtotal)
    total = subtotal + effective_shipping - item_discount

    # ---------------------------------------------------------------
    # Build Stripe line items, scaling unit prices to match the
    # discounted total. Each line gets its share of the discount in
    # proportion to its line total; rounding leftovers are absorbed
    # by the first eligible item so the sum is exact.
    # ---------------------------------------------------------------
    line_items = []
    discount_remaining = item_discount

    for index, item in enumerate(validated_items):
        original_unit_price = item["unit_price"]
        quantity = item["quantity"]
        line_total = item["line_total"]

        # Compute this line's share of the discount
        if subtotal > 0 and item_discount > 0:
            if index == len(validated_items) - 1:
                # Last item soaks up any rounding remainder
                line_share = discount_remaining
            else:
                line_share = (line_total * item_discount) // subtotal
            discount_remaining -= line_share
        else:
            line_share = 0

        adjusted_line_total = max(0, line_total - line_share)
        # Distribute back into per-unit price (Stripe needs unit_amount × quantity)
        adjusted_unit_price = adjusted_line_total // quantity
        # Per-unit floor leaves a remainder; Stripe Checkout requires a single
        # unit_amount per line, so we accept up to (quantity - 1) pence of
        # absorbed rounding which we'll compensate via a separate line below.
        leftover = adjusted_line_total - adjusted_unit_price * quantity

        line_item = {
            "price_data": {
                "currency": "gbp",
                "unit_amount": adjusted_unit_price,
                "product_data": {"name": item["product_name"]},
            },
            "quantity": quantity,
        }
        if item["image_url"]:
            line_item["price_data"]["product_data"]["images"] = [item["image_url"]]
        if item["option_label"]:
            line_item["price_data"]["product_data"]["description"] = item["option_label"]
        line_items.append(line_item)

        # If the floor division left a few pence on the table, add a tiny
        # adjustment line so the Stripe total still matches `total` exactly.
        if leftover > 0:
            line_items.append({
                "price_data": {
                    "currency": "gbp",
                    "unit_amount": leftover,
                    "product_data": {"name": "Rounding adjustment"},
                },
                "quantity": 1,
            })

    # Add shipping as a line item (only if not waived by free_shipping promo)
    if effective_shipping > 0:
        line_items.append({
            "price_data": {
                "currency": "gbp",
                "unit_amount": effective_shipping,
                "product_data": {"name": "Standard Delivery"},
            },
            "quantity": 1,
        })

    # Snapshot items + shipping into a PendingCheckout row
    items_data = [
        {
            "variant_id": str(item["variant"].id),
            "product_id": str(item["product"].id),
            "product_name": item["product_name"],
            "variant_sku": item["variant"].sku,
            "option_label": item["option_label"],
            "unit_price": item["unit_price"],
            "quantity": item["quantity"],
            "line_total": item["line_total"],
            "image_url": item["image_url"],
            "fulfillment_type": item["product"].fulfillment_type,
            "customizations": item.get("customizations", []),
            "customization_surcharge": item.get("customization_surcharge", 0),
        }
        for item in validated_items
    ]

    pending = PendingCheckout.objects.create(
        user=user,
        email=email,
        items_data=items_data,
        shipping_data=shipping_address,
        subtotal=subtotal,
        shipping_cost=effective_shipping,
        discount_amount=item_discount + (shipping_cost if free_shipping else 0),
        promotion_id=promotion_id,
        promotion_code=promotion_code_snapshot,
        total=total,
    )

    session = stripe.checkout.Session.create(
        mode="payment",
        currency="gbp",
        line_items=line_items,
        customer_email=email,
        metadata={"pending_checkout_id": str(pending.id)},
        success_url=f"{settings.FRONTEND_URL}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/cart",
    )

    return session.url, session.id


def fulfill_order(session):
    """
    Create the order from a completed Stripe checkout session.
    Idempotent — skips if order already exists for this session.
    """
    from apps.orders.models import Order, OrderItem, PendingCheckout

    session_id = session["id"]

    # Idempotency check
    if Order.objects.filter(stripe_checkout_session_id=session_id).exists():
        logger.info("Order already exists for session %s, skipping.", session_id)
        return

    # Stripe StripeObject — access keys directly via bracket notation
    try:
        pending_id = session["metadata"]["pending_checkout_id"]
    except (KeyError, TypeError):
        pending_id = ""

    if not pending_id:
        logger.error("No pending_checkout_id in session %s metadata", session_id)
        return

    try:
        pending = PendingCheckout.objects.get(id=pending_id)
    except PendingCheckout.DoesNotExist:
        logger.error("PendingCheckout %s not found for session %s", pending_id, session_id)
        return

    items_data = pending.items_data
    shipping_data = pending.shipping_data
    email = pending.email
    user_id = str(pending.user_id) if pending.user_id else ""
    subtotal = pending.subtotal
    shipping_cost = pending.shipping_cost
    total = pending.total
    discount_amount = pending.discount_amount or 0
    promotion_code_snapshot = pending.promotion_code or ""
    promotion_id = pending.promotion_id

    try:
        payment_intent_id = session["payment_intent"] or ""
    except (KeyError, TypeError):
        payment_intent_id = ""

    # VAT calculation (prices include VAT — extract VAT portion from total)
    vat_rate = Decimal(str(getattr(settings, "VAT_RATE", 0.20)))
    if getattr(settings, "PRICES_INCLUDE_VAT", True):
        # vat = total × (rate / (1 + rate))
        vat_amount = int(round(total * float(vat_rate / (1 + vat_rate))))
    else:
        vat_amount = int(round(total * float(vat_rate)))

    from apps.procurement.services import consume_fifo

    with transaction.atomic():
        # Create order
        order = Order.objects.create(
            order_number=Order.generate_order_number(),
            user_id=user_id if user_id else None,
            email=email,
            status=Order.Status.PAID,
            shipping_full_name=shipping_data.get("full_name", ""),
            shipping_address_line_1=shipping_data.get("address_line_1", ""),
            shipping_address_line_2=shipping_data.get("address_line_2", ""),
            shipping_city=shipping_data.get("city", ""),
            shipping_county=shipping_data.get("county", ""),
            shipping_postcode=shipping_data.get("postcode", ""),
            shipping_country=shipping_data.get("country", "GB"),
            shipping_phone=shipping_data.get("phone", ""),
            subtotal=subtotal,
            shipping_cost=shipping_cost,
            discount_amount=discount_amount,
            promotion_code=promotion_code_snapshot,
            total=total,
            vat_amount=vat_amount,
            vat_rate=vat_rate,
            stripe_checkout_session_id=session_id,
            stripe_payment_intent_id=payment_intent_id,
            paid_at=timezone.now(),
        )

        # Create order items, decrement stock, calculate COGS via FIFO
        for item_data in items_data:
            fulfillment_type = item_data.get("fulfillment_type", "self")

            # Per-item VAT (proportional to line total)
            item_line_total = item_data["line_total"]
            if getattr(settings, "PRICES_INCLUDE_VAT", True):
                item_vat = int(round(item_line_total * float(vat_rate / (1 + vat_rate))))
            else:
                item_vat = int(round(item_line_total * float(vat_rate)))

            order_item = OrderItem.objects.create(
                order=order,
                product_id=item_data["product_id"],
                variant_id=item_data["variant_id"],
                product_name=item_data["product_name"],
                variant_sku=item_data["variant_sku"],
                variant_option_label=item_data.get("option_label", ""),
                unit_price=item_data["unit_price"],
                quantity=item_data["quantity"],
                line_total=item_line_total,
                vat_amount=item_vat,
                image_url=item_data.get("image_url", ""),
                fulfillment_type=fulfillment_type,
                customizations=item_data.get("customizations", []),
                customization_surcharge=item_data.get("customization_surcharge", 0),
            )

            # For self-fulfilled items: decrement stock and calculate COGS via FIFO.
            # For dropship items: skip stock decrement (we never held them) and skip COGS
            # (it'll be set when admin forwards to supplier).
            if fulfillment_type != "dropship":
                try:
                    variant = ProductVariant.objects.select_for_update().get(
                        id=item_data["variant_id"]
                    )
                except ProductVariant.DoesNotExist:
                    logger.warning(
                        "Variant %s missing during fulfillment of %s",
                        item_data["variant_id"], order.order_number,
                    )
                    continue

                if variant.stock_quantity < item_data["quantity"]:
                    logger.warning(
                        "Stock insufficient for variant %s during fulfillment (order %s).",
                        item_data["variant_sku"], order.order_number,
                    )

                # Atomic stock decrement
                ProductVariant.objects.filter(id=variant.id).update(
                    stock_quantity=F("stock_quantity") - item_data["quantity"]
                )

                # FIFO COGS calculation + StockMovement records
                cogs = consume_fifo(
                    variant=variant,
                    quantity_to_consume=item_data["quantity"],
                    order_item=order_item,
                )
                order_item.cogs_amount = cogs
                order_item.save(update_fields=["cogs_amount"])

        # Record promotion redemption (idempotent on (promotion, order))
        if promotion_id and discount_amount > 0:
            from apps.promotions.services import redeem as redeem_promotion

            redeem_promotion(
                promotion_id=promotion_id,
                order=order,
                user=order.user,
                guest_email=email if not order.user_id else "",
                discount_amount=discount_amount,
                subtotal=subtotal,
            )

        # Mark PendingCheckout consumed (within the transaction)
        pending.consumed_at = timezone.now()
        pending.save(update_fields=["consumed_at"])

    logger.info("Order %s created successfully.", order.order_number)
    send_order_confirmation_email(order)

    return order


def send_order_confirmation_email(order):
    """Send order confirmation email."""
    confirmation_url = f"{settings.FRONTEND_URL}/checkout/success?session_id={order.stripe_checkout_session_id}"

    if _is_console_backend:
        logger.info(
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  📧 Order Confirmation — %s\n"
            "  💰 Total: £%.2f\n"
            "  📬 %s\n"
            "  🔗 %s\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            order.order_number,
            order.total / 100,
            order.email,
            confirmation_url,
        )
        return

    context = {
        "order": order,
        "items": order.items.all(),
        "confirmation_url": confirmation_url,
        "site_name": "The Pet Headquarters",
    }

    html_message = render_to_string("orders/emails/confirmation.html", context)
    plain_message = render_to_string("orders/emails/confirmation.txt", context)

    send_mail(
        subject=f"Order confirmed — {order.order_number}",
        message=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[order.email],
        html_message=html_message,
        fail_silently=True,
    )
