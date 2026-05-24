"""
Promotion validation and redemption service layer.

The two public entry points are:

* `validate_code` — called from the public validate endpoint and from the
  checkout view before a Stripe session is created. Pure read; performs all
  eligibility checks and returns the discount amount this cart would receive.

* `redeem` — called from `fulfill_order` (Stripe webhook). Atomically
  increments the usage counter and creates a `PromotionRedemption` row.
  Idempotent on the (promotion, order) pair so webhook retries are safe.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Iterable

from django.db import IntegrityError, transaction
from django.db.models import F  # noqa: F401  (used by track_click via update())
from django.utils import timezone

from apps.promotions.models import Promotion, PromotionRedemption


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class PromotionError(Exception):
    """Raised when a promotion cannot be applied. `code` is i18n-friendly."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CartLine:
    """Lightweight cart line for scope/discount evaluation."""
    product_id: str
    brand_id: str | None
    category_ids: tuple[str, ...]
    line_total: int  # pence


@dataclass(frozen=True)
class ValidationResult:
    promotion: Promotion
    discount_amount: int  # in pence
    applies_to_shipping: bool


def _normalise_code(code: str) -> str:
    return (code or "").strip().upper()


def _line_is_in_scope(promotion: Promotion, line: CartLine) -> bool:
    if promotion.scope == Promotion.Scope.ALL:
        return True
    if promotion.scope == Promotion.Scope.PRODUCT:
        return line.product_id in {
            str(p) for p in promotion.scope_products.values_list("id", flat=True)
        }
    if promotion.scope == Promotion.Scope.BRAND:
        if not line.brand_id:
            return False
        return line.brand_id in {
            str(b) for b in promotion.scope_brands.values_list("id", flat=True)
        }
    if promotion.scope == Promotion.Scope.CATEGORY:
        promo_cat_ids = {
            str(c) for c in promotion.scope_categories.values_list("id", flat=True)
        }
        return any(cid in promo_cat_ids for cid in line.category_ids)
    return False


def _eligible_subtotal(promotion: Promotion, lines: Iterable[CartLine]) -> int:
    """Sum of line totals for items that fall within the promotion's scope."""
    return sum(line.line_total for line in lines if _line_is_in_scope(promotion, line))


def validate_code(
    *,
    code: str,
    cart_lines: list[CartLine],
    cart_subtotal: int,
    shipping_cost: int,
    user=None,
    email: str | None = None,
) -> ValidationResult:
    """
    Validate a promo code for a given cart context.

    Raises `PromotionError` with a translatable code on any failure;
    returns a `ValidationResult` on success.
    """
    normalised = _normalise_code(code)
    if not normalised:
        raise PromotionError("promo.code_required")

    try:
        promotion = Promotion.objects.get(code__iexact=normalised)
    except Promotion.DoesNotExist as exc:
        raise PromotionError("promo.not_found") from exc

    if not promotion.is_active:
        raise PromotionError("promo.inactive")

    now = timezone.now()
    if promotion.starts_at and now < promotion.starts_at:
        raise PromotionError("promo.not_started")
    if promotion.ends_at and now > promotion.ends_at:
        raise PromotionError("promo.expired")

    if promotion.is_exhausted:
        raise PromotionError("promo.exhausted")

    if cart_subtotal < promotion.min_subtotal:
        raise PromotionError("promo.min_subtotal")

    # First-order-only check — must cover BOTH authenticated users and
    # guests checking out with an email that has prior orders, otherwise
    # a logged-out customer could just clear cookies and reapply a
    # "first order" discount on every order. We look up prior orders by
    # user OR by email.
    if promotion.is_first_order_only:
        from apps.orders.models import Order
        prior_qs = Order.objects.exclude(status=Order.Status.CANCELLED)
        has_prior = False
        if user and user.is_authenticated:
            has_prior = prior_qs.filter(user=user).exists()
        if not has_prior and email:
            has_prior = prior_qs.filter(email__iexact=email).exists()
        if has_prior:
            raise PromotionError("promo.first_order_only")

    # Per-user cap
    if promotion.max_uses_per_user is not None:
        prior_uses = _count_prior_redemptions(promotion, user, email)
        if prior_uses >= promotion.max_uses_per_user:
            raise PromotionError("promo.already_used")
    elif promotion.is_one_per_customer:
        prior_uses = _count_prior_redemptions(promotion, user, email)
        if prior_uses >= 1:
            raise PromotionError("promo.already_used")

    # Compute the discount on eligible items
    eligible_subtotal = _eligible_subtotal(promotion, cart_lines)
    if eligible_subtotal == 0 and promotion.discount_type == Promotion.DiscountType.PERCENT:
        raise PromotionError("promo.scope_mismatch")

    discount_amount = compute_discount(
        promotion=promotion,
        eligible_subtotal=eligible_subtotal,
        shipping_cost=shipping_cost,
    )

    return ValidationResult(
        promotion=promotion,
        discount_amount=discount_amount,
        applies_to_shipping=promotion.discount_type == Promotion.DiscountType.FREE_SHIPPING,
    )


def _count_prior_redemptions(promotion: Promotion, user, email: str | None) -> int:
    qs = PromotionRedemption.objects.filter(promotion=promotion)
    if user and getattr(user, "is_authenticated", False):
        qs = qs.filter(user=user)
    elif email:
        qs = qs.filter(guest_email__iexact=email)
    else:
        return 0
    return qs.count()


def compute_discount(
    *,
    promotion: Promotion,
    eligible_subtotal: int,
    shipping_cost: int,
) -> int:
    """
    Returns the discount amount this promotion would apply, in pence.
    Never returns more than the eligible subtotal (or shipping_cost).
    """
    if promotion.discount_type == Promotion.DiscountType.PERCENT:
        # Floor division so we never give back more than the eligible amount.
        raw = eligible_subtotal * promotion.discount_value // 100
        return max(0, min(raw, eligible_subtotal))

    if promotion.discount_type == Promotion.DiscountType.FREE_SHIPPING:
        return max(0, shipping_cost)

    return 0


# ---------------------------------------------------------------------------
# Redemption (called from fulfill_order)
# ---------------------------------------------------------------------------
@transaction.atomic
def redeem(*, promotion_id, order, user, guest_email: str, discount_amount: int, subtotal: int) -> bool:
    """
    Atomically record that an order consumed a promotion.

    Idempotent: if a redemption already exists for (promotion, order) we
    do nothing and return False, so webhook retries can't double-count.
    Returns True if a new redemption was created.
    """
    if not promotion_id:
        return False

    try:
        promotion = Promotion.objects.select_for_update().get(id=promotion_id)
    except Promotion.DoesNotExist:
        return False

    try:
        PromotionRedemption.objects.create(
            promotion=promotion,
            order=order,
            user=user if user and getattr(user, "is_authenticated", False) else None,
            guest_email=guest_email or "",
            discount_amount=discount_amount,
            subtotal_at_use=subtotal,
        )
    except IntegrityError:
        # Already redeemed for this order — webhook retry, ignore.
        return False

    Promotion.objects.filter(id=promotion.id).update(
        times_used=F("times_used") + 1,
    )
    return True


# ---------------------------------------------------------------------------
# Code generation helpers (used by newsletter flow + admin "generate" button)
# ---------------------------------------------------------------------------
def track_click(code: str) -> bool:
    """
    Atomically bump the click counter for a promotion.

    Used to record how many times a `?promo=CODE` link was opened in a
    browser, even if the visitor never completes a checkout. Returns True
    if a known code was incremented, False otherwise.
    """
    normalised = _normalise_code(code)
    if not normalised:
        return False
    updated = Promotion.objects.filter(code__iexact=normalised).update(
        click_count=F("click_count") + 1,
    )
    return updated > 0


def build_cart_lines_from_validated_items(validated_items: list[dict]) -> list[CartLine]:
    """
    Convert the output of `apps.orders.services.validate_cart` into the
    lightweight CartLine shape consumed by the validation service.

    Each validated item already carries `variant` and `product` ORM objects,
    so we read brand_id and category_ids in one go (small N — a single cart).
    """
    from apps.products.models import ProductCategory

    lines: list[CartLine] = []

    # Bulk-load category memberships once for all products in the cart
    product_ids = [str(item["product"].id) for item in validated_items]
    category_map: dict[str, list[str]] = {pid: [] for pid in product_ids}
    if product_ids:
        for pc in ProductCategory.objects.filter(product_id__in=product_ids).only(
            "product_id", "category_id"
        ):
            category_map.setdefault(str(pc.product_id), []).append(str(pc.category_id))

    for item in validated_items:
        product = item["product"]
        lines.append(
            CartLine(
                product_id=str(product.id),
                brand_id=str(product.brand_id) if product.brand_id else None,
                category_ids=tuple(category_map.get(str(product.id), [])),
                line_total=item["line_total"],
            )
        )
    return lines


def generate_unique_code(prefix: str = "WELCOME", length: int = 6) -> str:
    """
    Generate a random code with the given prefix that doesn't already exist.
    Length is the random suffix length (uppercase + digits).
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
    for _ in range(10):
        suffix = "".join(secrets.choice(alphabet) for _ in range(length))
        code = f"{prefix}-{suffix}"
        if not Promotion.objects.filter(code__iexact=code).exists():
            return code
    raise RuntimeError("Could not generate a unique promotion code after 10 attempts")
