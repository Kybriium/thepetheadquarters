"""
Public review API.

All routes are mounted under /api/v1/products/<slug>/reviews/. The product
slug is the lookup key (matches the rest of the public product API).
"""

from django.db.models import Avg, Count
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.pagination import StandardPagination
from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)
from apps.products.models import Product

from .models import Review, ReviewHelpfulVote
from .serializers import ReviewSerializer, ReviewWriteSerializer
from .services import find_verified_order


def _resolve_product(slug: str):
    try:
        return Product.objects.get(slug=slug, is_active=True)
    except Product.DoesNotExist:
        return None


def _serializer_context(request, page):
    """
    Build the serializer context with the user's helpful-vote set
    pre-fetched in one query (avoids N+1 on the listing endpoint).
    """
    voted_ids = None
    if request.user and request.user.is_authenticated:
        ids = [r.id for r in page]
        voted_ids = set(
            ReviewHelpfulVote.objects.filter(
                user=request.user, review_id__in=ids
            ).values_list("review_id", flat=True)
        )
    return {"request": request, "voted_ids": voted_ids}


class ReviewListCreateView(APIView):
    """
    GET  — paginated list of visible reviews for a product, with stats
    POST — create a new review (auth + verified-buyer required)
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return [AllowAny()]

    def get(self, request, slug):
        product = _resolve_product(slug)
        if not product:
            return error_response("products.not_found", status_code=404)

        qs = Review.objects.filter(product=product, is_visible=True).select_related("user")

        # Sorting
        sort = request.query_params.get("sort", "newest")
        if sort == "highest":
            qs = qs.order_by("-rating", "-created_at")
        elif sort == "lowest":
            qs = qs.order_by("rating", "-created_at")
        elif sort == "helpful":
            qs = qs.order_by("-helpful_count", "-created_at")
        else:
            qs = qs.order_by("-created_at")

        # Optional rating filter
        rating_filter = request.query_params.get("rating")
        if rating_filter and rating_filter.isdigit():
            qs = qs.filter(rating=int(rating_filter))

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serialized = ReviewSerializer(
            page, many=True, context=_serializer_context(request, page)
        ).data

        return paginator.get_paginated_response(serialized)

    def post(self, request, slug):
        product = _resolve_product(slug)
        if not product:
            return error_response("products.not_found", status_code=404)

        # Verified-buyer gate
        order = find_verified_order(user=request.user, product=product)
        if not order:
            return error_response("reviews.not_verified_buyer", status_code=403)

        # One-per-product check
        if Review.objects.filter(product=product, user=request.user).exists():
            return error_response("reviews.already_reviewed", status_code=409)

        serializer = ReviewWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data
        review = Review.objects.create(
            product=product,
            user=request.user,
            order=order,
            rating=data["rating"],
            title=data.get("title", ""),
            body=data["body"],
        )

        # Notify staff in Telegram (fire-and-forget). Imported lazily so the
        # reviews app doesn't depend on apps.integrations at import time.
        try:
            from apps.integrations.models import NotificationEvent
            from apps.integrations.services import notify
            translation = product.translations.filter(language="en").first()
            notify(NotificationEvent.REVIEW_NEW, {
                "product_name": translation.name if translation else str(product.pk),
                "reviewer": (request.user.first_name or request.user.email) if request.user else "Anonymous",
                "rating": data["rating"],
                "body": data["body"],
            })
        except Exception:
            pass

        return created_response(
            data=ReviewSerializer(review, context={"request": request}).data
        )


class ReviewStatsView(APIView):
    """Returns the rating distribution for a product (count per star value)."""

    permission_classes = [AllowAny]

    def get(self, request, slug):
        product = _resolve_product(slug)
        if not product:
            return error_response("products.not_found", status_code=404)

        qs = Review.objects.filter(product=product, is_visible=True)
        agg = qs.aggregate(avg=Avg("rating"), count=Count("id"))

        # Distribution: how many reviews per star value (1..5)
        distribution = {str(i): 0 for i in range(1, 6)}
        for row in qs.values("rating").annotate(c=Count("id")):
            distribution[str(row["rating"])] = row["c"]

        return success_response(data={
            "average_rating": float(agg["avg"] or 0),
            "review_count": agg["count"] or 0,
            "distribution": distribution,
        })


class ReviewEligibilityView(APIView):
    """
    Tells the UI whether the current user can write a review for this product:
      - not authenticated → can_review=false, reason='login_required'
      - no qualifying order → can_review=false, reason='not_verified_buyer'
      - already reviewed → can_review=false, reason='already_reviewed', existing_review={...}
      - all good → can_review=true
    """

    permission_classes = [AllowAny]

    def get(self, request, slug):
        product = _resolve_product(slug)
        if not product:
            return error_response("products.not_found", status_code=404)

        if not request.user or not request.user.is_authenticated:
            return success_response(data={"can_review": False, "reason": "login_required"})

        existing = (
            Review.objects.filter(product=product, user=request.user)
            .select_related("user")
            .first()
        )
        if existing:
            return success_response(data={
                "can_review": False,
                "reason": "already_reviewed",
                "existing_review": ReviewSerializer(existing, context={"request": request}).data,
            })

        order = find_verified_order(user=request.user, product=product)
        if not order:
            return success_response(data={"can_review": False, "reason": "not_verified_buyer"})

        return success_response(data={"can_review": True})


class ReviewDetailView(APIView):
    """PATCH/DELETE — author only, PATCH only within EDIT_WINDOW_DAYS."""

    permission_classes = [IsAuthenticated]

    def _get(self, review_id, user):
        try:
            return Review.objects.get(id=review_id, user=user)
        except Review.DoesNotExist:
            return None

    def patch(self, request, slug, review_id):
        review = self._get(review_id, request.user)
        if not review:
            return error_response("reviews.not_found", status_code=404)

        if not review.is_editable:
            return error_response("reviews.edit_window_closed", status_code=403)

        serializer = ReviewWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data
        for field in ("rating", "title", "body"):
            if field in data:
                setattr(review, field, data[field])
        review.save()

        return success_response(
            data=ReviewSerializer(review, context={"request": request}).data
        )

    def delete(self, request, slug, review_id):
        review = self._get(review_id, request.user)
        if not review:
            return error_response("reviews.not_found", status_code=404)
        review.delete()
        return success_response()


class ReviewHelpfulView(APIView):
    """
    Toggle a 'helpful' vote on a review.

    Authenticated users get the strict treatment: a `ReviewHelpfulVote` row
    is created/deleted, the count is recomputed, and they can un-vote. Their
    votes follow them across devices.

    Anonymous users get a lighter treatment so they can engage without
    needing an account. The counter is bumped on the first request from a
    given IP within a 24-hour window; further requests from the same IP
    no-op so a single visitor can't farm the count. The frontend tracks
    its own `voted` state in localStorage for visual feedback.
    """

    permission_classes = [AllowAny]

    def post(self, request, slug, review_id):
        try:
            review = Review.objects.get(id=review_id, is_visible=True)
        except Review.DoesNotExist:
            return error_response("reviews.not_found", status_code=404)

        # ----- Authenticated path: per-user vote row, supports un-voting -----
        if request.user and request.user.is_authenticated:
            if review.user_id == request.user.id:
                return error_response("reviews.cannot_vote_own", status_code=403)

            existing = ReviewHelpfulVote.objects.filter(review=review, user=request.user).first()
            if existing:
                existing.delete()
                voted = False
            else:
                ReviewHelpfulVote.objects.create(review=review, user=request.user)
                voted = True

            review.refresh_from_db(fields=["helpful_count"])
            return success_response(data={
                "helpful_count": review.helpful_count,
                "has_voted_helpful": voted,
            })

        # ----- Anonymous path: bump counter once per IP per 24h -----
        from django.core.cache import cache
        from django.db.models import F

        ip = _client_ip(request)
        cache_key = f"helpful:{ip}:{review_id}"
        already_voted = cache.get(cache_key) is not None

        if not already_voted:
            Review.objects.filter(id=review.id).update(
                helpful_count=F("helpful_count") + 1,
            )
            cache.set(cache_key, True, timeout=60 * 60 * 24)  # 24 hours
            review.refresh_from_db(fields=["helpful_count"])

        return success_response(data={
            "helpful_count": review.helpful_count,
            "has_voted_helpful": True,
        })


def _client_ip(request) -> str:
    """Best-effort client IP for cache-key dedupe (not for security)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")


class MyReviewsView(APIView):
    """List the authenticated user's own reviews (for the account page)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            Review.objects.filter(user=request.user)
            .select_related("product", "user")
            .order_by("-created_at")
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serialized = ReviewSerializer(
            page, many=True, context={"request": request}
        ).data

        # Augment with the product slug + name so the account page can link
        slug_map = {r.id: {"product_slug": r.product.slug, "product_name": _product_name(r.product)} for r in page}
        for row in serialized:
            extra = slug_map.get(row["id"], {})
            row["product_slug"] = extra.get("product_slug", "")
            row["product_name"] = extra.get("product_name", "")

        return paginator.get_paginated_response(serialized)


def _product_name(product) -> str:
    t = product.translations.filter(language="en").first()
    return t.name if t else ""
