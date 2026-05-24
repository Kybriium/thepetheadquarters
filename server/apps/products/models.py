from django.db import models

from apps.core.models import BaseModel, TranslationBaseModel, SlugMixin, SortableMixin, ActivatableMixin


class Product(BaseModel, SlugMixin, ActivatableMixin):
    class FulfillmentType(models.TextChoices):
        SELF = "self", "Self-fulfilled"
        DROPSHIP = "dropship", "Dropship"

    brand_id = models.UUIDField(db_index=True, null=True, blank=True)
    fulfillment_type = models.CharField(
        max_length=10,
        choices=FulfillmentType.choices,
        default=FulfillmentType.SELF,
        db_index=True,
    )
    is_featured = models.BooleanField(default=False, db_index=True)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    review_count = models.PositiveIntegerField(default=0)
    meta_title = models.CharField(max_length=255, blank=True, default="")
    meta_description = models.CharField(max_length=500, blank=True, default="")

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["brand_id", "is_active"]),
            models.Index(fields=["is_featured", "is_active"]),
        ]

    def generate_slug(self) -> str:
        translation = self.translations.filter(language="en").first()
        return translation.name if translation else str(self.pk)

    def __str__(self):
        translation = self.translations.filter(language="en").first()
        return translation.name if translation else str(self.pk)


class ProductTranslation(TranslationBaseModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="translations",
    )
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True, default="")
    short_description = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        unique_together = ("product", "language")

    def __str__(self):
        return f"{self.name} ({self.language})"


class ProductCategory(BaseModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="product_categories",
    )
    category_id = models.UUIDField(db_index=True)

    class Meta:
        unique_together = ("product", "category_id")


class OptionType(BaseModel, SortableMixin):
    """Variant axis definition: Weight, Flavour, Colour, etc."""

    # Stable identifier used by admin code/reports — slug-like, unique.
    # Nullable for migration compatibility with pre-existing rows; the admin
    # API requires it on create.
    code = models.CharField(max_length=80, unique=True, null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["sort_order"]

    def __str__(self):
        translation = self.translations.filter(language="en").first()
        return translation.name if translation else (self.code or str(self.pk))


class OptionTypeTranslation(TranslationBaseModel):
    option_type = models.ForeignKey(
        OptionType,
        on_delete=models.CASCADE,
        related_name="translations",
    )
    name = models.CharField(max_length=100)

    class Meta:
        unique_together = ("option_type", "language")

    def __str__(self):
        return f"{self.name} ({self.language})"


class OptionValue(BaseModel, SortableMixin):
    """Specific value: 3kg, 10kg, Chicken, Red, etc."""
    option_type = models.ForeignKey(
        OptionType,
        on_delete=models.CASCADE,
        related_name="values",
    )
    # Visual swatch — either a CSS-style hex (#FF0000) for solid colors or a
    # small image URL for patterns / fabrics. Renderer falls back to the
    # value's text label when neither is set.
    swatch_hex = models.CharField(max_length=9, blank=True, default="")
    swatch_image_url = models.URLField(max_length=500, blank=True, default="")

    class Meta(BaseModel.Meta):
        ordering = ["sort_order"]

    def __str__(self):
        translation = self.translations.filter(language="en").first()
        return translation.value if translation else str(self.pk)


class ProductOptionType(BaseModel, SortableMixin):
    """
    Declares which option-type axes a product is variantable along, in the
    order they should appear in the storefront selector.

    Without this row, the storefront falls back to deriving axes from the
    product's variants — fine for legacy products but doesn't fix axis order
    or let admin add a new axis with no variants yet.
    """

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="option_type_links",
    )
    option_type = models.ForeignKey(
        OptionType,
        on_delete=models.CASCADE,
        related_name="product_links",
    )

    class Meta(BaseModel.Meta):
        ordering = ["sort_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "option_type"],
                name="uniq_product_option_type",
            ),
        ]

    def __str__(self):
        return f"{self.product_id} ← {self.option_type}"


class OptionValueTranslation(TranslationBaseModel):
    option_value = models.ForeignKey(
        OptionValue,
        on_delete=models.CASCADE,
        related_name="translations",
    )
    value = models.CharField(max_length=200)

    class Meta:
        unique_together = ("option_value", "language")

    def __str__(self):
        return f"{self.value} ({self.language})"


class ProductVariant(BaseModel, ActivatableMixin):
    """The buyable SKU — has its own price, stock, weight."""
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="variants",
    )
    sku = models.CharField(max_length=100, unique=True)
    price = models.PositiveIntegerField(help_text="Price in pence (GBP smallest unit)")
    compare_at_price = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Original price for sale display, in pence",
    )
    cost_price = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Internal cost for margin tracking, in pence",
    )
    stock_quantity = models.PositiveIntegerField(default=0)
    weight_grams = models.PositiveIntegerField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    option_values = models.ManyToManyField(
        OptionValue,
        blank=True,
        related_name="variants",
    )

    class Meta(BaseModel.Meta):
        ordering = ["sort_order"]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["sku"]),
        ]

    def __str__(self):
        return self.sku

    @property
    def is_on_sale(self) -> bool:
        return self.compare_at_price is not None and self.compare_at_price > self.price

    @property
    def in_stock(self) -> bool:
        return self.stock_quantity > 0


class ProductImage(BaseModel, SortableMixin):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="images",
    )
    url = models.URLField(max_length=500)
    alt_text = models.CharField(max_length=300, blank=True, default="")
    is_primary = models.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["sort_order"]
        indexes = [
            models.Index(fields=["product", "is_primary"]),
        ]

    def __str__(self):
        return f"Image for {self.product} (primary={self.is_primary})"
