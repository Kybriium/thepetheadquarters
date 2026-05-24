from rest_framework import serializers

from .models import (
    Product,
    ProductTranslation,
    ProductVariant,
    ProductImage,
    OptionType,
    OptionTypeTranslation,
    OptionValue,
    OptionValueTranslation,
)


def get_translation(obj, lang, fallback="en"):
    translation = obj.translations.filter(language=lang).first()
    if not translation:
        translation = obj.translations.filter(language=fallback).first()
    return translation


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "url", "alt_text", "is_primary", "sort_order", "variant"]


class OptionValueSerializer(serializers.ModelSerializer):
    value = serializers.SerializerMethodField()
    option_type_id = serializers.UUIDField(source="option_type.id", read_only=True)

    class Meta:
        model = OptionValue
        fields = [
            "id",
            "value",
            "option_type_id",
            "swatch_hex",
            "swatch_image_url",
            "sort_order",
        ]

    def get_value(self, obj) -> str:
        lang = self.context.get("language", "en")
        t = get_translation(obj, lang)
        return t.value if t else ""


class OptionTypeSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    values = OptionValueSerializer(many=True, read_only=True)

    class Meta:
        model = OptionType
        fields = ["id", "code", "name", "values", "sort_order"]

    def get_name(self, obj) -> str:
        lang = self.context.get("language", "en")
        t = get_translation(obj, lang)
        return t.name if t else (obj.code or "")


class ProductVariantSerializer(serializers.ModelSerializer):
    option_values = OptionValueSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "sku",
            "price",
            "compare_at_price",
            "stock_quantity",
            "weight_grams",
            "is_active",
            "is_on_sale",
            "in_stock",
            "sort_order",
            "option_values",
            "images",
        ]


class ProductTranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTranslation
        fields = ["language", "name", "description", "short_description"]


class ProductListSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    short_description = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    primary_image_alt = serializers.SerializerMethodField()
    min_price = serializers.SerializerMethodField()
    max_price = serializers.SerializerMethodField()
    # Compare-at price of the cheapest variant — when present and greater
    # than the variant's price, the storefront renders the "SAVE £X / -N%"
    # badge on the product card. We don't expose all variants' compare-at
    # values here to keep the list payload small.
    min_compare_at_price = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "slug",
            "name",
            "short_description",
            "brand_id",
            "is_featured",
            "average_rating",
            "review_count",
            "primary_image",
            "primary_image_alt",
            "min_price",
            "max_price",
            "min_compare_at_price",
            "in_stock",
        ]

    def get_name(self, obj) -> str:
        lang = self.context.get("language", "en")
        t = get_translation(obj, lang)
        return t.name if t else ""

    def get_short_description(self, obj) -> str:
        lang = self.context.get("language", "en")
        t = get_translation(obj, lang)
        return t.short_description if t else ""

    def _primary_image_obj(self, obj):
        image = obj.images.filter(is_primary=True, variant__isnull=True).first()
        if not image:
            image = obj.images.filter(variant__isnull=True).first()
        return image

    def get_primary_image(self, obj) -> str | None:
        image = self._primary_image_obj(obj)
        return image.url if image else None

    def get_primary_image_alt(self, obj) -> str:
        """Real alt text from the database, used for SEO + a11y."""
        image = self._primary_image_obj(obj)
        return image.alt_text if image else ""

    def get_min_price(self, obj) -> int | None:
        variants = obj.variants.filter(is_active=True)
        if not variants.exists():
            return None
        return variants.order_by("price").first().price

    def get_max_price(self, obj) -> int | None:
        variants = obj.variants.filter(is_active=True)
        if not variants.exists():
            return None
        return variants.order_by("-price").first().price

    def get_min_compare_at_price(self, obj) -> int | None:
        # Return the compare-at-price of the cheapest variant ONLY when
        # it represents a real discount. Returning None means "no sale";
        # the storefront will hide the strikethrough/badge in that case.
        cheapest = obj.variants.filter(is_active=True).order_by("price").first()
        if not cheapest or not cheapest.compare_at_price:
            return None
        if cheapest.compare_at_price <= cheapest.price:
            return None
        return cheapest.compare_at_price

    def get_in_stock(self, obj) -> bool:
        return obj.variants.filter(is_active=True, stock_quantity__gt=0).exists()


class ProductDetailSerializer(ProductListSerializer):
    translations = ProductTranslationSerializer(many=True, read_only=True)
    description = serializers.SerializerMethodField()
    variants = ProductVariantSerializer(many=True, read_only=True, source="active_variants")
    images = ProductImageSerializer(many=True, read_only=True)
    category_ids = serializers.SerializerMethodField()
    brand = serializers.SerializerMethodField()
    is_customizable = serializers.SerializerMethodField()
    option_types = serializers.SerializerMethodField()
    measure_guide = serializers.SerializerMethodField()

    def get_measure_guide(self, obj):
        """
        Combine the first associated category's measuring guide into
        a single payload the storefront can render directly. Returns
        None when no guide text/image is set so the PDP can hide the
        "How to measure" block cleanly. Picks the first category by
        sort_order — multi-category products rarely need to show more
        than one guide and it's cheaper than rendering several.
        """
        link = (
            obj.product_categories
            .select_related()
            .order_by("created_at")
            .first()
        )
        if not link or not link.category_id:
            return None
        from apps.categories.models import Category
        try:
            category = Category.objects.get(id=link.category_id)
        except Category.DoesNotExist:
            return None
        if not category.measure_guide_text and not category.measure_guide_image_url:
            return None
        return {
            "text": category.measure_guide_text,
            "image_url": category.measure_guide_image_url,
        }

    class Meta(ProductListSerializer.Meta):
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "short_description",
            "brand_id",
            "brand",
            "is_featured",
            "average_rating",
            "review_count",
            "meta_title",
            "meta_description",
            "primary_image",
            "min_price",
            "max_price",
            "min_compare_at_price",
            "in_stock",
            "translations",
            "variants",
            "images",
            "category_ids",
            "is_customizable",
            "option_types",
            "size_chart",
            "fit_notes",
            "measure_guide",
        ]

    # ``measure_guide`` is a SerializerMethodField below — it's the
    # combined view of the product's category-level "how to measure"
    # text + diagram, so the frontend doesn't have to make a separate
    # call.

    def get_option_types(self, obj) -> list:
        """
        Ordered axes the storefront should render in the variant selector.
        Prefers the explicit ProductOptionType rows when present; falls back
        to deriving from the variants' option_values so legacy products that
        pre-date the join table still render.
        """
        lang = self.context.get("language", "en")
        explicit = list(
            obj.option_type_links.select_related("option_type")
            .prefetch_related("option_type__translations", "option_type__values__translations")
            .order_by("sort_order")
        )

        seen_ids: set = set()
        ordered_types: list = []
        if explicit:
            for link in explicit:
                if link.option_type_id in seen_ids:
                    continue
                seen_ids.add(link.option_type_id)
                ordered_types.append(link.option_type)
        else:
            # Derive from active variants' option values (legacy products).
            active_variants = getattr(obj, "active_variants", None) or obj.variants.filter(is_active=True)
            for v in active_variants:
                for ov in v.option_values.all():
                    if ov.option_type_id in seen_ids:
                        continue
                    seen_ids.add(ov.option_type_id)
                    ordered_types.append(ov.option_type)

        result = []
        for ot in ordered_types:
            t = get_translation(ot, lang)
            result.append({
                "id": str(ot.id),
                "code": ot.code or "",
                "name": t.name if t else (ot.code or ""),
                "sort_order": ot.sort_order,
            })
        return result

    def get_is_customizable(self, obj) -> bool:
        """
        True if at least one customization field would be returned by the
        public `/products/<slug>/customizations/` endpoint. Lets the PDP
        skip the second fetch (and the panel render) for non-customized
        products without preloading the full field schema here.
        """
        if obj.ad_hoc_customization_fields.exists():
            return True
        return obj.customization_template_links.filter(
            template__is_active=True,
        ).exists()

    def get_description(self, obj) -> str:
        lang = self.context.get("language", "en")
        t = get_translation(obj, lang)
        return t.description if t else ""

    def get_category_ids(self, obj) -> list:
        return list(obj.product_categories.values_list("category_id", flat=True))

    def get_brand(self, obj):
        """Lightweight brand reference for SEO structured data."""
        if not obj.brand_id:
            return None
        from apps.brands.models import Brand
        try:
            brand = Brand.objects.only("id", "slug").get(id=obj.brand_id)
        except Brand.DoesNotExist:
            return None
        translation = brand.translations.filter(language="en").first()
        return {
            "id": str(brand.id),
            "slug": brand.slug,
            "name": translation.name if translation else "",
        }
