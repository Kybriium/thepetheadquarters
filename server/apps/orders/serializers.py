from rest_framework import serializers

from apps.orders.models import Order, OrderItem


class CustomizationAnswerSerializer(serializers.Serializer):
    """One entry in the customer's per-line customization payload."""

    key = serializers.CharField(max_length=80)
    # Free-form value: string for text/image-url/select, or {url, public_id}
    # for an image upload result. Server-side validator in
    # apps.customizations.services enforces shape against the product's schema.
    value = serializers.JSONField()


class CheckoutItemSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=99)
    customizations = CustomizationAnswerSerializer(
        many=True, required=False, default=list
    )


class ShippingAddressSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100)
    county = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    postcode = serializers.CharField(max_length=10)
    country = serializers.CharField(max_length=2, default="GB")
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")


class CreateCheckoutSessionSerializer(serializers.Serializer):
    items = CheckoutItemSerializer(many=True)
    shipping_address = ShippingAddressSerializer()
    email = serializers.EmailField(required=False)
    saved_address_id = serializers.UUIDField(required=False)
    promotion_code = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "id", "product_name", "variant_sku", "variant_option_label",
            "unit_price", "quantity", "line_total", "image_url",
            "fulfillment_status",
            "customizations", "customization_surcharge",
        ]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    # Tracking — only populated once the order is shipped. tracking_link is
    # derived from carrier+number for known couriers (Royal Mail, DPD, Evri,
    # UPS) and falls back to tracking_url for the "Other" carrier.
    tracking_carrier_display = serializers.SerializerMethodField()
    tracking_link = serializers.CharField(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "status", "email",
            "subtotal", "shipping_cost", "discount_amount", "promotion_code",
            "vat_amount", "vat_rate", "total",
            "created_at", "paid_at", "shipped_at", "delivered_at",
            "shipping_full_name", "shipping_address_line_1",
            "shipping_address_line_2", "shipping_city",
            "shipping_county", "shipping_postcode", "shipping_country",
            "tracking_carrier", "tracking_carrier_display",
            "tracking_number", "tracking_link",
            "items",
        ]

    def get_tracking_carrier_display(self, obj) -> str:
        return obj.get_tracking_carrier_display() if obj.tracking_carrier else ""


class OrderListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "status", "total",
            "created_at", "item_count",
        ]

    def get_item_count(self, obj):
        return obj.items.count()
