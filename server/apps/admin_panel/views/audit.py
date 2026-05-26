from rest_framework import serializers

from apps.core.responses import error_response, success_response
from apps.audit.models import AuditLog
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView


class AdminAuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "user_email",
            "action",
            "model_name",
            "object_id",
            "object_repr",
            "ip_address",
            "created_at",
        ]


class AdminAuditDetailSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "user_email",
            "action",
            "model_name",
            "object_id",
            "object_repr",
            "before_data",
            "after_data",
            "ip_address",
            "user_agent",
            "metadata",
            "created_at",
        ]


class AdminAuditListView(AdminBaseView):
    required_permission = "audit.view"

    def get(self, request):
        qs = AuditLog.objects.all().select_related("user").order_by("-created_at")

        if request.query_params.get("user"):
            qs = qs.filter(user_id=request.query_params["user"])
        if request.query_params.get("model"):
            qs = qs.filter(model_name=request.query_params["model"])
        if request.query_params.get("action"):
            qs = qs.filter(action=request.query_params["action"])
        if request.query_params.get("date_from"):
            qs = qs.filter(created_at__date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            qs = qs.filter(created_at__date__lte=request.query_params["date_to"])

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminAuditLogSerializer(page, many=True).data)


class AdminAuditDetailView(AdminBaseView):
    required_permission = "audit.view"

    def get(self, request, log_id):
        try:
            log = AuditLog.objects.select_related("user").get(id=log_id)
        except AuditLog.DoesNotExist:
            return error_response("admin.audit.not_found", status_code=404)
        return success_response(data=AdminAuditDetailSerializer(log).data)
