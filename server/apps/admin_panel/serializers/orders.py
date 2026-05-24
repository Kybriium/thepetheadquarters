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
    # Suppliers that already exist for this item's variant — so when
    # the admin clicks "Forward to supplier" the modal can suggest
    # known suppliers (with their URL + last cost + SKU) instead of
    # forcing them to type everything from scratch.
    available_suppliers = serializers.SerializerMethodField()
    # When the item HAS been forwarded, denormalised supplier details
    # so the order page can render "Forwarded to <name>" + a one-click
    # "Open supplier listing →" link without a second request.
    assigned_supplier = serializers.SerializerMethodField()

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
            "available_suppliers",
            "assigned_supplier",
            "customizations",
            "customization_surcharge",
        ]

    def get_available_suppliers(self, obj):
        """List of SupplierProduct rows linked to this OrderItem's variant.
        Returned in `is_preferred` first, newest second order so the
        admin's habitual supplier surfaces at the top of the modal."""
        if not obj.variant_id:
            return []
        from apps.suppliers.models import SupplierProduct
        rows = (
            SupplierProduct.objects
            .filter(variant_id=obj.variant_id, supplier__is_active=True)
            .select_related("supplier")
            .order_by("-is_preferred", "-last_purchased_at", "-created_at")
        )
        return [
            {
                "supplier_id": str(r.supplier_id),
                "supplier_name": r.supplier.name,
                "supplier_url": r.supplier_url,
                "supplier_sku": r.supplier_sku,
                "last_cost_pence": r.last_cost,
                "is_preferred": r.is_preferred,
                "notes": r.notes,
            }
            for r in rows
        ]

    def get_assigned_supplier(self, obj):
        """Resolve the supplier the admin actually chose when forwarding.
        Combines the OrderItem's supplier_id (snapshot) with the
        SupplierProduct row for that variant so we can show the URL +
        SKU inline. Returns None when not forwarded yet."""
        if not obj.supplier_id:
            return None
        from apps.suppliers.models import Supplier, SupplierProduct
        try:
            supplier = Supplier.objects.get(id=obj.supplier_id)
        except Supplier.DoesNotExist:
            return None
        # Try to pull the URL/SKU from the supplier-product row. Falls
        # back to just the name if the admin removed the link later.
        sp = SupplierProduct.objects.filter(
            supplier_id=obj.supplier_id, variant_id=obj.variant_id,
        ).first()
        return {
            "supplier_id": str(supplier.id),
            "supplier_name": supplier.name,
            "supplier_url": sp.supplier_url if sp else "",
            "supplier_sku": sp.supplier_sku if sp else "",
            "cost_pence": obj.supplier_cost,
            "forwarded_at": obj.forwarded_to_supplier_at.isoformat()
                if obj.forwarded_to_supplier_at else None,
        }


class AdminOrderDetailSerializer(serializers.ModelSerializer):
    items = AdminOrderItemSerializer(many=True, read_only=True)
    customer_id = serializers.SerializerMethodField()
    tracking_link = serializers.CharField(read_only=True)
    # Expenses linked to this order — surfaced so the admin order
    # detail page can show "Stripe fee", "Cost of goods (dropship)",
    # etc. inline without a separate trip to /admin/finances.
    expenses = serializers.SerializerMethodField()

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
            "expenses",
        ]

    def get_expenses(self, obj):
        # Lazy import keeps the orders serializer free of an expenses
        # dependency at module load. Use the same serializer the
        # finances API uses so the shape is identical for the admin UI.
        from apps.admin_panel.serializers.finances import ExpenseSerializer
        qs = obj.expenses.all().order_by("-paid_at", "-created_at")
        return ExpenseSerializer(qs, many=True, context=self.context).data

    def get_customer_id(self, obj):
        return str(obj.user_id) if obj.user_id else None
