from django.db import transaction
from django.db.models import Q

from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)

from apps.products.models import (
    OptionValue,
    Product,
    ProductCategory,
    ProductImage,
    ProductOptionType,
    ProductTranslation,
    ProductVariant,
)
from apps.admin_panel.pagination import AdminPagination
from apps.admin_panel.serializers.products import (
    AdminImageWriteSerializer,
    AdminProductDetailSerializer,
    AdminProductListSerializer,
    AdminProductWriteSerializer,
    AdminVariantWriteSerializer,
)
from apps.admin_panel.views.base import AdminBaseView


class AdminProductListView(AdminBaseView):
    def get(self, request):
        from django.db.models import Sum, Min, Q

        qs = (
            Product.objects.all()
            .prefetch_related("translations", "variants", "images", "product_categories")
        )

        # Annotate with aggregates for filtering and sorting
        qs = qs.annotate(
            total_stock=Sum("variants__stock_quantity"),
            min_price=Min("variants__price"),
        )

        # Filters
        if request.query_params.get("category"):
            qs = qs.filter(product_categories__category_id=request.query_params["category"])
        if request.query_params.get("brand"):
            qs = qs.filter(brand_id=request.query_params["brand"])
        if request.query_params.get("fulfillment_type"):
            qs = qs.filter(fulfillment_type=request.query_params["fulfillment_type"])
        if request.query_params.get("is_active") is not None:
            qs = qs.filter(is_active=request.query_params["is_active"] == "true")
        if request.query_params.get("is_featured") is not None:
            qs = qs.filter(is_featured=request.query_params["is_featured"] == "true")

        # Stock level filter
        stock = request.query_params.get("stock")
        if stock == "out":
            qs = qs.filter(Q(total_stock=0) | Q(total_stock__isnull=True))
        elif stock == "low":
            qs = qs.filter(total_stock__gt=0, total_stock__lt=10)
        elif stock == "in":
            qs = qs.filter(total_stock__gte=10)

        # Price range (in pence)
        min_price_filter = request.query_params.get("min_price")
        if min_price_filter:
            try:
                qs = qs.filter(min_price__gte=int(min_price_filter))
            except ValueError:
                pass
        max_price_filter = request.query_params.get("max_price")
        if max_price_filter:
            try:
                qs = qs.filter(min_price__lte=int(max_price_filter))
            except ValueError:
                pass

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(translations__name__icontains=search)
                | Q(slug__icontains=search)
                | Q(variants__sku__icontains=search)
            ).distinct()

        # Sorting
        ordering = request.query_params.get("ordering", "-created_at")
        allowed_orderings = {
            "created_at", "-created_at",
            "min_price", "-min_price",
            "total_stock", "-total_stock",
        }
        if ordering in allowed_orderings:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")

        paginator = AdminPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminProductListSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = AdminProductWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data

        product = Product.objects.create(
            brand_id=data.get("brand_id"),
            fulfillment_type=data["fulfillment_type"],
            is_featured=data["is_featured"],
            is_active=data["is_active"],
            meta_title=data.get("meta_title", ""),
            meta_description=data.get("meta_description", ""),
        )

        ProductTranslation.objects.create(
            product=product,
            language="en",
            name=data["name"],
            description=data.get("description", ""),
            short_description=data.get("short_description", ""),
        )

        product.slug = None
        product.save()

        for cat_id in data.get("category_ids", []):
            ProductCategory.objects.create(product=product, category_id=cat_id)

        return created_response(data=AdminProductDetailSerializer(product).data)


class AdminProductDetailView(AdminBaseView):
    def _get(self, product_id):
        try:
            return Product.objects.prefetch_related(
                "translations", "variants", "images", "product_categories"
            ).get(id=product_id)
        except Product.DoesNotExist:
            return None

    def get(self, request, product_id):
        product = self._get(product_id)
        if not product:
            return error_response("admin.products.not_found", status_code=404)
        return success_response(data=AdminProductDetailSerializer(product).data)

    @transaction.atomic
    def patch(self, request, product_id):
        product = self._get(product_id)
        if not product:
            return error_response("admin.products.not_found", status_code=404)

        serializer = AdminProductWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data

        for field in [
            "brand_id",
            "fulfillment_type",
            "is_featured",
            "is_active",
            "meta_title",
            "meta_description",
            "size_chart",
            "fit_notes",
        ]:
            if field in data:
                setattr(product, field, data[field])

        # Update translation if name/description provided
        if "name" in data or "description" in data or "short_description" in data:
            translation, _ = ProductTranslation.objects.get_or_create(
                product=product, language="en",
                defaults={"name": data.get("name", "")},
            )
            if "name" in data:
                translation.name = data["name"]
            if "description" in data:
                translation.description = data["description"]
            if "short_description" in data:
                translation.short_description = data["short_description"]
            translation.save()

        # Replace categories if provided
        if "category_ids" in data:
            product.product_categories.all().delete()
            for cat_id in data["category_ids"]:
                ProductCategory.objects.create(product=product, category_id=cat_id)

        product.save()
        return success_response(data=AdminProductDetailSerializer(product).data)

    def delete(self, request, product_id):
        product = self._get(product_id)
        if not product:
            return error_response("admin.products.not_found", status_code=404)
        product.is_active = False
        product.save(update_fields=["is_active"])
        return success_response()


def _apply_option_values(product, variant, option_value_ids):
    """
    Replace the variant's option_values with the given IDs after verifying:
      - every ID exists
      - every value's OptionType is attached to this product (ProductOptionType)
      - at most one value per OptionType (a variant can't be both Red and Blue)

    Raises a tuple (code, status) for the view to surface as an error.
    """
    if not option_value_ids:
        variant.option_values.clear()
        return

    values = list(
        OptionValue.objects.filter(id__in=option_value_ids).select_related("option_type")
    )
    if len(values) != len(option_value_ids):
        raise ValueError("admin.variants.unknown_option_value")

    allowed_type_ids = set(
        ProductOptionType.objects.filter(product=product).values_list(
            "option_type_id", flat=True
        )
    )
    if not allowed_type_ids:
        # Implicit attachment — older products that never set ProductOptionType
        # rows still need to work. Auto-attach the types the admin just used.
        for v in values:
            ProductOptionType.objects.get_or_create(
                product=product, option_type=v.option_type,
                defaults={"sort_order": 0},
            )
        allowed_type_ids = {v.option_type_id for v in values}

    seen_types = set()
    for v in values:
        if v.option_type_id not in allowed_type_ids:
            raise ValueError("admin.variants.option_type_not_attached")
        if v.option_type_id in seen_types:
            raise ValueError("admin.variants.duplicate_axis")
        seen_types.add(v.option_type_id)

    variant.option_values.set(values)


class AdminProductVariantsView(AdminBaseView):
    @transaction.atomic
    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)

        serializer = AdminVariantWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = dict(serializer.validated_data)
        option_value_ids = data.pop("option_value_ids", [])

        variant = ProductVariant.objects.create(product=product, **data)
        try:
            _apply_option_values(product, variant, option_value_ids)
        except ValueError as exc:
            transaction.set_rollback(True)
            return error_response(str(exc))

        return created_response(
            data={
                "id": str(variant.id),
                "sku": variant.sku,
                "price": variant.price,
                "stock_quantity": variant.stock_quantity,
            }
        )


class AdminVariantDetailView(AdminBaseView):
    @transaction.atomic
    def patch(self, request, variant_id):
        try:
            variant = ProductVariant.objects.select_related("product").get(id=variant_id)
        except ProductVariant.DoesNotExist:
            return error_response("admin.variants.not_found", status_code=404)

        serializer = AdminVariantWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = dict(serializer.validated_data)
        option_value_ids = data.pop("option_value_ids", None)

        for field, value in data.items():
            setattr(variant, field, value)
        variant.save()

        if option_value_ids is not None:
            try:
                _apply_option_values(variant.product, variant, option_value_ids)
            except ValueError as exc:
                transaction.set_rollback(True)
                return error_response(str(exc))

        return success_response(data={"id": str(variant.id), "sku": variant.sku})

    def delete(self, request, variant_id):
        try:
            variant = ProductVariant.objects.get(id=variant_id)
        except ProductVariant.DoesNotExist:
            return error_response("admin.variants.not_found", status_code=404)
        variant.is_active = False
        variant.save(update_fields=["is_active"])
        return success_response()


class AdminProductVariantsBulkView(AdminBaseView):
    """
    Matrix-generate variants from a list of `combinations`. Each combination
    is a list of OptionValue IDs (one per axis). Already-existing
    combinations are skipped (idempotent). Useful for the Temu/Amazon-style
    'Color × Size → 9 SKUs' admin flow.
    """

    @transaction.atomic
    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)

        combinations = request.data.get("combinations") or []
        default_price = int(request.data.get("default_price", 0) or 0)
        default_stock = int(request.data.get("default_stock", 0) or 0)
        sku_prefix = (request.data.get("sku_prefix") or "TPH").strip()

        if not isinstance(combinations, list) or not combinations:
            return validation_error_response({"combinations": "required (list of OptionValue id lists)"})
        if default_price <= 0:
            return validation_error_response({"default_price": "must be > 0"})

        # Existing combinations on the product → skip to keep this idempotent.
        existing = set()
        for v in product.variants.prefetch_related("option_values").all():
            key = tuple(sorted(str(ov.id) for ov in v.option_values.all()))
            if key:
                existing.add(key)

        # Next SKU number — find the highest existing TPH-XXXXX seq and
        # increment from there to avoid collisions.
        last_seq = 0
        for v in ProductVariant.objects.filter(sku__startswith=f"{sku_prefix}-").only("sku"):
            try:
                seq = int(v.sku.rsplit("-", 1)[-1])
                if seq > last_seq:
                    last_seq = seq
            except ValueError:
                continue

        created = 0
        for combo in combinations:
            if not isinstance(combo, list) or not combo:
                continue
            key = tuple(sorted(str(x) for x in combo))
            if key in existing:
                continue
            last_seq += 1
            variant = ProductVariant.objects.create(
                product=product,
                sku=f"{sku_prefix}-{last_seq:05d}",
                price=default_price,
                stock_quantity=default_stock,
                sort_order=product.variants.count(),
            )
            try:
                _apply_option_values(product, variant, combo)
            except ValueError as exc:
                transaction.set_rollback(True)
                return error_response(str(exc))
            existing.add(key)
            created += 1

        return success_response(data={"created": created})


class AdminProductImagesView(AdminBaseView):
    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)

        serializer = AdminImageWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data
        image = ProductImage.objects.create(
            product=product,
            variant_id=data.get("variant_id"),
            url=data["url"],
            alt_text=data.get("alt_text", ""),
            is_primary=data.get("is_primary", False),
            sort_order=data.get("sort_order", 0),
        )
        return created_response(data={"id": str(image.id), "url": image.url})


class AdminImageDetailView(AdminBaseView):
    def _get(self, image_id):
        try:
            return ProductImage.objects.get(id=image_id)
        except ProductImage.DoesNotExist:
            return None

    @transaction.atomic
    def patch(self, request, image_id):
        image = self._get(image_id)
        if not image:
            return error_response("admin.images.not_found", status_code=404)

        if "is_primary" in request.data:
            new_primary = bool(request.data["is_primary"])
            if new_primary:
                # Unset other primary images for the same product
                ProductImage.objects.filter(
                    product_id=image.product_id, is_primary=True
                ).exclude(id=image.id).update(is_primary=False)
            image.is_primary = new_primary

        if "alt_text" in request.data:
            image.alt_text = request.data["alt_text"]
        if "sort_order" in request.data:
            image.sort_order = int(request.data["sort_order"])
        if "variant_id" in request.data:
            # Empty string / None detaches; otherwise must belong to the same product.
            raw = request.data["variant_id"]
            if not raw:
                image.variant_id = None
            else:
                try:
                    variant = ProductVariant.objects.get(id=raw, product_id=image.product_id)
                except ProductVariant.DoesNotExist:
                    return error_response("admin.images.variant_not_on_product")
                image.variant_id = variant.id

        image.save()
        return success_response(data={
            "id": str(image.id),
            "url": image.url,
            "is_primary": image.is_primary,
            "alt_text": image.alt_text,
            "sort_order": image.sort_order,
            "variant": str(image.variant_id) if image.variant_id else None,
        })

    def delete(self, request, image_id):
        image = self._get(image_id)
        if not image:
            return error_response("admin.images.not_found", status_code=404)
        image.delete()
        return success_response()
