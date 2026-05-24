from django.db import models
from django.db.models import Min, Prefetch
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from .ordering import ProductOrderingFilter
from rest_framework.permissions import AllowAny

from apps.core.pagination import StandardPagination
from apps.core.responses import success_response, not_found_response

from .filters import ProductFilter
from .models import Product, ProductVariant
from .serializers import ProductListSerializer, ProductDetailSerializer


class ProductViewSet(viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, ProductOrderingFilter]
    filterset_class = ProductFilter
    ordering_fields = ["created_at", "min_price", "average_rating"]
    ordering = ["-created_at"]
    lookup_field = "slug"

    def get_queryset(self):
        return (
            Product.objects
            .filter(is_active=True)
            .annotate(min_price=Min("variants__price", filter=models.Q(variants__is_active=True)))
            .prefetch_related(
                "translations",
                "images",
                "product_categories",
                Prefetch(
                    "variants",
                    queryset=ProductVariant.objects.filter(is_active=True).prefetch_related(
                        "option_values__translations",
                        "option_values__option_type__translations",
                        "images",
                    ),
                    to_attr="active_variants",
                ),
            )
            .distinct()
        )

    def get_language(self):
        return self.request.query_params.get("lang", "en")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["language"] = self.get_language()
        return context

    def list(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ProductListSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)

        serializer = ProductListSerializer(queryset, many=True, context=self.get_serializer_context())
        return success_response(serializer.data)

    def retrieve(self, request, slug=None):
        try:
            product = self.get_queryset().get(slug=slug)
        except Product.DoesNotExist:
            return not_found_response("product.not_found")

        serializer = ProductDetailSerializer(product, context=self.get_serializer_context())
        return success_response(serializer.data)

    @method_decorator(cache_page(60))
    @action(detail=False, methods=["get"])
    def featured(self, request):
        queryset = self.get_queryset().filter(is_featured=True)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ProductListSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)

        serializer = ProductListSerializer(queryset, many=True, context=self.get_serializer_context())
        return success_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="social-proof")
    def social_proof(self, request, slug=None):
        """
        Public real-data social proof for a single product. Returned
        fields are honest aggregates we can defend (DMCC Act 2024):
          - bought_last_30d: sum of OrderItem.quantity for paid,
            non-cancelled orders in the last 30 days.
        The storefront hides the corresponding UI when bought_last_30d
        is below a small threshold so a new shop doesn't display
        "Bought 1 time" embarrassingly.
        """
        from datetime import timedelta
        from django.utils import timezone
        from django.db.models import Sum
        from apps.orders.models import Order, OrderItem

        try:
            product = Product.objects.get(slug=slug, is_active=True)
        except Product.DoesNotExist:
            return not_found_response("product.not_found")

        since = timezone.now() - timedelta(days=30)
        bought = (
            OrderItem.objects
            .filter(
                product=product,
                order__paid_at__isnull=False,
                order__paid_at__gte=since,
            )
            .exclude(order__status=Order.Status.CANCELLED)
            .aggregate(total=Sum("quantity"))["total"]
            or 0
        )

        return success_response({
            "bought_last_30d": int(bought),
        })
