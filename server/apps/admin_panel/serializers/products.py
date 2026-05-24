from rest_framework import serializers

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.products.models import (
    OptionType,
    OptionValue,
    Product,
    ProductCategory,
    ProductImage,
    ProductOptionType,
    ProductTranslation,
    ProductVariant,
)


class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "url", "alt_text", "is_primary", "sort_order", "variant"]


class AdminOptionValueRefSerializer(serializers.ModelSerializer):
    """Minimal shape used inside variant payloads so the admin UI can render
    the option-value as a chip without a second fetch."""

    label = serializers.SerializerMethodField()
    option_type_id = serializers.UUIDField(read_only=True)
    option_type_code = serializers.CharField(source="option_type.code", read_only=True)

    class Meta:
        model = OptionValue
        fields = [
            "id",
            "label",
            "swatch_hex",
            "swatch_image_url",
            "option_type_id",
            "option_type_code",
            "sort_order",
        ]

    def get_label(self, obj) -> str:
        t = obj.translations.filter(language="en").first()
        return t.value if t else ""


class AdminProductVariantSerializer(serializers.ModelSerializer):
    option_values = AdminOptionValueRefSerializer(many=True, read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "sku",
            "price",
            "compare_at_price",
            "cost_price",
            "stock_quantity",
            "weight_grams",
            "sort_order",
            "is_active",
            "option_values",
        ]


class AdminProductListSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    total_stock = serializers.SerializerMethodField()
    min_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "slug",
            "name",
            "primary_image",
            "brand_id",
            "fulfillment_type",
            "is_featured",
            "is_active",
            "variant_count",
            "total_stock",
            "min_price",
            "created_at",
        ]

    def get_name(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.name if t else ""

    def get_primary_image(self, obj):
        img = obj.images.filter(is_primary=True).first()
        return img.url if img else ""

    def get_variant_count(self, obj):
        return obj.variants.filter(is_active=True).count()

    def get_total_stock(self, obj):
        return sum(v.stock_quantity for v in obj.variants.filter(is_active=True))

    def get_min_price(self, obj):
        prices = [v.price for v in obj.variants.filter(is_active=True)]
        return min(prices) if prices else None


class AdminProductOptionTypeLinkSerializer(serializers.ModelSerializer):
    """The axes a product is variantable along, in render order."""

    code = serializers.CharField(source="option_type.code", read_only=True)
    name = serializers.SerializerMethodField()
    option_type_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ProductOptionType
        fields = ["id", "option_type_id", "code", "name", "sort_order"]

    def get_name(self, obj) -> str:
        t = obj.option_type.translations.filter(language="en").first()
        return t.name if t else (obj.option_type.code or "")


class AdminProductDetailSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    short_description = serializers.SerializerMethodField()
    variants = AdminProductVariantSerializer(many=True, read_only=True)
    images = AdminProductImageSerializer(many=True, read_only=True)
    category_ids = serializers.SerializerMethodField()
    option_types = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "short_description",
            "brand_id",
            "fulfillment_type",
            "is_featured",
            "is_active",
            "meta_title",
            "meta_description",
            "average_rating",
            "review_count",
            "category_ids",
            "variants",
            "images",
            "option_types",
            "created_at",
            "updated_at",
        ]

    def get_option_types(self, obj) -> list:
        return AdminProductOptionTypeLinkSerializer(
            obj.option_type_links.select_related("option_type")
            .prefetch_related("option_type__translations")
            .order_by("sort_order"),
            many=True,
        ).data

    def get_name(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.name if t else ""

    def get_description(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.description if t else ""

    def get_short_description(self, obj):
        t = obj.translations.filter(language="en").first()
        return t.short_description if t else ""

    def get_category_ids(self, obj):
        return [str(pc.category_id) for pc in obj.product_categories.all()]


class AdminProductWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=300)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    short_description = serializers.CharField(required=False, allow_blank=True, default="")
    brand_id = serializers.UUIDField(required=False, allow_null=True)
    fulfillment_type = serializers.ChoiceField(
        choices=[("self", "self"), ("dropship", "dropship")],
        default="self",
    )
    is_featured = serializers.BooleanField(default=False)
    is_active = serializers.BooleanField(default=True)
    meta_title = serializers.CharField(required=False, allow_blank=True, default="")
    meta_description = serializers.CharField(required=False, allow_blank=True, default="")
    category_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class AdminVariantWriteSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=100)
    price = serializers.IntegerField(min_value=0)
    compare_at_price = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    cost_price = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    stock_quantity = serializers.IntegerField(min_value=0, default=0)
    weight_grams = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sort_order = serializers.IntegerField(default=0)
    is_active = serializers.BooleanField(default=True)
    # Optional list of OptionValue IDs the variant represents. Validated by
    # the view, which enforces that each value belongs to an OptionType the
    # product is variantable along.
    option_value_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        default=list,
    )


class AdminImageWriteSerializer(serializers.Serializer):
    url = serializers.URLField()
    alt_text = serializers.CharField(required=False, allow_blank=True, default="")
    is_primary = serializers.BooleanField(default=False)
    sort_order = serializers.IntegerField(default=0)
    variant_id = serializers.UUIDField(required=False, allow_null=True)
