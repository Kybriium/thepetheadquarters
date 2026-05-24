from django.db import models

from apps.core.models import BaseModel, TranslationBaseModel, SlugMixin, SortableMixin, ActivatableMixin


class Category(BaseModel, SlugMixin, SortableMixin, ActivatableMixin):
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    image = models.URLField(max_length=500, blank=True, default="")
    depth = models.PositiveSmallIntegerField(default=0, db_index=True)
    path = models.CharField(max_length=1000, blank=True, default="")
    meta_title = models.CharField(max_length=255, blank=True, default="")
    meta_description = models.CharField(max_length=500, blank=True, default="")

    # Measuring guide — one per category, shown on every product PDP in
    # this category to explain how the customer should measure their
    # pet for sizing. Optional; PDP hides the block when empty.
    #
    # Diagram is a single image URL (typically a labelled illustration
    # of where to take the neck / chest / length measurement). Stored
    # as URL rather than upload because most categories share standard
    # diagrams that already exist online.
    measure_guide_text = models.TextField(
        blank=True,
        default="",
        help_text="Plain text instructions, one tip per line "
        "(e.g. 'Neck: measure where the collar sits, snug but not tight').",
    )
    measure_guide_image_url = models.URLField(
        max_length=500,
        blank=True,
        default="",
        help_text="Optional diagram showing where to measure the pet.",
    )

    class Meta(BaseModel.Meta):
        verbose_name_plural = "categories"
        ordering = ["sort_order", "path"]
        indexes = [
            models.Index(fields=["parent", "is_active"]),
            models.Index(fields=["path"]),
        ]

    def generate_slug(self) -> str:
        translation = self.translations.filter(language="en").first()
        return translation.name if translation else str(self.pk)

    def save(self, *args, **kwargs):
        if self.parent:
            self.depth = self.parent.depth + 1
            self.path = f"{self.parent.path}/{self.slug}" if self.slug else self.parent.path
        else:
            self.depth = 0
            self.path = self.slug or ""
        super().save(*args, **kwargs)

    def __str__(self):
        translation = self.translations.filter(language="en").first()
        return translation.name if translation else str(self.pk)


class CategoryTranslation(TranslationBaseModel):
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name="translations",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")

    class Meta:
        unique_together = ("category", "language")

    def __str__(self):
        return f"{self.name} ({self.language})"
