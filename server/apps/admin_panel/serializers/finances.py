from rest_framework import serializers

from apps.expenses.models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    """
    Read serializer for the Finances admin list / detail. Includes a
    signed URL for the attached receipt (short-lived) and a few
    convenience fields the UI uses for rendering.
    """
    amount_pounds = serializers.SerializerMethodField()
    receipt_url = serializers.SerializerMethodField()
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    has_receipt = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = [
            "id",
            "paid_at",
            "category",
            "category_label",
            "amount_pence",
            "amount_pounds",
            "vat_amount_pence",
            "currency",
            "description",
            "supplier",
            "supplier_name",
            "order",
            "order_number",
            "purchase_order",
            "receipt_filename",
            "receipt_content_type",
            "receipt_url",
            "has_receipt",
            "notes",
            "auto_created",
            "external_ref",
            "created_at",
            "updated_at",
        ]
        read_only_fields = (
            "auto_created",
            "external_ref",
            "created_at",
            "updated_at",
            "amount_pounds",
            "receipt_url",
            "supplier_name",
            "order_number",
            "category_label",
            "has_receipt",
        )

    def get_amount_pounds(self, obj):
        return round(obj.amount_pence / 100, 2)

    def get_has_receipt(self, obj):
        return bool(obj.receipt_key)

    def get_receipt_url(self, obj):
        """
        Returns an absolute URL the admin browser can open directly.

        Always points at our authenticated `receipt/file/` endpoint —
        that endpoint then either 302-redirects to the signed bucket URL
        (production) or streams the file from disk (local fallback).
        Going through Django keeps the file private regardless of mode
        and avoids the "/media/private/..." path being interpreted by
        the Next.js frontend at :3000.
        """
        if not obj.receipt_key:
            return None
        request = self.context.get("request")
        path = f"/api/v1/admin/expenses/{obj.id}/receipt/file/"
        if request is not None:
            return request.build_absolute_uri(path)
        # No request context (e.g. during a sync background job) — fall
        # back to a relative URL. The frontend will resolve against the
        # API base when this happens, which is rare.
        return path


class ExpenseWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for manual admin entries. Auto-created rows are
    edited via separate code paths (the auto-recording services), so
    this serializer doesn't touch external_ref or auto_created.
    """
    class Meta:
        model = Expense
        fields = [
            "paid_at",
            "category",
            "amount_pence",
            "vat_amount_pence",
            "currency",
            "description",
            "supplier",
            "order",
            "purchase_order",
            "notes",
        ]

    def validate_amount_pence(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive.")
        return value

    def validate(self, attrs):
        vat = attrs.get("vat_amount_pence", 0)
        amount = attrs.get("amount_pence", 0)
        if vat and amount and vat > amount:
            raise serializers.ValidationError(
                {"vat_amount_pence": "VAT can't exceed the total amount."}
            )
        return attrs
