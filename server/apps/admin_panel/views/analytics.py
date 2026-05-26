"""
Admin analytics endpoints — read-only aggregate + individual inspector views.

The expensive queries (top pages, top referrers, time series) are written
as single SQL aggregations rather than Python loops so they stay fast as
the dataset grows. Anything older than ANALYTICS_RAW_RETENTION_DAYS is
served from the DailyAggregate roll-up table instead of the raw rows.
"""

from datetime import date, datetime, timedelta

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import serializers

from apps.analytics.models import DailyAggregate, Event, PageView, Session, Visitor
from apps.core.responses import error_response, success_response
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_date_range(request) -> tuple[date, date]:
    today = timezone.localdate()
    df = request.query_params.get("date_from")
    dt = request.query_params.get("date_to")

    try:
        date_from = datetime.strptime(df, "%Y-%m-%d").date() if df else today - timedelta(days=29)
    except ValueError:
        date_from = today - timedelta(days=29)
    try:
        date_to = datetime.strptime(dt, "%Y-%m-%d").date() if dt else today
    except ValueError:
        date_to = today
    return date_from, date_to


# ---------------------------------------------------------------------------
# Overview report — stats + time series + top lists + funnel
# ---------------------------------------------------------------------------
class AdminAnalyticsOverviewView(AdminBaseView):
    required_permission = "analytics.view"

    def get(self, request):
        date_from, date_to = _parse_date_range(request)
        end = timezone.make_aware(
            datetime.combine(date_to, datetime.max.time().replace(microsecond=0))
        )
        start = timezone.make_aware(datetime.combine(date_from, datetime.min.time()))

        sessions_qs = Session.objects.filter(started_at__gte=start, started_at__lte=end)
        visitors_qs = Visitor.objects.filter(last_seen_at__gte=start, last_seen_at__lte=end)
        pageviews_qs = PageView.objects.filter(viewed_at__gte=start, viewed_at__lte=end)
        events_qs = Event.objects.filter(occurred_at__gte=start, occurred_at__lte=end)

        # Headline numbers
        visitors_count = visitors_qs.count()
        sessions_count = sessions_qs.count()
        pageviews_count = pageviews_qs.count()

        # Bounce rate = sessions with exactly 1 pageview / total sessions
        single_page_sessions = sessions_qs.filter(pageview_count__lte=1).count()
        bounce_rate = (
            round((single_page_sessions / sessions_count) * 100, 1)
            if sessions_count > 0 else 0
        )

        avg_pages_per_session = (
            round(pageviews_count / sessions_count, 1) if sessions_count > 0 else 0
        )

        # Time series — pageviews per day
        time_series_raw = (
            pageviews_qs.annotate(day=TruncDate("viewed_at"))
            .values("day")
            .annotate(pv=Count("id"))
            .order_by("day")
        )
        pv_by_day = {row["day"].isoformat(): row["pv"] for row in time_series_raw}

        visitor_series_raw = (
            visitors_qs.annotate(day=TruncDate("first_seen_at"))
            .values("day")
            .annotate(v=Count("id"))
            .order_by("day")
        )
        v_by_day = {row["day"].isoformat(): row["v"] for row in visitor_series_raw}

        time_series = []
        cursor = date_from
        while cursor <= date_to:
            iso = cursor.isoformat()
            time_series.append({
                "date": iso,
                "visitors": v_by_day.get(iso, 0),
                "pageviews": pv_by_day.get(iso, 0),
            })
            cursor += timedelta(days=1)

        # Top pages
        top_pages = list(
            pageviews_qs.values("path")
            .annotate(views=Count("id"), unique_visitors=Count("visitor", distinct=True))
            .order_by("-views")[:15]
        )

        # Top referrers
        top_referrers = list(
            sessions_qs.exclude(referrer_host="")
            .values("referrer_host")
            .annotate(sessions=Count("id"))
            .order_by("-sessions")[:10]
        )

        # Top countries
        top_countries = list(
            visitors_qs.exclude(country="")
            .values("country")
            .annotate(visitors=Count("id"))
            .order_by("-visitors")[:10]
        )

        # Device + browser breakdown
        devices = list(
            visitors_qs.values("device_type")
            .annotate(visitors=Count("id"))
            .order_by("-visitors")
        )
        browsers = list(
            visitors_qs.exclude(browser="")
            .values("browser")
            .annotate(visitors=Count("id"))
            .order_by("-visitors")[:8]
        )

        # Conversion funnel — counted per visitor (not per event), so multiple
        # add_to_cart fires from one visitor count once.
        def visitors_with_event(name: str) -> int:
            return events_qs.filter(name=name).values("visitor").distinct().count()

        funnel = {
            "visitors": visitors_count,
            "product_views": visitors_with_event("product_view"),
            "add_to_cart": visitors_with_event("add_to_cart"),
            "checkout_start": visitors_with_event("checkout_start"),
            "checkout_complete": visitors_with_event("checkout_complete"),
        }

        # UTM source breakdown
        utm_sources = list(
            sessions_qs.exclude(utm_source="")
            .values("utm_source")
            .annotate(sessions=Count("id"))
            .order_by("-sessions")[:10]
        )

        return success_response(data={
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "totals": {
                "visitors": visitors_count,
                "sessions": sessions_count,
                "pageviews": pageviews_count,
                "bounce_rate": bounce_rate,
                "avg_pages_per_session": avg_pages_per_session,
            },
            "time_series": time_series,
            "top_pages": top_pages,
            "top_referrers": top_referrers,
            "top_countries": top_countries,
            "devices": devices,
            "browsers": browsers,
            "funnel": funnel,
            "utm_sources": utm_sources,
        })


# ---------------------------------------------------------------------------
# Visitors list + individual inspector
# ---------------------------------------------------------------------------
class AdminVisitorListSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()

    class Meta:
        model = Visitor
        fields = [
            "id",
            "country",
            "device_type",
            "browser",
            "os",
            "user_email",
            "first_seen_at",
            "last_seen_at",
            "pageview_count",
            "session_count",
        ]

    def get_user_email(self, obj):
        return obj.user.email if obj.user_id else ""


class AdminAnalyticsVisitorListView(AdminBaseView):
    required_permission = "analytics.view"

    def get(self, request):
        qs = Visitor.objects.select_related("user").all()

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(last_seen_at__date__gte=date_from)
        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(last_seen_at__date__lte=date_to)

        if request.query_params.get("country"):
            qs = qs.filter(country__iexact=request.query_params["country"])
        if request.query_params.get("device_type"):
            qs = qs.filter(device_type=request.query_params["device_type"])

        has_user = request.query_params.get("has_user")
        if has_user == "true":
            qs = qs.filter(user__isnull=False)
        elif has_user == "false":
            qs = qs.filter(user__isnull=True)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(country__iexact=search)
            )

        ordering = request.query_params.get("ordering", "-last_seen_at")
        allowed = {
            "last_seen_at", "-last_seen_at",
            "first_seen_at", "-first_seen_at",
            "pageview_count", "-pageview_count",
            "session_count", "-session_count",
        }
        if ordering not in allowed:
            ordering = "-last_seen_at"
        qs = qs.order_by(ordering)

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AdminVisitorListSerializer(page, many=True).data
        )


class _SessionInspectorSerializer(serializers.ModelSerializer):
    pageviews = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "started_at",
            "last_activity_at",
            "entry_path",
            "exit_path",
            "referrer",
            "referrer_host",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "pageview_count",
            "event_count",
            "pageviews",
            "events",
        ]

    def get_pageviews(self, obj):
        return [
            {
                "id": str(pv.id),
                "path": pv.path,
                "title": pv.title,
                "viewed_at": pv.viewed_at.isoformat(),
            }
            for pv in obj.pageviews.order_by("viewed_at")
        ]

    def get_events(self, obj):
        return [
            {
                "id": str(ev.id),
                "name": ev.name,
                "properties": ev.properties,
                "occurred_at": ev.occurred_at.isoformat(),
            }
            for ev in obj.events.order_by("occurred_at")
        ]


class AdminAnalyticsVisitorDetailView(AdminBaseView):
    required_permission = "analytics.view"

    def get(self, request, visitor_id):
        try:
            visitor = Visitor.objects.select_related("user").get(id=visitor_id)
        except Visitor.DoesNotExist:
            return error_response("admin.analytics.visitor_not_found", status_code=404)

        # Pull all sessions with their pageviews and events in a few queries
        sessions = (
            visitor.sessions.prefetch_related("pageviews", "events")
            .order_by("-started_at")[:50]
        )
        sessions_data = _SessionInspectorSerializer(sessions, many=True).data

        # If linked to a customer, also surface their order summary
        order_summary = None
        if visitor.user_id:
            from apps.orders.models import Order

            user_orders = Order.objects.filter(user=visitor.user).exclude(
                status=Order.Status.PENDING
            )
            order_summary = {
                "order_count": user_orders.count(),
                "total_spent_pence": user_orders.aggregate(t=Sum("total"))["t"] or 0,
                "last_order_at": (
                    user_orders.order_by("-created_at").values_list("created_at", flat=True).first()
                ),
            }
            if order_summary["last_order_at"]:
                order_summary["last_order_at"] = order_summary["last_order_at"].isoformat()

        return success_response(data={
            "id": str(visitor.id),
            "country": visitor.country,
            "device_type": visitor.device_type,
            "browser": visitor.browser,
            "os": visitor.os,
            "user": {
                "id": str(visitor.user.id),
                "email": visitor.user.email,
                "first_name": visitor.user.first_name,
                "last_name": visitor.user.last_name,
            } if visitor.user_id else None,
            "first_seen_at": visitor.first_seen_at.isoformat(),
            "last_seen_at": visitor.last_seen_at.isoformat(),
            "pageview_count": visitor.pageview_count,
            "session_count": visitor.session_count,
            "sessions": sessions_data,
            "order_summary": order_summary,
        })
