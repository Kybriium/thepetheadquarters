"""
Resolve and validate per-product customization input.

The public schema endpoint (`get_product_fields`) and the cart validator
(`validate_and_snapshot`) share this resolver so the customer sees the same
fields the server enforces, with no double-source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ValidationError

from .models import CustomizationField, CustomizationFieldOption, FieldType


# Hard ceilings — applied even if a field's config says higher, so a misconfigured
# admin row can't be weaponized to DoS the JSONField or storage.
TEXT_MAX_LENGTH_CEILING = 500
LONG_TEXT_MAX_LENGTH_CEILING = 5000
ALLOWED_IMAGE_URL_SCHEMES = ("http://", "https://")


class CustomizationError(ValidationError):
    """Raised when submitted customization input fails validation."""


@dataclass
class ResolvedField:
    """Lightweight, JSON-serializable view of a field plus its options."""

    id: str
    key: str
    label: str
    help_text: str
    field_type: str
    is_required: bool
    surcharge_pence: int
    config: dict[str, Any]
    sort_order: int
    options: list[dict[str, Any]]
    source: str  # "product" | f"template:{template_key}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "key": self.key,
            "label": self.label,
            "help_text": self.help_text,
            "field_type": self.field_type,
            "is_required": self.is_required,
            "surcharge_pence": self.surcharge_pence,
            "config": self.config,
            "options": self.options,
            "source": self.source,
        }


def resolve_product_fields(product) -> list[ResolvedField]:
    """
    Union of (ad-hoc product fields) + (fields from each attached template),
    sorted by source priority then per-source sort_order. The order is stable
    and matches how the storefront renders them.
    """
    resolved: list[ResolvedField] = []

    # Ad-hoc fields directly on the product.
    ad_hoc = (
        CustomizationField.objects
        .filter(product_id=product.id)
        .prefetch_related("options")
        .order_by("sort_order", "label")
    )
    for field in ad_hoc:
        resolved.append(_to_resolved(field, source="product"))

    # Template-derived fields, in template attachment order, then field order.
    template_links = (
        product.customization_template_links.select_related("template")
        .prefetch_related("template__fields__options")
        .order_by("sort_order")
    )
    for link in template_links:
        if not link.template.is_active:
            continue
        for field in link.template.fields.all().order_by("sort_order", "label"):
            resolved.append(
                _to_resolved(field, source=f"template:{link.template.key}")
            )

    return resolved


def _to_resolved(field: CustomizationField, source: str) -> ResolvedField:
    options = [
        {
            "id": str(opt.id),
            "value": opt.value,
            "label": opt.label,
            "surcharge_pence": opt.surcharge_pence,
            "preview_image_url": opt.preview_image_url,
        }
        for opt in field.options.all().order_by("sort_order", "label")
    ]
    return ResolvedField(
        id=str(field.id),
        key=field.key,
        label=field.label,
        help_text=field.help_text,
        field_type=field.field_type,
        is_required=field.is_required,
        surcharge_pence=field.surcharge_pence,
        config=dict(field.config or {}),
        sort_order=field.sort_order,
        options=options,
        source=source,
    )


def validate_and_snapshot(
    product, submitted: list[dict[str, Any]] | None
) -> tuple[list[dict[str, Any]], int]:
    """
    Validate the customer's submitted customization payload for a product and
    return (snapshot, per_unit_surcharge_pence).

    `submitted` is a list of `{key, value}` dicts (value type depends on the
    field). The returned snapshot is the persisted record — denormalized so a
    later admin edit doesn't change what the customer ordered.

    Raises CustomizationError on missing required fields, unknown keys,
    oversized text, invalid option choices, or non-URL image values.
    """
    fields = resolve_product_fields(product)
    if not fields:
        # Product is not customizable — reject any payload to avoid silent
        # storage of garbage.
        if submitted:
            raise CustomizationError("customization.not_customizable")
        return [], 0

    by_key = {f.key: f for f in fields}
    submitted_by_key = {item["key"]: item.get("value") for item in (submitted or [])}

    # Unknown keys — reject so typos/tampering can't sneak through.
    unknown = set(submitted_by_key.keys()) - set(by_key.keys())
    if unknown:
        raise CustomizationError(
            "customization.unknown_field", params={"keys": sorted(unknown)}
        )

    snapshot: list[dict[str, Any]] = []
    per_unit_surcharge = 0

    for field in fields:
        raw_value = submitted_by_key.get(field.key)
        present = raw_value not in (None, "", [])

        if field.is_required and not present:
            raise CustomizationError(
                "customization.required_field_missing",
                params={"key": field.key},
            )
        if not present:
            continue

        snapshot_entry, surcharge = _validate_one(field, raw_value)
        snapshot.append(snapshot_entry)
        per_unit_surcharge += surcharge

    return snapshot, per_unit_surcharge


def _validate_one(
    field: ResolvedField, value: Any
) -> tuple[dict[str, Any], int]:
    """Validate a single field's value and return (snapshot_entry, surcharge)."""

    entry: dict[str, Any] = {
        "key": field.key,
        "label": field.label,
        "field_type": field.field_type,
        "surcharge_pence": field.surcharge_pence,
    }

    if field.field_type in (FieldType.TEXT, FieldType.LONG_TEXT):
        if not isinstance(value, str):
            raise CustomizationError(
                "customization.invalid_type", params={"key": field.key}
            )
        text = value.strip()
        ceiling = (
            TEXT_MAX_LENGTH_CEILING
            if field.field_type == FieldType.TEXT
            else LONG_TEXT_MAX_LENGTH_CEILING
        )
        max_len = min(int(field.config.get("max_length", ceiling)), ceiling)
        if len(text) > max_len:
            raise CustomizationError(
                "customization.text_too_long",
                params={"key": field.key, "max": max_len},
            )
        entry["value"] = text
        entry["label_value"] = text
        return entry, field.surcharge_pence

    if field.field_type == FieldType.IMAGE:
        # The frontend uploads the file via /customizations/upload/ first and
        # passes us the returned URL string. We only persist the URL + optional
        # public_id — never raw bytes.
        if isinstance(value, dict):
            url = value.get("url", "")
            public_id = value.get("public_id", "")
        else:
            url = value if isinstance(value, str) else ""
            public_id = ""
        if not isinstance(url, str) or not url.startswith(ALLOWED_IMAGE_URL_SCHEMES):
            raise CustomizationError(
                "customization.invalid_image_url", params={"key": field.key}
            )
        entry["value"] = url
        entry["label_value"] = "[uploaded image]"
        entry["image_url"] = url
        if public_id:
            entry["image_public_id"] = public_id
        return entry, field.surcharge_pence

    if field.field_type in (FieldType.SELECT, FieldType.POSITION):
        if not isinstance(value, str):
            raise CustomizationError(
                "customization.invalid_type", params={"key": field.key}
            )
        match = next((o for o in field.options if o["value"] == value), None)
        if not match:
            raise CustomizationError(
                "customization.invalid_option",
                params={"key": field.key, "value": value},
            )
        entry["value"] = match["value"]
        entry["label_value"] = match["label"]
        entry["option_id"] = match["id"]
        if match["preview_image_url"]:
            entry["preview_image_url"] = match["preview_image_url"]
        return entry, field.surcharge_pence + match["surcharge_pence"]

    # Unknown field_type — should be unreachable thanks to the enum, but
    # fail loudly rather than silently dropping the value.
    raise CustomizationError(
        "customization.unsupported_field_type", params={"key": field.key}
    )
