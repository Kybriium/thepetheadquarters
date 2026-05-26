from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from apps.core.responses import error_response, success_response
from apps.reviews.models import Review
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.views.base import AdminBaseView


class AdminReviewSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "product_name",
            "product_slug",
            "customer_name",
            "customer_email",
            "rating",
            "title",
            "body",
            "is_visible",
            "helpful_count",
            "admin_reply",
            "admin_reply_at",
            "created_at",
            "updated_at",
        ]

    def get_product_name(self, obj):
        t = obj.product.translations.filter(language="en").first()
        return t.name if t else ""

    def get_customer_name(self, obj):
        first = (obj.user.first_name or "").strip()
        last = (obj.user.last_name or "").strip()
        if first or last:
            return f"{first} {last}".strip()
        return obj.user.email


class AdminReviewListView(AdminBaseView):
    required_permission = "reviews.view"

    def get(self, request):
        qs = Review.objects.select_related("product", "user").all()

        rating = request.query_params.get("rating")
        if rating and rating.isdigit():
            qs = qs.filter(rating=int(rating))

        is_visible = request.query_params.get("is_visible")
        if is_visible == "true":
            qs = qs.filter(is_visible=True)
        elif is_visible == "false":
            qs = qs.filter(is_visible=False)

        if request.query_params.get("product"):
            qs = qs.filter(product_id=request.query_params["product"])

        has_reply = request.query_params.get("has_reply")
        if has_reply == "true":
            qs = qs.exclude(admin_reply="")
        elif has_reply == "false":
            qs = qs.filter(admin_reply="")

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(body__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(product__translations__name__icontains=search)
            ).distinct()

        ordering = request.query_params.get("ordering", "-created_at")
        allowed = {
            "created_at", "-created_at",
            "rating", "-rating",
            "helpful_count", "-helpful_count",
        }
        if ordering not in allowed:
            ordering = "-created_at"
        qs = qs.order_by(ordering)

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AdminReviewSerializer(page, many=True).data
        )


class AdminReviewDetailView(AdminBaseView):
    required_permissions = {
        "GET": "reviews.view",
        "PATCH": "reviews.moderate",
        "DELETE": "reviews.delete",
    }

    def _get(self, review_id):
        try:
            return Review.objects.select_related("product", "user").get(id=review_id)
        except Review.DoesNotExist:
            return None

    def get(self, request, review_id):
        review = self._get(review_id)
        if not review:
            return error_response("admin.reviews.not_found", status_code=404)
        return success_response(data=AdminReviewSerializer(review).data)

    def patch(self, request, review_id):
        review = self._get(review_id)
        if not review:
            return error_response("admin.reviews.not_found", status_code=404)

        if "is_visible" in request.data:
            review.is_visible = bool(request.data["is_visible"])

        if "admin_reply" in request.data:
            reply = (request.data.get("admin_reply") or "").strip()
            review.admin_reply = reply
            if reply:
                review.admin_reply_at = timezone.now()
                review.admin_reply_by = request.user
            else:
                review.admin_reply_at = None
                review.admin_reply_by = None

        review.save()
        return success_response(data=AdminReviewSerializer(review).data)

    def delete(self, request, review_id):
        review = self._get(review_id)
        if not review:
            return error_response("admin.reviews.not_found", status_code=404)
        review.delete()
        return success_response()
