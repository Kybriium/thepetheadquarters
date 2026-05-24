"""
Admin CRUD for variant axes (Size, Color, …) and their values, plus the
product↔axis attachment endpoint. Storefront reads option types via the
public ProductDetail serializer — this module is staff-only writes.
"""

from django.db import transaction

from apps.admin_panel.views.base import AdminBaseView
from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)
from apps.products.models import (
    OptionType,
    OptionTypeTranslation,
    OptionValue,
    OptionValueTranslation,
    Product,
    ProductOptionType,
)


def _serialize_option_value(v: OptionValue) -> dict:
    t = v.translations.filter(language="en").first()
    return {
        "id": str(v.id),
        "label": t.value if t else "",
        "swatch_hex": v.swatch_hex,
        "swatch_image_url": v.swatch_image_url,
        "sort_order": v.sort_order,
    }


def _serialize_option_type(ot: OptionType) -> dict:
    t = ot.translations.filter(language="en").first()
    return {
        "id": str(ot.id),
        "code": ot.code or "",
        "name": t.name if t else (ot.code or ""),
        "sort_order": ot.sort_order,
        "values": [
            _serialize_option_value(v) for v in ot.values.all().order_by("sort_order")
        ],
    }


# ---------------------------------------------------------------------------
# Option types
# ---------------------------------------------------------------------------


class AdminOptionTypeListView(AdminBaseView):
    def get(self, request):
        types = (
            OptionType.objects.all()
            .prefetch_related("translations", "values__translations")
            .order_by("sort_order")
        )
        return success_response([_serialize_option_type(t) for t in types])

    @transaction.atomic
    def post(self, request):
        code = (request.data.get("code") or "").strip().lower()
        name = (request.data.get("name") or "").strip()
        if not code or not name:
            return validation_error_response({"code/name": "required"})
        if OptionType.objects.filter(code=code).exists():
            return error_response("admin.option_types.code_taken")

        sort_order = int(request.data.get("sort_order", 0) or 0)
        ot = OptionType.objects.create(code=code, sort_order=sort_order)
        OptionTypeTranslation.objects.create(option_type=ot, language="en", name=name)
        return created_response(_serialize_option_type(ot))


class AdminOptionTypeDetailView(AdminBaseView):
    def _get(self, option_type_id):
        try:
            return OptionType.objects.prefetch_related(
                "translations", "values__translations"
            ).get(id=option_type_id)
        except OptionType.DoesNotExist:
            return None

    def patch(self, request, option_type_id):
        ot = self._get(option_type_id)
        if not ot:
            return error_response("admin.option_types.not_found", status_code=404)
        if "name" in request.data:
            translation, _ = OptionTypeTranslation.objects.get_or_create(
                option_type=ot, language="en",
                defaults={"name": request.data["name"] or ""},
            )
            translation.name = request.data["name"] or ""
            translation.save()
        if "sort_order" in request.data:
            ot.sort_order = int(request.data["sort_order"] or 0)
            ot.save(update_fields=["sort_order"])
        return success_response(_serialize_option_type(ot))

    def delete(self, request, option_type_id):
        ot = self._get(option_type_id)
        if not ot:
            return error_response("admin.option_types.not_found", status_code=404)
        ot.delete()
        return success_response()


# ---------------------------------------------------------------------------
# Option values
# ---------------------------------------------------------------------------


class AdminOptionTypeValuesView(AdminBaseView):
    """Create a value under an existing option type."""

    @transaction.atomic
    def post(self, request, option_type_id):
        try:
            ot = OptionType.objects.get(id=option_type_id)
        except OptionType.DoesNotExist:
            return error_response("admin.option_types.not_found", status_code=404)

        label = (request.data.get("label") or "").strip()
        if not label:
            return validation_error_response({"label": "required"})

        sort_order = int(request.data.get("sort_order", ot.values.count()) or 0)
        v = OptionValue.objects.create(
            option_type=ot,
            sort_order=sort_order,
            swatch_hex=(request.data.get("swatch_hex") or "").strip(),
            swatch_image_url=(request.data.get("swatch_image_url") or "").strip(),
        )
        OptionValueTranslation.objects.create(
            option_value=v, language="en", value=label,
        )
        return created_response(_serialize_option_value(v))


class AdminOptionValueDetailView(AdminBaseView):
    def _get(self, value_id):
        try:
            return OptionValue.objects.get(id=value_id)
        except OptionValue.DoesNotExist:
            return None

    @transaction.atomic
    def patch(self, request, value_id):
        v = self._get(value_id)
        if not v:
            return error_response("admin.option_values.not_found", status_code=404)

        if "label" in request.data:
            translation, _ = OptionValueTranslation.objects.get_or_create(
                option_value=v, language="en",
                defaults={"value": request.data["label"] or ""},
            )
            translation.value = request.data["label"] or ""
            translation.save()
        if "swatch_hex" in request.data:
            v.swatch_hex = (request.data["swatch_hex"] or "").strip()
        if "swatch_image_url" in request.data:
            v.swatch_image_url = (request.data["swatch_image_url"] or "").strip()
        if "sort_order" in request.data:
            v.sort_order = int(request.data["sort_order"] or 0)
        v.save()
        return success_response(_serialize_option_value(v))

    def delete(self, request, value_id):
        v = self._get(value_id)
        if not v:
            return error_response("admin.option_values.not_found", status_code=404)
        v.delete()
        return success_response()


# ---------------------------------------------------------------------------
# Product ↔ option type attachments
# ---------------------------------------------------------------------------


class AdminProductOptionTypesView(AdminBaseView):
    """List, attach, or detach the axes a product is variantable along."""

    def get(self, request, product_id):
        try:
            product = Product.objects.prefetch_related(
                "option_type_links__option_type__translations",
                "option_type_links__option_type__values__translations",
            ).get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)

        return success_response([
            {
                "id": str(link.id),
                "option_type_id": str(link.option_type_id),
                "code": link.option_type.code or "",
                "name": (
                    link.option_type.translations.filter(language="en").first().name
                    if link.option_type.translations.filter(language="en").exists()
                    else (link.option_type.code or "")
                ),
                "sort_order": link.sort_order,
                "values": [
                    _serialize_option_value(v)
                    for v in link.option_type.values.all().order_by("sort_order")
                ],
            }
            for link in product.option_type_links.all().order_by("sort_order")
        ])

    @transaction.atomic
    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return error_response("admin.products.not_found", status_code=404)

        option_type_id = request.data.get("option_type_id")
        if not option_type_id:
            return validation_error_response({"option_type_id": "required"})
        try:
            ot = OptionType.objects.get(id=option_type_id)
        except OptionType.DoesNotExist:
            return error_response("admin.option_types.not_found", status_code=404)

        link, created = ProductOptionType.objects.get_or_create(
            product=product, option_type=ot,
            defaults={
                "sort_order": int(
                    request.data.get("sort_order", product.option_type_links.count()) or 0
                ),
            },
        )
        if not created:
            return error_response("admin.option_types.already_attached")
        return created_response({"id": str(link.id), "option_type_id": str(ot.id)})


class AdminProductOptionTypeDetailView(AdminBaseView):
    """Detach an axis from a product."""

    def delete(self, request, product_id, link_id):
        try:
            link = ProductOptionType.objects.get(id=link_id, product_id=product_id)
        except ProductOptionType.DoesNotExist:
            return error_response("admin.option_types.attachment_not_found", status_code=404)
        link.delete()
        return success_response()
