from django.db.models import Q

from apps.core.responses import error_response, success_response

from apps.products.models import ProductVariant
from apps.procurement.models import StockBatch, StockMovement
from apps.procurement.services import adjust_stock
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView
from rest_framework import serializers


class InventoryItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_id = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "sku",
            "product_id",
            "product_name",
            "primary_image",
            "price",
            "stock_quantity",
            "is_active",
        ]

    def get_product_name(self, obj):
        t = obj.product.translations.filter(language="en").first()
        return t.name if t else ""

    def get_product_id(self, obj):
        return str(obj.product_id)

    def get_primary_image(self, obj):
        img = obj.product.images.filter(is_primary=True).first()
        return img.url if img else ""


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = [
            "id",
            "type",
            "quantity",
            "unit_cost_at_time",
            "total_cost",
            "notes",
            "created_at",
        ]


class StockBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockBatch
        fields = [
            "id",
            "quantity_received",
            "quantity_remaining",
            "unit_cost",
            "received_at",
            "notes",
        ]


class AdminInventoryListView(AdminBaseView):
    required_permission = "inventory.view"

    def get(self, request):
        qs = ProductVariant.objects.select_related("product").filter(is_active=True)

        level = request.query_params.get("level")
        if level == "out":
            qs = qs.filter(stock_quantity=0)
        elif level == "low":
            qs = qs.filter(stock_quantity__gt=0, stock_quantity__lt=10)
        elif level == "in":
            qs = qs.filter(stock_quantity__gte=10)

        if request.query_params.get("brand"):
            qs = qs.filter(product__brand_id=request.query_params["brand"])
        if request.query_params.get("category"):
            qs = qs.filter(product__product_categories__category_id=request.query_params["category"])

        # Stock range
        min_stock = request.query_params.get("min_stock")
        if min_stock:
            try:
                qs = qs.filter(stock_quantity__gte=int(min_stock))
            except ValueError:
                pass
        max_stock = request.query_params.get("max_stock")
        if max_stock:
            try:
                qs = qs.filter(stock_quantity__lte=int(max_stock))
            except ValueError:
                pass

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(sku__icontains=search) | Q(product__translations__name__icontains=search)
            ).distinct()

        ordering = request.query_params.get("ordering", "stock_quantity")
        allowed = {
            "stock_quantity", "-stock_quantity",
            "sku", "-sku",
            "price", "-price",
        }
        if ordering not in allowed:
            ordering = "stock_quantity"
        qs = qs.order_by(ordering, "sku")

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(InventoryItemSerializer(page, many=True).data)


class AdminInventoryUpdateView(AdminBaseView):
    required_permission = "inventory.update"

    def patch(self, request, variant_id):
        try:
            variant = ProductVariant.objects.get(id=variant_id)
        except ProductVariant.DoesNotExist:
            return error_response("admin.variants.not_found", status_code=404)

        new_qty = request.data.get("stock_quantity")
        if new_qty is None or int(new_qty) < 0:
            return error_response("admin.inventory.invalid_quantity")

        notes = request.data.get("notes", "")
        adjust_stock(variant=variant, new_quantity=int(new_qty), user=request.user, notes=notes)

        variant.refresh_from_db()
        return success_response(data={"id": str(variant.id), "stock_quantity": variant.stock_quantity})


class AdminInventoryMovementsView(AdminBaseView):
    required_permission = "inventory.view"

    def get(self, request, variant_id):
        movements = StockMovement.objects.filter(variant_id=variant_id).order_by("-created_at")[:200]
        return success_response(data=StockMovementSerializer(movements, many=True).data)


class AdminInventoryBatchesView(AdminBaseView):
    required_permission = "inventory.view"

    def get(self, request, variant_id):
        batches = StockBatch.objects.filter(variant_id=variant_id).order_by("received_at")
        return success_response(data=StockBatchSerializer(batches, many=True).data)
