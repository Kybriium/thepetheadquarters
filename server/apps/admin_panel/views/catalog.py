"""Brands and Categories CRUD."""
from django.db import transaction
from rest_framework import serializers

from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)

from apps.brands.models import Brand, BrandTranslation
from apps.categories.models import Category, CategoryTranslation
from apps.admin_panel.views.base import AdminBaseView


class AdminBrandSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = [
            "id", "slug", "name", "description",
            "logo", "website", "sort_order", "is_active",
            "meta_title", "meta_description",
        ]

    def get_name(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.name if t else ""

    def get_description(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.description if t else ""


class AdminCategorySerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id", "slug", "name", "description", "image",
            "parent", "depth", "path", "sort_order", "is_active",
            "meta_title", "meta_description",
            # Surfaced so the admin category edit page can show + save
            # the "How to measure" guide that the storefront PDP picks
            # up for every product in the category.
            "measure_guide_text", "measure_guide_image_url",
        ]

    def get_name(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.name if t else ""

    def get_description(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.description if t else ""


class AdminBrandListView(AdminBaseView):
    required_permissions = {
        "GET": "catalog.view",
        "POST": "catalog.update",
    }

    def get(self, request):
        qs = Brand.objects.all().order_by("sort_order", "id")
        return success_response(data=AdminBrandSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return error_response("admin.brands.name_required")

        brand = Brand.objects.create(
            logo=request.data.get("logo", ""),
            website=request.data.get("website", ""),
            sort_order=request.data.get("sort_order", 0),
        )
        BrandTranslation.objects.create(
            brand=brand, language="en",
            name=name,
            description=request.data.get("description", ""),
        )
        brand.slug = None
        brand.save()
        return created_response(data=AdminBrandSerializer(brand).data)


class AdminBrandDetailView(AdminBaseView):
    required_permissions = {
        "GET": "catalog.view",
        "PATCH": "catalog.update",
        "DELETE": "catalog.delete",
    }

    def _get(self, brand_id):
        try:
            return Brand.objects.get(id=brand_id)
        except Brand.DoesNotExist:
            return None

    def patch(self, request, brand_id):
        brand = self._get(brand_id)
        if not brand:
            return error_response("admin.brands.not_found", status_code=404)

        for field in ["logo", "website", "sort_order", "is_active", "meta_title", "meta_description"]:
            if field in request.data:
                setattr(brand, field, request.data[field])

        # Allow renaming the slug; SlugMixin records the old one in
        # SlugHistory automatically so external links keep working.
        if "slug" in request.data:
            new_slug = (request.data.get("slug") or "").strip()
            if new_slug:
                brand.slug = new_slug

        if "name" in request.data or "description" in request.data:
            t, _ = BrandTranslation.objects.get_or_create(
                brand=brand, language="en",
                defaults={"name": request.data.get("name", "")},
            )
            if "name" in request.data:
                t.name = request.data["name"]
            if "description" in request.data:
                t.description = request.data["description"]
            t.save()

        brand.save()
        return success_response(data=AdminBrandSerializer(brand).data)

    def delete(self, request, brand_id):
        brand = self._get(brand_id)
        if not brand:
            return error_response("admin.brands.not_found", status_code=404)
        brand.is_active = False
        brand.save(update_fields=["is_active"])
        return success_response()


class AdminCategoryListView(AdminBaseView):
    required_permissions = {
        "GET": "catalog.view",
        "POST": "catalog.update",
    }

    def get(self, request):
        qs = Category.objects.all().order_by("sort_order", "path")
        return success_response(data=AdminCategorySerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return error_response("admin.categories.name_required")

        category = Category.objects.create(
            parent_id=request.data.get("parent_id"),
            image=request.data.get("image", ""),
            sort_order=request.data.get("sort_order", 0),
        )
        CategoryTranslation.objects.create(
            category=category, language="en",
            name=name,
            description=request.data.get("description", ""),
        )
        category.slug = None
        category.save()
        return created_response(data=AdminCategorySerializer(category).data)


class AdminCategoryDetailView(AdminBaseView):
    required_permissions = {
        "GET": "catalog.view",
        "PATCH": "catalog.update",
        "DELETE": "catalog.delete",
    }

    def _get(self, category_id):
        try:
            return Category.objects.get(id=category_id)
        except Category.DoesNotExist:
            return None

    def get(self, request, category_id):
        """Single-category fetch — used by the admin category edit
        page so it doesn't have to load + filter the entire tree."""
        category = self._get(category_id)
        if not category:
            return error_response("admin.categories.not_found", status_code=404)
        return success_response(data=AdminCategorySerializer(category).data)

    def patch(self, request, category_id):
        category = self._get(category_id)
        if not category:
            return error_response("admin.categories.not_found", status_code=404)

        for field in [
            "image",
            "sort_order",
            "is_active",
            "parent_id",
            "meta_title",
            "meta_description",
            "measure_guide_text",
            "measure_guide_image_url",
        ]:
            if field in request.data:
                setattr(category, field, request.data[field])

        # Allow renaming the slug; SlugMixin records the old one in
        # SlugHistory automatically so external links keep working.
        if "slug" in request.data:
            new_slug = (request.data.get("slug") or "").strip()
            if new_slug:
                category.slug = new_slug

        if "name" in request.data or "description" in request.data:
            t, _ = CategoryTranslation.objects.get_or_create(
                category=category, language="en",
                defaults={"name": request.data.get("name", "")},
            )
            if "name" in request.data:
                t.name = request.data["name"]
            if "description" in request.data:
                t.description = request.data["description"]
            t.save()

        category.save()
        return success_response(data=AdminCategorySerializer(category).data)

    def delete(self, request, category_id):
        category = self._get(category_id)
        if not category:
            return error_response("admin.categories.not_found", status_code=404)
        category.is_active = False
        category.save(update_fields=["is_active"])
        return success_response()
