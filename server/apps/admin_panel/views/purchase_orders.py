from django.db import transaction
from django.utils import timezone

from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)

from apps.procurement.models import PurchaseOrder, PurchaseOrderItem
from apps.procurement.services import receive_purchase_order_items, StockError
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.serializers.procurement import (
    AdminPurchaseOrderDetailSerializer,
    AdminPurchaseOrderListSerializer,
    AdminPurchaseOrderReceiveSerializer,
    AdminPurchaseOrderWriteSerializer,
)
from apps.admin_panel.views.base import AdminBaseView


class AdminPurchaseOrderListView(AdminBaseView):
    required_permissions = {
        "GET": "purchase_orders.view",
        "POST": "purchase_orders.update",
    }

    def get(self, request):
        from django.db.models import Q

        qs = PurchaseOrder.objects.all().select_related("supplier").prefetch_related("items")

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        if request.query_params.get("supplier"):
            qs = qs.filter(supplier_id=request.query_params["supplier"])

        # Date range (created_at)
        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        # Total range (in pence)
        min_total = request.query_params.get("min_total")
        if min_total:
            try:
                qs = qs.filter(total__gte=int(min_total))
            except ValueError:
                pass
        max_total = request.query_params.get("max_total")
        if max_total:
            try:
                qs = qs.filter(total__lte=int(max_total))
            except ValueError:
                pass

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(po_number__icontains=search)
                | Q(supplier__name__icontains=search)
                | Q(supplier_invoice_number__icontains=search)
            )

        ordering = request.query_params.get("ordering", "-created_at")
        allowed = {
            "created_at", "-created_at",
            "total", "-total",
            "expected_date", "-expected_date",
            "po_number", "-po_number",
        }
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminPurchaseOrderListSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = AdminPurchaseOrderWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data

        po = PurchaseOrder.objects.create(
            po_number=PurchaseOrder.generate_po_number(),
            supplier_id=data["supplier_id"],
            expected_date=data.get("expected_date"),
            supplier_invoice_number=data.get("supplier_invoice_number", ""),
            shipping_cost=data.get("shipping_cost", 0),
            notes=data.get("notes", ""),
            created_by=request.user,
        )

        for item_data in data["items"]:
            PurchaseOrderItem.objects.create(
                purchase_order=po,
                variant_id=item_data["variant_id"],
                quantity_ordered=item_data["quantity_ordered"],
                unit_cost=item_data["unit_cost"],
                vat_amount=item_data.get("vat_amount", 0),
            )

        po.recalculate_totals()
        return created_response(data=AdminPurchaseOrderDetailSerializer(po).data)


class AdminPurchaseOrderDetailView(AdminBaseView):
    required_permissions = {
        "GET": "purchase_orders.view",
        "PATCH": "purchase_orders.update",
    }

    def _get(self, po_id):
        try:
            return PurchaseOrder.objects.prefetch_related("items").get(id=po_id)
        except PurchaseOrder.DoesNotExist:
            return None

    def get(self, request, po_id):
        po = self._get(po_id)
        if not po:
            return error_response("admin.purchase_orders.not_found", status_code=404)
        return success_response(data=AdminPurchaseOrderDetailSerializer(po).data)

    def patch(self, request, po_id):
        po = self._get(po_id)
        if not po:
            return error_response("admin.purchase_orders.not_found", status_code=404)
        if po.status != PurchaseOrder.Status.DRAFT:
            return error_response("admin.purchase_orders.not_editable")

        for field in ["expected_date", "supplier_invoice_number", "shipping_cost", "notes"]:
            if field in request.data:
                setattr(po, field, request.data[field])
        po.save()
        po.recalculate_totals()
        return success_response(data=AdminPurchaseOrderDetailSerializer(po).data)


class AdminPurchaseOrderSendView(AdminBaseView):
    required_permission = "purchase_orders.update"

    def post(self, request, po_id):
        try:
            po = PurchaseOrder.objects.get(id=po_id)
        except PurchaseOrder.DoesNotExist:
            return error_response("admin.purchase_orders.not_found", status_code=404)

        if po.status != PurchaseOrder.Status.DRAFT:
            return error_response("admin.purchase_orders.invalid_status")

        po.status = PurchaseOrder.Status.SENT
        po.sent_at = timezone.now()
        po.save(update_fields=["status", "sent_at"])
        return success_response(data=AdminPurchaseOrderDetailSerializer(po).data)


class AdminPurchaseOrderReceiveView(AdminBaseView):
    required_permission = "purchase_orders.receive"

    def post(self, request, po_id):
        try:
            po = PurchaseOrder.objects.get(id=po_id)
        except PurchaseOrder.DoesNotExist:
            return error_response("admin.purchase_orders.not_found", status_code=404)

        serializer = AdminPurchaseOrderReceiveSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        try:
            receive_purchase_order_items(
                po=po,
                item_quantities=serializer.validated_data["items"],
                user=request.user,
            )
        except StockError as e:
            return error_response(f"admin.{e.args[0]}")

        po.refresh_from_db()
        return success_response(data=AdminPurchaseOrderDetailSerializer(po).data)


class AdminPurchaseOrderCancelView(AdminBaseView):
    required_permission = "purchase_orders.cancel"

    def post(self, request, po_id):
        try:
            po = PurchaseOrder.objects.get(id=po_id)
        except PurchaseOrder.DoesNotExist:
            return error_response("admin.purchase_orders.not_found", status_code=404)

        if po.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.SENT):
            return error_response("admin.purchase_orders.cannot_cancel")

        po.status = PurchaseOrder.Status.CANCELLED
        po.cancelled_at = timezone.now()
        po.save(update_fields=["status", "cancelled_at"])
        return success_response(data=AdminPurchaseOrderDetailSerializer(po).data)
