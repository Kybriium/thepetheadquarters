"""
Public SEO infrastructure endpoints.

These don't belong to any single domain app — they aggregate data across
products, categories, and brands so the frontend can build the sitemap and
resolve old slugs without making N round-trips.
"""

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.core.models import SlugHistory
from apps.core.responses import error_response, success_response
from apps.products.models import Product


class SitemapSlugsView(APIView):
    """
    Returns every indexable slug on the site so the frontend sitemap.ts can
    emit a complete sitemap.xml in a single API call. Lightweight payload —
    just slug + updated_at, no descriptions, images, or relations.

    Cached aggressively at the HTTP layer (the cache-control middleware
    will set s-maxage on this — see _Cacheable_ list below).
    """

    permission_classes = [AllowAny]

    def get(self, request):
        products = list(
            Product.objects.filter(is_active=True)
            .values("slug", "updated_at")
            .order_by("slug")
        )
        categories = list(
            Category.objects.filter(is_active=True)
            .values("slug", "updated_at")
            .order_by("slug")
        )
        brands = list(
            Brand.objects.filter(is_active=True)
            .values("slug", "updated_at")
            .order_by("slug")
        )

        return success_response(data={
            "products": [
                {"slug": p["slug"], "updated_at": p["updated_at"].isoformat()}
                for p in products
            ],
            "categories": [
                {"slug": c["slug"], "updated_at": c["updated_at"].isoformat()}
                for c in categories
            ],
            "brands": [
                {"slug": b["slug"], "updated_at": b["updated_at"].isoformat()}
                for b in brands
            ],
        })


class _SlugRedirectBaseView(APIView):
    """
    Look up an old slug in the SlugHistory table and return the current
    canonical slug if found, so the frontend can issue a 301/308 redirect.

    Returns 404 if the slug has never existed for this resource type.
    """

    permission_classes = [AllowAny]
    model = None  # Override in subclass

    def get(self, request, slug):
        if self.model is None:
            return error_response("common.misconfigured", status_code=500)

        ct = ContentType.objects.get_for_model(self.model)
        history = (
            SlugHistory.objects.filter(content_type=ct, old_slug=slug)
            .order_by("-created_at")
            .first()
        )
        if not history:
            return error_response("common.not_found", status_code=404)

        target = history.target
        if not target or not getattr(target, "is_active", True):
            return error_response("common.not_found", status_code=404)

        return success_response(data={"slug": target.slug})


class SiteLegalView(APIView):
    """
    Public business-identity info — read on every page so the site can
    satisfy Companies Act 2006 s.82 (Ltd companies must display their
    registered name, number, registered office and country of incorporation
    on every business communication, including the website itself and any
    receipts/invoices).

    Sourced from env vars so production deployments can override without a
    code change. VAT fields are only populated when the business is
    registered — frontend should hide the VAT block otherwise.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data={
            "legal_name": settings.COMPANY_LEGAL_NAME,
            "trading_name": settings.COMPANY_TRADING_NAME,
            "company_number": settings.COMPANY_NUMBER,
            "registered_office": settings.COMPANY_REGISTERED_OFFICE,
            "incorporation": settings.COMPANY_INCORPORATION,
            "vat_registered": settings.VAT_REGISTERED,
            "vat_number": settings.COMPANY_VAT_NUMBER,
        })


class ProductSlugRedirectView(_SlugRedirectBaseView):
    model = Product


class CategorySlugRedirectView(_SlugRedirectBaseView):
    model = Category


class BrandSlugRedirectView(_SlugRedirectBaseView):
    model = Brand
