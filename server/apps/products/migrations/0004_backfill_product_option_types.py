"""
For every existing product, materialize a ProductOptionType row for each
OptionType that already appears among its variants' option_values. Previously
the storefront derived the variant axes implicitly; with the new explicit
join the admin gets a canonical list to read/edit. Newly-seeded products with
no variants yet are unaffected.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    ProductOptionType = apps.get_model("products", "ProductOptionType")

    for product in Product.objects.all():
        seen: dict[str, int] = {}
        for variant in product.variants.all():
            for value in variant.option_values.all():
                ot_id = value.option_type_id
                if ot_id not in seen:
                    seen[ot_id] = len(seen)
        for ot_id, sort_order in seen.items():
            ProductOptionType.objects.get_or_create(
                product=product,
                option_type_id=ot_id,
                defaults={"sort_order": sort_order},
            )


def noop(apps, schema_editor):
    """The forward op is idempotent, so reversal just leaves rows in place."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0003_optiontype_code_optionvalue_swatch_hex_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
