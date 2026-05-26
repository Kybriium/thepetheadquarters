"""
Admin CRUD for customization templates, their fields/options, and the
per-product template attachments. Storefront-facing reads use the public
endpoints in apps.customizations.viewsets — this module is staff-only writes.
"""

from django.db import transaction

from apps.admin_panel.views.base import AdminBaseView
from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)
from apps.customizations.models import (
    CustomizationField,
    CustomizationFieldOption,
    CustomizationTemplate,
    FieldType,
    ProductCustomizationTemplate,
)
from apps.customizations.serializers import (
    CustomizationFieldOptionSerializer,
    CustomizationFieldSerializer,
    CustomizationTemplateSerializer,
    ProductCustomizationTemplateSerializer,
)
from apps.products.models import Product


VALID_FIELD_TYPES = {choice[0] for choice in FieldType.choices}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


class AdminCustomizationTemplateListView(AdminBaseView):
    required_permissions = {
        "GET": "products.view",
        "POST": "products.update",
    }

    def get(self, request):
        templates = (
            CustomizationTemplate.objects.all()
            .prefetch_related("fields__options")
            .order_by("sort_order", "name")
        )
        return success_response(
            CustomizationTemplateSerializer(templates, many=True).data
        )

    def post(self, request):
        data = request.data
        key = (data.get("key") or "").strip()
        name = (data.get("name") or "").strip()
        if not key or not name:
            return validation_error_response({"key/name": "required"})
        if CustomizationTemplate.objects.filter(key=key).exists():
            return error_response("customizations.template_key_taken")
        tpl = CustomizationTemplate.objects.create(
            key=key,
            name=name,
            description=data.get("description", ""),
            is_active=bool(data.get("is_active", True)),
            sort_order=int(data.get("sort_order", 0) or 0),
        )
        return created_response(CustomizationTemplateSerializer(tpl).data)


class AdminCustomizationTemplateDetailView(AdminBaseView):
    required_permissions = {
        "GET": "products.view",
        "PATCH": "products.update",
        "DELETE": "products.update",
    }

    def _get(self, template_id):
        try:
            return CustomizationTemplate.objects.prefetch_related(
                "fields__options"
            ).get(id=template_id)
        except CustomizationTemplate.DoesNotExist:
            return None

    def get(self, request, template_id):
        tpl = self._get(template_id)
        if not tpl:
            return error_response("customizations.template_not_found", status_code=404)
        return success_response(CustomizationTemplateSerializer(tpl).data)

    def patch(self, request, template_id):
        tpl = self._get(template_id)
        if not tpl:
            return error_response("customizations.template_not_found", status_code=404)
        for field in ("name", "description"):
            if field in request.data:
                setattr(tpl, field, request.data[field])
        if "is_active" in request.data:
            tpl.is_active = bool(request.data["is_active"])
        if "sort_order" in request.data:
            tpl.sort_order = int(request.data["sort_order"] or 0)
        tpl.save()
        return success_response(CustomizationTemplateSerializer(tpl).data)

    def delete(self, request, template_id):
        tpl = self._get(template_id)
        if not tpl:
            return error_response("customizations.template_not_found", status_code=404)
        tpl.delete()
        return success_response()


# ---------------------------------------------------------------------------
# Fields (under a template OR under a product directly)
# ---------------------------------------------------------------------------


def _normalize_field_payload(data: dict) -> dict | str:
    """Returns a cleaned dict or an error code string."""
    key = (data.get("key") or "").strip()
    label = (data.get("label") or "").strip()
    field_type = (data.get("field_type") or "").strip()
    if not key or not label:
        return "customizations.field_key_label_required"
    if field_type not in VALID_FIELD_TYPES:
        return "customizations.invalid_field_type"
    return {
        "key": key,
        "label": label,
        "field_type": field_type,
        "help_text": data.get("help_text", "") or "",
        "is_required": bool(data.get("is_required", False)),
        "surcharge_pence": int(data.get("surcharge_pence", 0) or 0),
        "config": data.get("config") or {},
        "sort_order": int(data.get("sort_order", 0) or 0),
    }


class AdminTemplateFieldsView(AdminBaseView):
    """Create a field on a template."""

    required_permission = "products.update"

    def post(self, request, template_id):
        try:
            tpl = CustomizationTemplate.objects.get(id=template_id)
        except CustomizationTemplate.DoesNotExist:
            return error_response("customizations.template_not_found", status_code=404)
        cleaned = _normalize_field_payload(request.data)
        if isinstance(cleaned, str):
            return error_response(cleaned)
        if CustomizationField.objects.filter(template=tpl, key=cleaned["key"]).exists():
            return error_response("customizations.field_key_taken")
        field = CustomizationField.objects.create(template=tpl, **cleaned)
        return created_response(CustomizationFieldSerializer(field).data)


class AdminProductFieldsView(AdminBaseView):
    """Create an ad-hoc field directly on a product."""

    required_permission = "products.update"

    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)
        cleaned = _normalize_field_payload(request.data)
        if isinstance(cleaned, str):
            return error_response(cleaned)
        if CustomizationField.objects.filter(product=product, key=cleaned["key"]).exists():
            return error_response("customizations.field_key_taken")
        field = CustomizationField.objects.create(product=product, **cleaned)
        return created_response(CustomizationFieldSerializer(field).data)


class AdminFieldDetailView(AdminBaseView):
    """Update or delete a single field (template or ad-hoc)."""

    required_permission = "products.update"

    def _get(self, field_id):
        try:
            return CustomizationField.objects.prefetch_related("options").get(id=field_id)
        except CustomizationField.DoesNotExist:
            return None

    def patch(self, request, field_id):
        field = self._get(field_id)
        if not field:
            return error_response("customizations.field_not_found", status_code=404)
        for attr in ("label", "help_text"):
            if attr in request.data:
                setattr(field, attr, request.data[attr] or "")
        if "is_required" in request.data:
            field.is_required = bool(request.data["is_required"])
        if "surcharge_pence" in request.data:
            field.surcharge_pence = int(request.data["surcharge_pence"] or 0)
        if "config" in request.data:
            field.config = request.data["config"] or {}
        if "sort_order" in request.data:
            field.sort_order = int(request.data["sort_order"] or 0)
        if "field_type" in request.data:
            ft = request.data["field_type"]
            if ft not in VALID_FIELD_TYPES:
                return error_response("customizations.invalid_field_type")
            field.field_type = ft
        field.save()
        return success_response(CustomizationFieldSerializer(field).data)

    def delete(self, request, field_id):
        field = self._get(field_id)
        if not field:
            return error_response("customizations.field_not_found", status_code=404)
        field.delete()
        return success_response()


# ---------------------------------------------------------------------------
# Options (for SELECT / POSITION fields)
# ---------------------------------------------------------------------------


class AdminFieldOptionsView(AdminBaseView):
    """Create an option on a field."""

    required_permission = "products.update"

    def post(self, request, field_id):
        try:
            field = CustomizationField.objects.get(id=field_id)
        except CustomizationField.DoesNotExist:
            return error_response("customizations.field_not_found", status_code=404)
        value = (request.data.get("value") or "").strip()
        label = (request.data.get("label") or "").strip()
        if not value or not label:
            return validation_error_response({"value/label": "required"})
        if CustomizationFieldOption.objects.filter(field=field, value=value).exists():
            return error_response("customizations.option_value_taken")
        opt = CustomizationFieldOption.objects.create(
            field=field,
            value=value,
            label=label,
            surcharge_pence=int(request.data.get("surcharge_pence", 0) or 0),
            preview_image_url=request.data.get("preview_image_url", "") or "",
            sort_order=int(request.data.get("sort_order", 0) or 0),
        )
        return created_response(CustomizationFieldOptionSerializer(opt).data)


class AdminFieldOptionDetailView(AdminBaseView):
    required_permission = "products.update"

    def _get(self, option_id):
        try:
            return CustomizationFieldOption.objects.get(id=option_id)
        except CustomizationFieldOption.DoesNotExist:
            return None

    def patch(self, request, option_id):
        opt = self._get(option_id)
        if not opt:
            return error_response("customizations.option_not_found", status_code=404)
        for attr in ("label", "preview_image_url"):
            if attr in request.data:
                setattr(opt, attr, request.data[attr] or "")
        if "surcharge_pence" in request.data:
            opt.surcharge_pence = int(request.data["surcharge_pence"] or 0)
        if "sort_order" in request.data:
            opt.sort_order = int(request.data["sort_order"] or 0)
        opt.save()
        return success_response(CustomizationFieldOptionSerializer(opt).data)

    def delete(self, request, option_id):
        opt = self._get(option_id)
        if not opt:
            return error_response("customizations.option_not_found", status_code=404)
        opt.delete()
        return success_response()


# ---------------------------------------------------------------------------
# Product ↔ Template attachments
# ---------------------------------------------------------------------------


class AdminProductCustomizationsView(AdminBaseView):
    """List/replace customization template attachments + ad-hoc fields on a product."""

    required_permissions = {
        "GET": "products.view",
        "POST": "products.update",
    }

    def get(self, request, product_id):
        try:
            product = Product.objects.prefetch_related(
                "customization_template_links__template__fields__options",
                "ad_hoc_customization_fields__options",
            ).get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)
        return success_response({
            "templates": ProductCustomizationTemplateSerializer(
                product.customization_template_links.all().order_by("sort_order"),
                many=True,
            ).data,
            "ad_hoc_fields": CustomizationFieldSerializer(
                product.ad_hoc_customization_fields.all().order_by("sort_order"),
                many=True,
            ).data,
        })

    @transaction.atomic
    def post(self, request, product_id):
        """Attach a template to a product."""
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)
        template_id = request.data.get("template_id")
        if not template_id:
            return validation_error_response({"template_id": "required"})
        try:
            template = CustomizationTemplate.objects.get(id=template_id)
        except CustomizationTemplate.DoesNotExist:
            return error_response("customizations.template_not_found", status_code=404)
        link, created = ProductCustomizationTemplate.objects.get_or_create(
            product=product,
            template=template,
            defaults={"sort_order": int(request.data.get("sort_order", 0) or 0)},
        )
        if not created:
            return error_response("customizations.template_already_attached")
        return created_response(
            ProductCustomizationTemplateSerializer(link).data
        )


class AdminProductCustomizationDetailView(AdminBaseView):
    """Detach a template from a product."""

    required_permission = "products.update"

    def delete(self, request, product_id, link_id):
        try:
            link = ProductCustomizationTemplate.objects.get(
                id=link_id, product_id=product_id,
            )
        except ProductCustomizationTemplate.DoesNotExist:
            return error_response("customizations.attachment_not_found", status_code=404)
        link.delete()
        return success_response()
