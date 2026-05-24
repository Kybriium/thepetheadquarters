from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class PendingCheckout(BaseModel):
    """
    Temporary storage for cart data + shipping address while a Stripe
    checkout session is in progress. Created before Stripe session,
    looked up in the webhook by UUID stored in Stripe metadata.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    email = models.EmailField()
    items_data = models.JSONField()
    shipping_data = models.JSONField()
    subtotal = models.PositiveIntegerField()
    shipping_cost = models.PositiveIntegerField()
    total = models.PositiveIntegerField()
    # Promotion snapshot — applied at session creation, consumed in webhook.
    promotion_id = models.UUIDField(null=True, blank=True)
    promotion_code = models.CharField(max_length=64, blank=True, default="")
    discount_amount = models.PositiveIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        pass


CARRIER_TRACKING_URLS = {
    "royal_mail": "https://www.royalmail.com/track-your-item#/tracking-results/{number}",
    "dpd": "https://track.dpd.co.uk/parcels/{number}",
    "evri": "https://www.evri.com/track/parcel/{number}",
    "ups": "https://www.ups.com/track?tracknum={number}",
}


class Order(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        PROCESSING = "processing", "Processing"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    class Carrier(models.TextChoices):
        ROYAL_MAIL = "royal_mail", "Royal Mail"
        DPD = "dpd", "DPD"
        EVRI = "evri", "Evri"
        UPS = "ups", "UPS"
        OTHER = "other", "Other"

    order_number = models.CharField(max_length=12, unique=True, db_index=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )
    email = models.EmailField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    # Shipping address — embedded snapshot at order time
    shipping_full_name = models.CharField(max_length=255)
    shipping_address_line_1 = models.CharField(max_length=255)
    shipping_address_line_2 = models.CharField(max_length=255, blank=True)
    shipping_city = models.CharField(max_length=100)
    shipping_county = models.CharField(max_length=100, blank=True)
    shipping_postcode = models.CharField(max_length=10)
    shipping_country = models.CharField(max_length=2, default="GB")
    shipping_phone = models.CharField(max_length=20, blank=True)

    # Totals in pence
    subtotal = models.PositiveIntegerField()
    shipping_cost = models.PositiveIntegerField()
    discount_amount = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField()

    # Promotion snapshot — kept on the order even if Promotion row is later deleted
    promotion_code = models.CharField(max_length=64, blank=True, default="", db_index=True)

    # VAT (UK) — VAT is included in subtotal/total (PRICES_INCLUDE_VAT)
    vat_amount = models.PositiveIntegerField(default=0)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0)

    # Stripe
    stripe_checkout_session_id = models.CharField(
        max_length=255, unique=True, db_index=True,
    )
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True)

    # Tracking
    tracking_carrier = models.CharField(
        max_length=20, choices=Carrier.choices, blank=True, default="",
    )
    tracking_number = models.CharField(max_length=100, blank=True, default="")
    tracking_url = models.URLField(max_length=500, blank=True, default="")

    # Lifecycle timestamps
    paid_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    refund_amount = models.PositiveIntegerField(default=0)

    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True, default="")

    class Meta(BaseModel.Meta):
        pass

    def __str__(self):
        return self.order_number

    @property
    def tracking_link(self):
        """Return derived tracking URL for the carrier, or stored URL for 'other'."""
        if not self.tracking_carrier:
            return ""
        if self.tracking_carrier == self.Carrier.OTHER:
            return self.tracking_url
        template = CARRIER_TRACKING_URLS.get(self.tracking_carrier, "")
        if template and self.tracking_number:
            return template.format(number=self.tracking_number)
        return ""

    @staticmethod
    def generate_order_number():
        last = (
            Order.objects
            .order_by("-created_at")
            .values_list("order_number", flat=True)
            .first()
        )
        if last:
            seq = int(last.split("-")[1]) + 1
        else:
            seq = 1
        return f"TPH-{seq:06d}"


class OrderItem(BaseModel):
    class FulfillmentStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"

    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="items",
    )
    product = models.ForeignKey(
        "products.Product", on_delete=models.SET_NULL, null=True,
    )
    variant = models.ForeignKey(
        "products.ProductVariant", on_delete=models.SET_NULL, null=True,
    )

    # Snapshots at order time
    product_name = models.CharField(max_length=300)
    variant_sku = models.CharField(max_length=100)
    variant_option_label = models.CharField(max_length=300, blank=True)
    unit_price = models.PositiveIntegerField()
    quantity = models.PositiveIntegerField()
    line_total = models.PositiveIntegerField()
    image_url = models.URLField(max_length=500, blank=True)

    # VAT snapshot
    vat_amount = models.PositiveIntegerField(default=0)

    # COGS — populated on fulfillment from FIFO consumption
    cogs_amount = models.PositiveIntegerField(default=0)

    # Customer-supplied personalization snapshot (engraved name, uploaded
    # image URL, position choice, etc.). Stored as a list of dicts:
    #   [{key, label, field_type, value, label_value,
    #     surcharge_pence, image_public_id?}, ...]
    # Each dict is a frozen snapshot at order time so renamed/deleted fields
    # later don't change what the customer ordered. Empty list = not customized.
    customizations = models.JSONField(default=list, blank=True)
    customization_surcharge = models.PositiveIntegerField(
        default=0,
        help_text="Per-unit surcharge from customizations, already folded into unit_price.",
    )

    # Per-item fulfillment for mixed self/dropship orders
    fulfillment_type = models.CharField(max_length=10, default="self")
    fulfillment_status = models.CharField(
        max_length=20,
        choices=FulfillmentStatus.choices,
        default=FulfillmentStatus.PENDING,
    )

    # Dropship — supplier link captured when forwarded
    supplier_id = models.UUIDField(null=True, blank=True, db_index=True)
    supplier_cost = models.PositiveIntegerField(default=0)
    forwarded_to_supplier_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        pass

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"
