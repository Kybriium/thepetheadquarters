from django.db.models import Q
from rest_framework import serializers

from apps.core.responses import error_response, success_response

from apps.contact.models import ContactMessage
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView


class AdminContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "subject",
            "message",
            "is_read",
            "created_at",
            "updated_at",
        ]


class AdminContactMessageListView(AdminBaseView):
    required_permission = "contact.view"

    def get(self, request):
        qs = ContactMessage.objects.all()

        is_read = request.query_params.get("is_read")
        if is_read == "true":
            qs = qs.filter(is_read=True)
        elif is_read == "false":
            qs = qs.filter(is_read=False)

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(email__icontains=search)
                | Q(subject__icontains=search)
                | Q(message__icontains=search)
            )

        ordering = request.query_params.get("ordering", "-created_at")
        allowed = {"created_at", "-created_at", "name", "-name", "email", "-email"}
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AdminContactMessageSerializer(page, many=True).data
        )


class AdminContactMessageDetailView(AdminBaseView):
    required_permissions = {
        "GET": "contact.view",
        "PATCH": "contact.respond",
        "DELETE": "contact.respond",
    }

    def _get(self, message_id):
        try:
            return ContactMessage.objects.get(id=message_id)
        except ContactMessage.DoesNotExist:
            return None

    def get(self, request, message_id):
        message = self._get(message_id)
        if not message:
            return error_response("admin.contact_messages.not_found", status_code=404)

        # Auto-mark as read on first view.
        if not message.is_read:
            message.is_read = True
            message.save(update_fields=["is_read"])

        return success_response(data=AdminContactMessageSerializer(message).data)

    def patch(self, request, message_id):
        message = self._get(message_id)
        if not message:
            return error_response("admin.contact_messages.not_found", status_code=404)

        if "is_read" in request.data:
            message.is_read = bool(request.data["is_read"])
            message.save(update_fields=["is_read"])

        return success_response(data=AdminContactMessageSerializer(message).data)

    def delete(self, request, message_id):
        message = self._get(message_id)
        if not message:
            return error_response("admin.contact_messages.not_found", status_code=404)
        message.delete()
        return success_response()
