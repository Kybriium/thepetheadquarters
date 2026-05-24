from rest_framework import serializers

from .models import (
    CustomizationField,
    CustomizationFieldOption,
    CustomizationTemplate,
    ProductCustomizationTemplate,
)


class CustomizationFieldOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomizationFieldOption
        fields = [
            "id",
            "value",
            "label",
            "surcharge_pence",
            "preview_image_url",
            "sort_order",
        ]


class CustomizationFieldSerializer(serializers.ModelSerializer):
    options = CustomizationFieldOptionSerializer(many=True, read_only=True)

    class Meta:
        model = CustomizationField
        fields = [
            "id",
            "template",
            "product",
            "key",
            "label",
            "help_text",
            "field_type",
            "is_required",
            "surcharge_pence",
            "config",
            "sort_order",
            "options",
        ]


class CustomizationTemplateSerializer(serializers.ModelSerializer):
    fields = CustomizationFieldSerializer(many=True, read_only=True)

    class Meta:
        model = CustomizationTemplate
        fields = [
            "id",
            "key",
            "name",
            "description",
            "is_active",
            "sort_order",
            "fields",
        ]


class ProductCustomizationTemplateSerializer(serializers.ModelSerializer):
    template = CustomizationTemplateSerializer(read_only=True)
    template_id = serializers.PrimaryKeyRelatedField(
        queryset=CustomizationTemplate.objects.all(),
        source="template",
        write_only=True,
    )

    class Meta:
        model = ProductCustomizationTemplate
        fields = ["id", "template", "template_id", "sort_order"]
