from django.db import transaction
from django.db.models import Count, Q, Sum
from rest_framework import serializers

from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)

from apps.promotions.models import Promotion, PromotionRedemption
from apps.promotions.services import generate_unique_code
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
class AdminPromotionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Promotion
        fields = [
            "id",
            "code",
            "name",
            "discount_type",
            "discount_value",
            "scope",
            "min_subtotal",
            "is_first_order_only",
            "is_one_per_customer",
            "starts_at",
            "ends_at",
            "max_uses_total",
            "max_uses_per_user",
            "times_used",
            "click_count",
            "is_active",
            "source",
            "campaign_label",
            "created_at",
        ]


class AdminPromotionDetailSerializer(serializers.ModelSerializer):
    scope_category_ids = serializers.SerializerMethodField()
    scope_brand_ids = serializers.SerializerMethodField()
    scope_product_ids = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Promotion
        fields = [
            "id",
            "code",
            "name",
            "description",
            "discount_type",
            "discount_value",
            "scope",
            "scope_category_ids",
            "scope_brand_ids",
            "scope_product_ids",
            "min_subtotal",
            "is_first_order_only",
            "is_one_per_customer",
            "starts_at",
            "ends_at",
            "max_uses_total",
            "max_uses_per_user",
            "times_used",
            "click_count",
            "is_active",
            "source",
            "campaign_label",
            "created_at",
            "updated_at",
            "summary",
        ]

    def get_scope_category_ids(self, obj):
        return [str(c.id) for c in obj.scope_categories.all()]

    def get_scope_brand_ids(self, obj):
        return [str(b.id) for b in obj.scope_brands.all()]

    def get_scope_product_ids(self, obj):
        return [str(p.id) for p in obj.scope_products.all()]

    def get_summary(self, obj):
        agg = obj.redemptions.aggregate(
            total_discount=Sum("discount_amount"),
            total_revenue=Sum("order__total"),
            count=Count("id"),
        )
        redemption_count = agg["count"] or 0
        clicks = obj.click_count or 0
        return {
            "redemption_count": redemption_count,
            "total_discount_pence": agg["total_discount"] or 0,
            "total_revenue_pence": agg["total_revenue"] or 0,
            "click_count": clicks,
            "conversion_rate": (
                round((redemption_count / clicks) * 100, 1) if clicks > 0 else None
            ),
        }


class AdminPromotionWriteSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64, required=False, allow_blank=True)
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(allow_blank=True, required=False, default="")

    discount_type = serializers.ChoiceField(choices=Promotion.DiscountType.choices)
    discount_value = serializers.IntegerField(min_value=0, max_value=100, required=False, default=0)

    scope = serializers.ChoiceField(choices=Promotion.Scope.choices, default=Promotion.Scope.ALL)
    scope_category_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )
    scope_brand_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )
    scope_product_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )

    min_subtotal = serializers.IntegerField(min_value=0, required=False, default=0)
    is_first_order_only = serializers.BooleanField(required=False, default=False)
    is_one_per_customer = serializers.BooleanField(required=False, default=False)

    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    max_uses_total = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    max_uses_per_user = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)

    source = serializers.ChoiceField(
        choices=Promotion.Source.choices, default=Promotion.Source.MANUAL
    )
    campaign_label = serializers.CharField(max_length=120, allow_blank=True, required=False, default="")

    def validate(self, attrs):
        discount_type = attrs.get("discount_type")
        if discount_type == Promotion.DiscountType.PERCENT:
            value = attrs.get("discount_value", 0)
            if not (1 <= value <= 100):
                raise serializers.ValidationError(
                    {"discount_value": "Percent must be between 1 and 100."}
                )
        starts_at = attrs.get("starts_at")
        ends_at = attrs.get("ends_at")
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "End date must be after start date."})
        return attrs


class AdminRedemptionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    order_total = serializers.IntegerField(source="order.total", read_only=True)
    customer_email = serializers.SerializerMethodField()

    class Meta:
        model = PromotionRedemption
        fields = [
            "id",
            "order_number",
            "order_total",
            "customer_email",
            "discount_amount",
            "subtotal_at_use",
            "created_at",
        ]

    def get_customer_email(self, obj):
        if obj.user:
            return obj.user.email
        return obj.guest_email or obj.order.email


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------
class AdminPromotionListView(AdminBaseView):
    required_permissions = {
        "GET": "promotions.view",
        "POST": "promotions.update",
    }

    def get(self, request):
        qs = Promotion.objects.all()

        if request.query_params.get("source"):
            qs = qs.filter(source=request.query_params["source"])

        if request.query_params.get("scope"):
            qs = qs.filter(scope=request.query_params["scope"])

        if request.query_params.get("discount_type"):
            qs = qs.filter(discount_type=request.query_params["discount_type"])

        is_active = request.query_params.get("is_active")
        if is_active == "true":
            qs = qs.filter(is_active=True)
        elif is_active == "false":
            qs = qs.filter(is_active=False)

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(code__icontains=search)
                | Q(name__icontains=search)
                | Q(campaign_label__icontains=search)
            )

        ordering = request.query_params.get("ordering", "-created_at")
        allowed = {
            "created_at", "-created_at",
            "times_used", "-times_used",
            "code", "-code",
            "ends_at", "-ends_at",
        }
        if ordering not in allowed:
            ordering = "-created_at"
        qs = qs.order_by(ordering)

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AdminPromotionListSerializer(page, many=True).data
        )

    @transaction.atomic
    def post(self, request):
        serializer = AdminPromotionWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data

        # Generate code if not supplied
        code = (data.get("code") or "").strip().upper()
        if not code:
            code = generate_unique_code(prefix="PROMO")
        else:
            if Promotion.objects.filter(code__iexact=code).exists():
                return error_response("admin.promotions.code_taken")

        promotion = Promotion.objects.create(
            code=code,
            name=data["name"],
            description=data.get("description", ""),
            discount_type=data["discount_type"],
            discount_value=data.get("discount_value", 0),
            scope=data.get("scope", Promotion.Scope.ALL),
            min_subtotal=data.get("min_subtotal", 0),
            is_first_order_only=data.get("is_first_order_only", False),
            is_one_per_customer=data.get("is_one_per_customer", False),
            starts_at=data.get("starts_at"),
            ends_at=data.get("ends_at"),
            max_uses_total=data.get("max_uses_total"),
            max_uses_per_user=data.get("max_uses_per_user"),
            is_active=data.get("is_active", True),
            source=data.get("source", Promotion.Source.MANUAL),
            campaign_label=data.get("campaign_label", ""),
            created_by=request.user if request.user.is_authenticated else None,
        )

        if data.get("scope_category_ids"):
            promotion.scope_categories.set(data["scope_category_ids"])
        if data.get("scope_brand_ids"):
            promotion.scope_brands.set(data["scope_brand_ids"])
        if data.get("scope_product_ids"):
            promotion.scope_products.set(data["scope_product_ids"])

        return created_response(data=AdminPromotionDetailSerializer(promotion).data)


class AdminPromotionDetailView(AdminBaseView):
    required_permissions = {
        "GET": "promotions.view",
        "PATCH": "promotions.update",
        "DELETE": "promotions.delete",
    }

    def _get(self, promotion_id):
        try:
            return Promotion.objects.prefetch_related(
                "scope_categories", "scope_brands", "scope_products"
            ).get(id=promotion_id)
        except Promotion.DoesNotExist:
            return None

    def get(self, request, promotion_id):
        promotion = self._get(promotion_id)
        if not promotion:
            return error_response("admin.promotions.not_found", status_code=404)
        return success_response(data=AdminPromotionDetailSerializer(promotion).data)

    @transaction.atomic
    def patch(self, request, promotion_id):
        promotion = self._get(promotion_id)
        if not promotion:
            return error_response("admin.promotions.not_found", status_code=404)

        serializer = AdminPromotionWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data

        # Code can only change if never used
        if "code" in data and data["code"]:
            new_code = data["code"].strip().upper()
            if new_code != promotion.code:
                if promotion.times_used > 0:
                    return error_response("admin.promotions.code_locked")
                if Promotion.objects.filter(code__iexact=new_code).exclude(id=promotion.id).exists():
                    return error_response("admin.promotions.code_taken")
                promotion.code = new_code

        for field in [
            "name", "description", "discount_type", "discount_value",
            "scope", "min_subtotal", "is_first_order_only", "is_one_per_customer",
            "starts_at", "ends_at", "max_uses_total", "max_uses_per_user",
            "is_active", "source", "campaign_label",
        ]:
            if field in data:
                setattr(promotion, field, data[field])

        promotion.save()

        if "scope_category_ids" in data:
            promotion.scope_categories.set(data["scope_category_ids"])
        if "scope_brand_ids" in data:
            promotion.scope_brands.set(data["scope_brand_ids"])
        if "scope_product_ids" in data:
            promotion.scope_products.set(data["scope_product_ids"])

        return success_response(data=AdminPromotionDetailSerializer(promotion).data)

    def delete(self, request, promotion_id):
        promotion = self._get(promotion_id)
        if not promotion:
            return error_response("admin.promotions.not_found", status_code=404)

        # Soft delete (deactivate) if it has been used; otherwise hard delete
        if promotion.times_used > 0:
            promotion.is_active = False
            promotion.save(update_fields=["is_active"])
            return success_response(data={"deactivated": True})

        promotion.delete()
        return success_response(data={"deleted": True})


class AdminPromotionRedemptionsView(AdminBaseView):
    required_permission = "promotions.view"

    def get(self, request, promotion_id):
        try:
            promotion = Promotion.objects.get(id=promotion_id)
        except Promotion.DoesNotExist:
            return error_response("admin.promotions.not_found", status_code=404)

        qs = (
            promotion.redemptions.select_related("order", "user")
            .order_by("-created_at")
        )

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AdminRedemptionSerializer(page, many=True).data
        )
