"""
Admin Finances views — the screen the user prepares HMRC year-end
filings from.

Three concerns:
  1. Overview: revenue / COGS / expenses / profit for a date range.
  2. CRUD on the Expense ledger (with receipt file upload).
  3. CSV export for the accountant.

All endpoints are staff-only (inherits AdminBaseView).
"""

from __future__ import annotations

import csv
import io
import logging
import os
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Sum, Q
from django.http import FileResponse, HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework.response import Response

from apps.admin_panel.views.base import AdminBaseView
from apps.admin_panel.serializers.finances import (
    ExpenseSerializer,
    ExpenseWriteSerializer,
)
from apps.core.pagination import StandardPagination
from apps.core.responses import (
    error_response,
    not_found_response,
    success_response,
)
from apps.core.storage import (
    build_receipt_key,
    delete_object,
    put_object,
    signed_url,
)
from apps.expenses.models import Expense
from apps.orders.models import Order

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date-range parsing — shared across all the views below
# ---------------------------------------------------------------------------

def _parse_range(request) -> tuple[date, date]:
    """
    Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD with sensible defaults
    (current UK tax year so far — April 6 → today). UK tax year for
    individuals + small Ltds aligns to April 6 → April 5; defaulting
    to that means the admin lands on the right window when they open
    the screen.
    """
    qp = request.query_params
    today = timezone.localdate()

    # Default to the current UK personal tax year (Apr 6 → Apr 5)
    if today.month < 4 or (today.month == 4 and today.day < 6):
        default_from = date(today.year - 1, 4, 6)
    else:
        default_from = date(today.year, 4, 6)

    def parse(name, fallback):
        raw = qp.get(name)
        if not raw:
            return fallback
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            return fallback

    date_from = parse("from", default_from)
    date_to = parse("to", today)
    return date_from, date_to


# ---------------------------------------------------------------------------
# 1) Overview — revenue / COGS / expenses / profit for the chosen window
# ---------------------------------------------------------------------------

class AdminFinancesOverviewView(AdminBaseView):
    required_permission = "finances.view"

    def get(self, request):
        date_from, date_to = _parse_range(request)

        # Revenue = paid Order totals minus refunds. We use paid_at as
        # the date anchor so refunds in a later window don't reduce the
        # original month's revenue (refunds are tracked separately as
        # refund_given expenses).
        order_qs = (
            Order.objects
            .filter(paid_at__isnull=False)
            .filter(paid_at__date__gte=date_from, paid_at__date__lte=date_to)
            .exclude(status=Order.Status.CANCELLED)
        )
        revenue_pence = order_qs.aggregate(t=Sum("total"))["t"] or 0
        order_count = order_qs.count()

        # Expenses, grouped by category for the same window.
        exp_qs = Expense.objects.filter(paid_at__gte=date_from, paid_at__lte=date_to)
        by_category: dict[str, int] = {c: 0 for c, _ in Expense.Category.choices}
        for row in exp_qs.values("category").annotate(t=Sum("amount_pence")):
            by_category[row["category"]] = int(row["t"] or 0)

        cogs_pence = (
            by_category[Expense.Category.COGS_DROPSHIP]
            + by_category[Expense.Category.COGS_INVENTORY]
        )
        stripe_fees_pence = by_category[Expense.Category.STRIPE_FEE]
        refunds_pence = by_category[Expense.Category.REFUND_GIVEN]
        shipping_paid_pence = by_category[Expense.Category.SHIPPING_PAID]
        operating_pence = (
            by_category[Expense.Category.ADS]
            + by_category[Expense.Category.SOFTWARE]
            + by_category[Expense.Category.POSTAGE]
            + by_category[Expense.Category.ACCOUNTING]
            + by_category[Expense.Category.OFFICE]
            + by_category[Expense.Category.OTHER]
        )
        total_expenses_pence = sum(by_category.values())

        gross_profit_pence = revenue_pence - cogs_pence
        net_profit_pence = revenue_pence - total_expenses_pence

        def _pct(num: int, denom: int) -> float:
            return round((num / denom) * 100, 2) if denom else 0.0

        return success_response({
            "period": {
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
            },
            "revenue": {
                "gross_pence": revenue_pence,
                "order_count": order_count,
                "avg_order_value_pence": (
                    int(revenue_pence / order_count) if order_count else 0
                ),
            },
            "expenses": {
                "total_pence": total_expenses_pence,
                "by_category": by_category,
                "cogs_pence": cogs_pence,
                "stripe_fees_pence": stripe_fees_pence,
                "refunds_pence": refunds_pence,
                "shipping_paid_pence": shipping_paid_pence,
                "operating_pence": operating_pence,
            },
            "profit": {
                "gross_pence": gross_profit_pence,
                "gross_margin_pct": _pct(gross_profit_pence, revenue_pence),
                "net_pence": net_profit_pence,
                "net_margin_pct": _pct(net_profit_pence, revenue_pence),
            },
        })


# ---------------------------------------------------------------------------
# 2) Expense CRUD
# ---------------------------------------------------------------------------

class AdminExpenseListView(AdminBaseView):
    """List existing expenses (paginated) + create a new manual one."""

    required_permissions = {
        "GET": "expenses.view",
        "POST": "expenses.update",
    }

    def get(self, request):
        date_from, date_to = _parse_range(request)
        qs = Expense.objects.filter(
            paid_at__gte=date_from, paid_at__lte=date_to,
        ).select_related("supplier", "order", "purchase_order")

        # Optional category filter
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        # Free-text search across description/notes
        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(description__icontains=search) | Q(notes__icontains=search)
            )

        qs = qs.order_by("-paid_at", "-created_at")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = ExpenseSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ExpenseWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("expenses.validation", status_code=400)
        expense = serializer.save(
            auto_created=False,
            created_by=request.user if request.user.is_authenticated else None,
        )
        return success_response(ExpenseSerializer(expense, context={"request": request}).data)


class AdminExpenseDetailView(AdminBaseView):
    """Get / update / delete a single expense (auto rows can still be patched for notes & receipt)."""

    required_permissions = {
        "GET": "expenses.view",
        "PATCH": "expenses.update",
        "DELETE": "expenses.delete",
    }

    def _get(self, expense_id):
        try:
            return Expense.objects.get(id=expense_id)
        except Expense.DoesNotExist:
            return None

    def get(self, request, expense_id):
        e = self._get(expense_id)
        if not e:
            return not_found_response("expenses.not_found")
        return success_response(ExpenseSerializer(e, context={"request": request}).data)

    def patch(self, request, expense_id):
        e = self._get(expense_id)
        if not e:
            return not_found_response("expenses.not_found")
        # Auto-created rows: only notes + receipt fields are editable
        # by hand. Amount/category/etc. are owned by the upstream
        # service that created them.
        if e.auto_created:
            allowed = {"notes"}
            patch = {k: v for k, v in request.data.items() if k in allowed}
            for k, v in patch.items():
                setattr(e, k, v)
            e.save(update_fields=list(patch.keys()))
        else:
            serializer = ExpenseWriteSerializer(e, data=request.data, partial=True)
            if not serializer.is_valid():
                return error_response("expenses.validation", status_code=400)
            serializer.save()
        return success_response(ExpenseSerializer(e, context={"request": request}).data)

    def delete(self, request, expense_id):
        e = self._get(expense_id)
        if not e:
            return not_found_response("expenses.not_found")
        if e.auto_created:
            # Don't let a misclick wipe a Stripe fee row — admin can
            # re-run the auto-recording if they really need it gone.
            return error_response("expenses.cant_delete_auto", status_code=400)
        if e.receipt_key:
            delete_object(e.receipt_key)
        e.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Receipt upload — multipart endpoint
# ---------------------------------------------------------------------------

class AdminExpenseReceiptFileView(AdminBaseView):
    """
    Authenticated download of a receipt file.

    In production (S3-compatible bucket configured), this 302-redirects
    the browser to a short-lived signed bucket URL so the file streams
    direct from the storage provider — no Django bandwidth wasted.

    In local-fallback mode (no bucket env vars set), files live on disk
    under MEDIA_ROOT/private/ and we'd otherwise need to expose /media/
    publicly to serve them. Instead we read from disk here behind the
    admin auth gate so receipts never leak to anonymous visitors.

    The serializer returns an absolute URL pointing at this endpoint,
    so the browser sends the admin auth cookie automatically and gets
    a sensible response in both modes.
    """

    required_permission = "expenses.view"

    def get(self, request, expense_id):
        try:
            expense = Expense.objects.get(id=expense_id)
        except Expense.DoesNotExist:
            return not_found_response("expenses.not_found")
        if not expense.receipt_key:
            return not_found_response("expenses.no_receipt")

        # Production / configured bucket — let the customer's browser
        # hit the storage provider directly via a signed URL.
        if settings.PRIVATE_STORAGE_ENABLED:
            return HttpResponseRedirect(signed_url(expense.receipt_key))

        # Local-fallback — stream the file from disk. We don't rely on
        # signed_url() here because in local mode it would return a
        # /media/ path that Next.js's 404 handler would intercept.
        path = os.path.join(settings.MEDIA_ROOT, "private", expense.receipt_key)
        if not os.path.exists(path):
            return not_found_response("expenses.receipt_missing_on_disk")
        return FileResponse(
            open(path, "rb"),
            content_type=expense.receipt_content_type or "application/octet-stream",
            filename=expense.receipt_filename or "receipt",
        )


class AdminExpenseReceiptView(AdminBaseView):
    """Upload (POST) or remove (DELETE) the receipt file attached to an Expense."""

    # Multipart parser is configured globally in DRF settings; we just
    # need to accept request.FILES here.

    required_permission = "expenses.update"

    MAX_BYTES = 15 * 1024 * 1024  # 15MB — covers high-res phone photos
    ALLOWED_MIME_PREFIXES = ("image/", "application/pdf")

    def post(self, request, expense_id):
        try:
            expense = Expense.objects.get(id=expense_id)
        except Expense.DoesNotExist:
            return not_found_response("expenses.not_found")

        f = request.FILES.get("file")
        if not f:
            return error_response("expenses.file_required", status_code=400)
        if f.size > self.MAX_BYTES:
            return error_response("expenses.file_too_large", status_code=413)
        content_type = (f.content_type or "").lower()
        if not any(content_type.startswith(p) for p in self.ALLOWED_MIME_PREFIXES):
            return error_response("expenses.bad_mime", status_code=400)

        # Replace any prior receipt — we keep one receipt per expense.
        if expense.receipt_key:
            try:
                delete_object(expense.receipt_key)
            except Exception:
                logger.exception("Failed to delete old receipt for %s", expense.id)

        key = build_receipt_key(expense.id, f.name)
        put_object(key, f.file, content_type)

        expense.receipt_key = key
        expense.receipt_filename = f.name[:255]
        expense.receipt_content_type = content_type[:100]
        expense.save(update_fields=[
            "receipt_key", "receipt_filename", "receipt_content_type", "updated_at",
        ])

        return success_response(ExpenseSerializer(expense, context={"request": request}).data)

    def delete(self, request, expense_id):
        try:
            expense = Expense.objects.get(id=expense_id)
        except Expense.DoesNotExist:
            return not_found_response("expenses.not_found")
        if expense.receipt_key:
            delete_object(expense.receipt_key)
        expense.receipt_key = ""
        expense.receipt_filename = ""
        expense.receipt_content_type = ""
        expense.save(update_fields=[
            "receipt_key", "receipt_filename", "receipt_content_type", "updated_at",
        ])
        return success_response(ExpenseSerializer(expense, context={"request": request}).data)


# ---------------------------------------------------------------------------
# 3) Year-end CSV export
# ---------------------------------------------------------------------------

class AdminFinancesExportView(AdminBaseView):
    """
    Streams a CSV combining revenue + expenses for the chosen window.
    One row per transaction with a `type` column ("income" / "expense")
    so the accountant can filter either way. Receipt URL column is a
    short-lived signed URL — fine for one-off downloads, but the
    accountant should grab the files separately if they need long-lived
    archives.
    """

    required_permission = "finances.export"

    def get(self, request):
        date_from, date_to = _parse_range(request)

        def rows():
            yield [
                "date",
                "type",
                "category",
                "description",
                "amount_gbp",
                "vat_gbp",
                "supplier",
                "order_number",
                "receipt_filename",
                "receipt_url",
            ]

            # Income — one row per paid order
            order_qs = (
                Order.objects
                .filter(paid_at__isnull=False)
                .filter(paid_at__date__gte=date_from, paid_at__date__lte=date_to)
                .exclude(status=Order.Status.CANCELLED)
                .order_by("paid_at")
            )
            for o in order_qs:
                yield [
                    o.paid_at.date().isoformat() if o.paid_at else "",
                    "income",
                    "sale",
                    f"Order {o.order_number}",
                    f"{o.total / 100:.2f}",
                    f"{o.vat_amount / 100:.2f}" if o.vat_amount else "0.00",
                    "",
                    o.order_number,
                    "",
                    "",
                ]

            # Expenses
            from apps.core.storage import signed_url
            exp_qs = (
                Expense.objects
                .filter(paid_at__gte=date_from, paid_at__lte=date_to)
                .select_related("supplier", "order")
                .order_by("paid_at")
            )
            for e in exp_qs:
                yield [
                    e.paid_at.isoformat(),
                    "expense",
                    e.get_category_display(),
                    e.description,
                    f"{e.amount_pence / 100:.2f}",
                    f"{e.vat_amount_pence / 100:.2f}" if e.vat_amount_pence else "0.00",
                    (e.supplier.name if e.supplier_id else ""),
                    (e.order.order_number if e.order_id else ""),
                    e.receipt_filename or "",
                    signed_url(e.receipt_key) if e.receipt_key else "",
                ]

        # Build the CSV in-memory — for typical small-shop year volumes
        # (low thousands of rows) this is far simpler than streaming and
        # the response is small enough not to matter.
        buf = io.StringIO()
        writer = csv.writer(buf)
        for row in rows():
            writer.writerow(row)

        resp = HttpResponse(buf.getvalue(), content_type="text/csv")
        resp["Content-Disposition"] = (
            f'attachment; filename="tph-finances-{date_from}-to-{date_to}.csv"'
        )
        return resp
