from datetime import timedelta

from django.db.models import Sum, Count, Q
from django.utils import timezone

from apps.core.responses import success_response
from apps.analytics.models import Visitor
from apps.contact.models import ContactMessage
from apps.expenses.models import Expense
from apps.orders.models import Order, OrderItem
from apps.products.models import ProductVariant
from apps.reviews.models import Review

from apps.admin_panel.views.base import AdminBaseView


class DashboardView(AdminBaseView):
    def get(self, request):
        today = timezone.localdate()
        today_start = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.min.time())
        )

        # Today's stats
        todays_orders = Order.objects.filter(created_at__gte=today_start).exclude(
            status=Order.Status.CANCELLED
        )
        todays_revenue = (
            todays_orders.filter(paid_at__isnull=False).aggregate(
                total=Sum("total")
            )["total"]
            or 0
        )

        # Today's expenses — every penny that left the business today.
        # Includes auto-recorded Stripe fees + dropship COGS as well as
        # any manual rows the admin logged. Together with revenue this
        # gives the real take-home figure on the dashboard.
        todays_expenses = (
            Expense.objects.filter(paid_at=today).aggregate(t=Sum("amount_pence"))["t"]
            or 0
        )
        todays_net = todays_revenue - todays_expenses

        pending_count = Order.objects.filter(
            status__in=[Order.Status.PAID, Order.Status.PROCESSING]
        ).count()

        low_stock_count = ProductVariant.objects.filter(
            is_active=True, stock_quantity__lt=10
        ).count()

        dropship_pending = (
            OrderItem.objects.filter(
                fulfillment_type="dropship",
                fulfillment_status=OrderItem.FulfillmentStatus.PENDING,
                order__status__in=[Order.Status.PAID, Order.Status.PROCESSING],
            ).count()
        )

        unread_messages_count = ContactMessage.objects.filter(is_read=False).count()
        reviews_pending_reply_count = Review.objects.filter(
            is_visible=True, admin_reply=""
        ).count()
        visitors_today_count = Visitor.objects.filter(last_seen_at__gte=today_start).count()

        # Recent orders (last 5)
        from apps.admin_panel.serializers.orders import AdminOrderListSerializer

        recent_orders = (
            Order.objects.exclude(status=Order.Status.PENDING)
            .order_by("-created_at")[:5]
            .prefetch_related("items")
        )
        recent_serialized = AdminOrderListSerializer(recent_orders, many=True).data

        return success_response(
            data={
                "today": {
                    "orders_count": todays_orders.count(),
                    "revenue_pence": todays_revenue,
                    "expenses_pence": todays_expenses,
                    "net_pence": todays_net,
                    "pending_count": pending_count,
                },
                "low_stock_count": low_stock_count,
                "dropship_pending_count": dropship_pending,
                "unread_messages_count": unread_messages_count,
                "reviews_pending_reply_count": reviews_pending_reply_count,
                "visitors_today_count": visitors_today_count,
                "recent_orders": recent_serialized,
            }
        )
