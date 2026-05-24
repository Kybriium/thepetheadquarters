"""
Customer-supplied product personalization (engraved names, uploaded photos,
print placements, etc.) — Temu/Printful-style.

Design tiers, lowest to highest:

  * CustomizationTemplate — a named, reusable bundle (e.g. "Pet-name
    engraving"). Templates are attached to many products via
    ProductCustomizationTemplate.
  * CustomizationField — one typed input. Belongs to EITHER a template OR a
    product directly (ad-hoc). Field type drives the renderer/validator.
  * CustomizationFieldOption — predefined choices for SELECT / POSITION fields.

  * ProductCustomizationTemplate — M2M join attaching a template to a product
    with its own sort order.

The runtime "what can this product be customized with?" resolver unions
ad-hoc fields with template-derived fields. Adding a new field type is one
enum value + one renderer + one validator — the schema does not change.
"""

from django.db import models

from apps.core.models import BaseModel, SortableMixin, ActivatableMixin


class FieldType(models.TextChoices):
    TEXT = "text", "Short text"
    LONG_TEXT = "long_text", "Long text"
    IMAGE = "image", "Image upload"
    SELECT = "select", "Single choice"
    POSITION = "position", "Placement (single choice with preview)"


class CustomizationTemplate(BaseModel, SortableMixin, ActivatableMixin):
    """A reusable bundle of customization fields shared across products."""

    key = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True, default="")

    class Meta(BaseModel.Meta):
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class CustomizationField(BaseModel, SortableMixin):
    """
    A single typed input the customer fills in.

    Belongs to either a template (reusable) or a product directly (ad-hoc).
    Exactly one of `template` / `product` must be set — enforced in save().
    """

    template = models.ForeignKey(
        CustomizationTemplate,
        on_delete=models.CASCADE,
        related_name="fields",
        null=True,
        blank=True,
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="ad_hoc_customization_fields",
        null=True,
        blank=True,
    )

    key = models.CharField(
        max_length=80,
        help_text="Stable identifier used in cart/order payload.",
    )
    label = models.CharField(max_length=200)
    help_text = models.CharField(max_length=500, blank=True, default="")
    field_type = models.CharField(
        max_length=20,
        choices=FieldType.choices,
        default=FieldType.TEXT,
    )
    is_required = models.BooleanField(default=False)
    surcharge_pence = models.PositiveIntegerField(
        default=0,
        help_text="Per-unit surcharge added if the customer fills this field.",
    )

    # Field-type-specific config. Examples:
    #   TEXT/LONG_TEXT: {"max_length": 60, "min_length": 0}
    #   IMAGE: {"max_file_mb": 8, "min_resolution_px": 300}
    #   SELECT/POSITION: {} (options live in CustomizationFieldOption)
    config = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["sort_order", "label"]
        constraints = [
            # A field's `key` must be unique within its scope (template or product)
            # so the cart payload `{field_key: value}` can address it unambiguously.
            models.UniqueConstraint(
                fields=["template", "key"],
                name="uniq_customfield_template_key",
                condition=models.Q(template__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["product", "key"],
                name="uniq_customfield_product_key",
                condition=models.Q(product__isnull=False),
            ),
            # Exactly one parent: template XOR product.
            models.CheckConstraint(
                condition=(
                    models.Q(template__isnull=False, product__isnull=True)
                    | models.Q(template__isnull=True, product__isnull=False)
                ),
                name="customfield_template_xor_product",
            ),
        ]

    def __str__(self) -> str:
        scope = self.template.name if self.template_id else f"product:{self.product_id}"
        return f"{self.label} ({self.field_type}) — {scope}"


class CustomizationFieldOption(BaseModel, SortableMixin):
    """A predefined choice for SELECT / POSITION fields."""

    field = models.ForeignKey(
        CustomizationField,
        on_delete=models.CASCADE,
        related_name="options",
    )
    value = models.CharField(
        max_length=80,
        help_text="Stable identifier used in cart payload.",
    )
    label = models.CharField(max_length=200)
    surcharge_pence = models.PositiveIntegerField(
        default=0,
        help_text="Per-unit surcharge added on top of the field's surcharge.",
    )
    preview_image_url = models.URLField(
        max_length=500,
        blank=True,
        default="",
        help_text="Thumbnail showing this placement / option visually.",
    )

    class Meta(BaseModel.Meta):
        ordering = ["sort_order", "label"]
        constraints = [
            models.UniqueConstraint(
                fields=["field", "value"],
                name="uniq_customfield_option_value",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.field.key}={self.value}"


class ProductCustomizationTemplate(BaseModel, SortableMixin):
    """Attaches a reusable template to a product."""

    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="customization_template_links",
    )
    template = models.ForeignKey(
        CustomizationTemplate,
        on_delete=models.CASCADE,
        related_name="product_links",
    )

    class Meta(BaseModel.Meta):
        ordering = ["sort_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "template"],
                name="uniq_product_template",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.product_id} ← {self.template.name}"
