"""
Financial reports: sales, inventory valuation, top products/suppliers, VAT return.
"""

import csv
from datetime import datetime, timedelta

from django.db.models import Sum, Count, F
from django.http import HttpResponse
from django.utils import timezone

from apps.core.responses import success_response
from apps.orders.models import Order, OrderItem
from apps.products.models import ProductVariant
from apps.procurement.models import PurchaseOrder, StockBatch
from apps.promotions.models import Promotion, PromotionRedemption
from apps.admin_panel.views.base import AdminBaseView


def _parse_date_range(request):
    today = timezone.localdate()
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")

    if date_from_str:
        date_from = datetime.strptime(date_from_str, "%Y-%m-%d").date()
    else:
        date_from = today - timedelta(days=30)

    if date_to_str:
        date_to = datetime.strptime(date_to_str, "%Y-%m-%d").date()
    else:
        date_to = today

    return date_from, date_to


class AdminSalesReportView(AdminBaseView):
    required_permission = "reports.view"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        orders = Order.objects.filter(
            paid_at__date__gte=date_from,
            paid_at__date__lte=date_to,
        ).exclude(status=Order.Status.CANCELLED)

        revenue = orders.aggregate(t=Sum("total"))["t"] or 0
        vat_collected = orders.aggregate(t=Sum("vat_amount"))["t"] or 0
        orders_count = orders.count()

        cogs = OrderItem.objects.filter(
            order__in=orders
        ).aggregate(t=Sum("cogs_amount"))["t"] or 0

        gross_profit = (revenue - vat_collected) - cogs

        return success_response(data={
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "orders_count": orders_count,
            "revenue_pence": revenue,
            "revenue_net_vat_pence": revenue - vat_collected,
            "vat_collected_pence": vat_collected,
            "cogs_pence": cogs,
            "gross_profit_pence": gross_profit,
            "gross_margin_percent": (
                round((gross_profit / (revenue - vat_collected)) * 100, 2)
                if (revenue - vat_collected) > 0 else 0
            ),
        })


class AdminSalesReportExportView(AdminBaseView):
    required_permission = "reports.export"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        orders = Order.objects.filter(
            paid_at__date__gte=date_from,
            paid_at__date__lte=date_to,
        ).exclude(status=Order.Status.CANCELLED).order_by("paid_at")

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="sales_{date_from}_{date_to}.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([
            "Order Number", "Date", "Customer Email", "Subtotal (£)",
            "Shipping (£)", "VAT (£)", "Total (£)", "Status",
        ])

        for o in orders:
            writer.writerow([
                o.order_number,
                o.paid_at.date().isoformat() if o.paid_at else "",
                o.email,
                f"{o.subtotal / 100:.2f}",
                f"{o.shipping_cost / 100:.2f}",
                f"{o.vat_amount / 100:.2f}",
                f"{o.total / 100:.2f}",
                o.status,
            ])

        return response


class AdminInventoryValuationView(AdminBaseView):
    required_permission = "reports.view"

    def get(self, request):
        # Sum of all remaining stock × cost across all batches
        total_value = StockBatch.objects.aggregate(
            v=Sum(F("quantity_remaining") * F("unit_cost"))
        )["v"] or 0

        total_units = StockBatch.objects.aggregate(
            u=Sum("quantity_remaining")
        )["u"] or 0

        # Per-variant breakdown (top 50 by value)
        variants = (
            ProductVariant.objects.filter(is_active=True, stock_quantity__gt=0)
            .annotate(
                total_value=Sum(
                    F("stock_batches__quantity_remaining") * F("stock_batches__unit_cost")
                )
            )
            .order_by("-total_value")[:50]
        )

        breakdown = []
        for v in variants:
            t = v.product.translations.filter(language="en").first()
            breakdown.append({
                "variant_id": str(v.id),
                "sku": v.sku,
                "product_name": t.name if t else "",
                "stock_quantity": v.stock_quantity,
                "valuation_pence": v.total_value or 0,
            })

        return success_response(data={
            "total_valuation_pence": total_value,
            "total_units": total_units,
            "top_variants": breakdown,
        })


class AdminTopProductsView(AdminBaseView):
    required_permission = "reports.view"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        items = (
            OrderItem.objects.filter(
                order__paid_at__date__gte=date_from,
                order__paid_at__date__lte=date_to,
            )
            .exclude(order__status=Order.Status.CANCELLED)
            .values("product_id", "product_name")
            .annotate(
                quantity_sold=Sum("quantity"),
                revenue=Sum("line_total"),
            )
            .order_by("-revenue")[:25]
        )

        return success_response(data=list(items))


class AdminTopSuppliersView(AdminBaseView):
    required_permission = "reports.view"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        pos = (
            PurchaseOrder.objects.filter(
                created_at__date__gte=date_from,
                created_at__date__lte=date_to,
            )
            .exclude(status=PurchaseOrder.Status.CANCELLED)
            .values("supplier__id", "supplier__name")
            .annotate(
                po_count=Count("id"),
                total_spent=Sum("total"),
            )
            .order_by("-total_spent")[:25]
        )

        return success_response(data=list(pos))


class AdminVatReturnView(AdminBaseView):
    required_permission = "reports.view"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        # Sales VAT collected
        sales_vat = Order.objects.filter(
            paid_at__date__gte=date_from,
            paid_at__date__lte=date_to,
        ).exclude(status=Order.Status.CANCELLED).aggregate(
            t=Sum("vat_amount")
        )["t"] or 0

        # Purchase VAT paid (from POs received in period)
        purchase_vat = PurchaseOrder.objects.filter(
            received_at__date__gte=date_from,
            received_at__date__lte=date_to,
        ).aggregate(t=Sum("vat_amount"))["t"] or 0

        return success_response(data={
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "sales_vat_pence": sales_vat,
            "purchase_vat_pence": purchase_vat,
            "net_vat_due_pence": sales_vat - purchase_vat,
        })


class AdminVatReturnExportView(AdminBaseView):
    required_permission = "reports.export"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="vat_return_{date_from}_{date_to}.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(["VAT Return", f"{date_from} — {date_to}"])
        writer.writerow([])
        writer.writerow(["Order Number", "Date", "Net (£)", "VAT (£)", "Total (£)"])

        orders = Order.objects.filter(
            paid_at__date__gte=date_from,
            paid_at__date__lte=date_to,
        ).exclude(status=Order.Status.CANCELLED).order_by("paid_at")

        sales_vat = 0
        for o in orders:
            net = o.total - o.vat_amount
            sales_vat += o.vat_amount
            writer.writerow([
                o.order_number,
                o.paid_at.date().isoformat() if o.paid_at else "",
                f"{net / 100:.2f}",
                f"{o.vat_amount / 100:.2f}",
                f"{o.total / 100:.2f}",
            ])

        purchase_vat = PurchaseOrder.objects.filter(
            received_at__date__gte=date_from,
            received_at__date__lte=date_to,
        ).aggregate(t=Sum("vat_amount"))["t"] or 0

        writer.writerow([])
        writer.writerow(["", "", "", "Sales VAT collected", f"{sales_vat / 100:.2f}"])
        writer.writerow(["", "", "", "Purchase VAT paid", f"{purchase_vat / 100:.2f}"])
        writer.writerow(["", "", "", "Net VAT due", f"{(sales_vat - purchase_vat) / 100:.2f}"])

        return response


class AdminPromotionsReportView(AdminBaseView):
    """
    Aggregate report on promo code usage and revenue.

    Returns global totals plus a per-code and per-source breakdown
    over the requested date range (defaults to last 30 days).

    Gated by reports.view (not promotions.view) — this is a report
    surface, so Auditor/Order Mgr/etc. should be able to see it even
    if they can't edit promotions. Marketing already has reports.view.
    """

    required_permission = "reports.view"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)

        redemptions = PromotionRedemption.objects.filter(
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )

        totals = redemptions.aggregate(
            count=Count('id'),
            total_discount=Sum('discount_amount'),
            total_revenue=Sum('order__total'),
        )

        # Per-code breakdown
        per_code = (
            redemptions.values(
                'promotion_id',
                'promotion__code',
                'promotion__name',
                'promotion__source',
                'promotion__discount_type',
                'promotion__discount_value',
            )
            .annotate(
                redemption_count=Count('id'),
                total_discount=Sum('discount_amount'),
                total_revenue=Sum('order__total'),
            )
            .order_by('-redemption_count')
        )

        # Per-source breakdown
        per_source = (
            redemptions.values('promotion__source')
            .annotate(
                redemption_count=Count('id'),
                total_discount=Sum('discount_amount'),
                total_revenue=Sum('order__total'),
            )
            .order_by('-redemption_count')
        )

        return success_response(data={
            'date_from': date_from.isoformat(),
            'date_to': date_to.isoformat(),
            'totals': {
                'redemption_count': totals['count'] or 0,
                'total_discount_pence': totals['total_discount'] or 0,
                'total_revenue_pence': totals['total_revenue'] or 0,
            },
            'per_code': [
                {
                    'promotion_id': str(row['promotion_id']),
                    'code': row['promotion__code'],
                    'name': row['promotion__name'],
                    'source': row['promotion__source'],
                    'discount_type': row['promotion__discount_type'],
                    'discount_value': row['promotion__discount_value'],
                    'redemption_count': row['redemption_count'],
                    'total_discount_pence': row['total_discount'] or 0,
                    'total_revenue_pence': row['total_revenue'] or 0,
                }
                for row in per_code
            ],
            'per_source': [
                {
                    'source': row['promotion__source'],
                    'redemption_count': row['redemption_count'],
                    'total_discount_pence': row['total_discount'] or 0,
                    'total_revenue_pence': row['total_revenue'] or 0,
                }
                for row in per_source
            ],
        })

