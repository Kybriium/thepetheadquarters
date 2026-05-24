from rest_framework import serializers

from apps.orders.models import Order, OrderItem


class AdminOrderListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "email",
            "customer_name",
            "total",
            "vat_amount",
            "item_count",
            "tracking_carrier",
            "tracking_number",
            "created_at",
            "paid_at",
            "shipped_at",
        ]

    def get_item_count(self, obj):
        return obj.items.count()

    def get_customer_name(self, obj):
        return obj.shipping_full_name


class AdminOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product_id",
            "variant_id",
            "product_name",
            "variant_sku",
            "variant_option_label",
            "unit_price",
            "quantity",
            "line_total",
            "vat_amount",
            "cogs_amount",
            "image_url",
            "fulfillment_type",
            "fulfillment_status",
            "supplier_id",
            "supplier_cost",
            "forwarded_to_supplier_at",
            "customizations",
            "customization_surcharge",
        ]


class AdminOrderDetailSerializer(serializers.ModelSerializer):
    items = AdminOrderItemSerializer(many=True, read_only=True)
    customer_id = serializers.SerializerMethodField()
    tracking_link = serializers.CharField(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "email",
            "customer_id",
            "user_id",
            "shipping_full_name",
            "shipping_address_line_1",
            "shipping_address_line_2",
            "shipping_city",
            "shipping_county",
            "shipping_postcode",
            "shipping_country",
            "shipping_phone",
            "subtotal",
            "shipping_cost",
            "vat_amount",
            "vat_rate",
            "total",
            "stripe_checkout_session_id",
            "stripe_payment_intent_id",
            "tracking_carrier",
            "tracking_number",
            "tracking_url",
            "tracking_link",
            "paid_at",
            "shipped_at",
            "delivered_at",
            "cancelled_at",
            "refunded_at",
            "refund_amount",
            "internal_notes",
            "created_at",
            "updated_at",
            "items",
        ]

    def get_customer_id(self, obj):
        return str(obj.user_id) if obj.user_id else None
