from django.db.models import Count, Sum, Q

from apps.core.responses import error_response, success_response
from apps.accounts.models import User, Address
from apps.orders.models import Order
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView
from rest_framework import serializers


class AdminCustomerListSerializer(serializers.ModelSerializer):
    order_count = serializers.IntegerField(read_only=True)
    total_spent = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "is_email_verified",
            "is_active",
            "date_joined",
            "order_count",
            "total_spent",
        ]


class AdminAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id", "label", "full_name",
            "address_line_1", "address_line_2",
            "city", "county", "postcode", "country",
            "phone", "is_default",
        ]


class AdminCustomerDetailSerializer(serializers.ModelSerializer):
    addresses = AdminAddressSerializer(many=True, read_only=True)
    order_count = serializers.SerializerMethodField()
    total_spent = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_email_verified",
            "is_active",
            "is_staff",
            "date_joined",
            "addresses",
            "order_count",
            "total_spent",
        ]

    def get_order_count(self, obj):
        return Order.objects.filter(user=obj).exclude(status=Order.Status.PENDING).count()

    def get_total_spent(self, obj):
        return Order.objects.filter(user=obj).exclude(
            status__in=[Order.Status.PENDING, Order.Status.CANCELLED]
        ).aggregate(t=Sum("total"))["t"] or 0


class AdminCustomerListView(AdminBaseView):
    required_permission = "customers.view"

    def get(self, request):
        qs = (
            User.objects.exclude(is_staff=True)
            .annotate(
                order_count=Count("orders", filter=~Q(orders__status="pending")),
                total_spent=Sum(
                    "orders__total",
                    filter=~Q(orders__status__in=["pending", "cancelled"]),
                ),
            )
            .order_by("-date_joined")
        )

        if request.query_params.get("verified") == "true":
            qs = qs.filter(is_email_verified=True)
        elif request.query_params.get("verified") == "false":
            qs = qs.filter(is_email_verified=False)

        if request.query_params.get("has_orders") == "true":
            qs = qs.filter(order_count__gt=0)
        elif request.query_params.get("has_orders") == "false":
            qs = qs.filter(Q(order_count=0) | Q(order_count__isnull=True))

        if request.query_params.get("is_active") == "true":
            qs = qs.filter(is_active=True)
        elif request.query_params.get("is_active") == "false":
            qs = qs.filter(is_active=False)

        # Total spent range (in pence)
        min_spent = request.query_params.get("min_spent")
        if min_spent:
            try:
                qs = qs.filter(total_spent__gte=int(min_spent))
            except ValueError:
                pass
        max_spent = request.query_params.get("max_spent")
        if max_spent:
            try:
                qs = qs.filter(total_spent__lte=int(max_spent))
            except ValueError:
                pass

        # Date joined range
        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(date_joined__date__gte=date_from)
        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(date_joined__date__lte=date_to)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        ordering = request.query_params.get("ordering", "-date_joined")
        allowed = {
            "date_joined", "-date_joined",
            "total_spent", "-total_spent",
            "order_count", "-order_count",
            "email", "-email",
        }
        if ordering in allowed:
            qs = qs.order_by(ordering)

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AdminCustomerListSerializer(page, many=True).data
        )


class AdminCustomerDetailView(AdminBaseView):
    required_permissions = {
        "GET": "customers.view",
        "PATCH": "customers.update",
    }

    def get(self, request, customer_id):
        try:
            user = User.objects.prefetch_related("addresses").get(id=customer_id)
        except User.DoesNotExist:
            return error_response("admin.customers.not_found", status_code=404)
        return success_response(data=AdminCustomerDetailSerializer(user).data)

    def patch(self, request, customer_id):
        try:
            user = User.objects.get(id=customer_id)
        except User.DoesNotExist:
            return error_response("admin.customers.not_found", status_code=404)

        if "is_active" in request.data:
            user.is_active = bool(request.data["is_active"])
            user.save(update_fields=["is_active"])

        return success_response(data=AdminCustomerDetailSerializer(user).data)
