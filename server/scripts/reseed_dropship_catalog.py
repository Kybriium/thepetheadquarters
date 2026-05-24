"""
One-off catalogue reseed.

Wipes all Product rows (cascade cleans variants, images, translations,
customisation fields, ProductCategory links) and recreates a focused set
of dropship items with verified-live photos. Run with:

    uv run python manage.py shell < scripts/reseed_dropship_catalog.py

Used in dev only — destructive. Categories, brands, and suppliers are
preserved (or created on the fly when missing).
"""

import django, os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
try:
    django.setup()
except RuntimeError:
    pass

from django.db import transaction
from django.utils.text import slugify

from apps.brands.models import Brand
from apps.categories.models import Category, CategoryTranslation
from apps.customizations.models import (
    CustomizationField,
    CustomizationFieldOption,
    FieldType,
)
from apps.products.models import (
    Product,
    ProductCategory,
    ProductImage,
    ProductTranslation,
    ProductVariant,
)
from apps.suppliers.models import Supplier


# ---------------------------------------------------------------------------
# Dataset — every URL probed live before commit. Photos are Unsplash IDs
# of well-known photographers; should remain stable for the foreseeable
# future. Each product gets 2-3 images.
# ---------------------------------------------------------------------------

PRODUCTS = [
    {
        "slug": "personalised-leather-collar",
        "name": "Personalised Leather Dog Collar",
        "short": "Hand-finished leather with up to 20 characters engraved on a brass plate.",
        "description": (
            "Real cowhide leather, brass hardware, and your dog's name engraved "
            "on a polished plate. Each collar is made-to-order by our partner "
            "workshop and shipped within 7 working days. Built to last; ages "
            "into a unique patina with wear."
        ),
        "category_slug": "collars-leads",
        "brand_slug": None,
        "supplier_slug": "artisan-leather-co",
        "price_pence": 2999,
        "compare_at_pence": 3999,
        "cost_pence": 1100,  # supplier dropship cost
        "stock": 50,
        "weight_g": 180,
        "images": [
            "https://images.unsplash.com/photo-1605897472359-85e4b94d685d?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1568572933382-74d440642117?w=1200&h=1200&fit=crop&auto=format&q=80",
        ],
        "customizations": [
            {
                "key": "engraving_text",
                "label": "Engraving (max 20 characters)",
                "help": "Pet's name or short phrase — letters and numbers only.",
                "type": FieldType.TEXT,
                "required": True,
                "surcharge": 300,
                "config": {"max_length": 20, "min_length": 1},
            },
        ],
    },
    {
        "slug": "custom-pet-portrait-frame",
        "name": "Custom Pet Portrait Photo Frame",
        "short": "Upload your pet's photo — we print it onto premium hardwood and ship in 10 days.",
        "description": (
            "Solid oak frame, archival-quality print, glass cover. Upload any "
            "decent-resolution photo of your pet and we'll handle the colour "
            "balancing, cropping and printing. Shipped flat in protective "
            "packaging."
        ),
        "category_slug": "beds-furniture",
        "brand_slug": None,
        "supplier_slug": "custom-print-direct",
        "price_pence": 3499,
        "compare_at_pence": None,
        "cost_pence": 1400,
        "stock": 30,
        "weight_g": 850,
        "images": [
            "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?w=1200&h=1200&fit=crop&auto=format&q=80",
        ],
        "customizations": [
            {
                "key": "pet_photo",
                "label": "Pet photo",
                "help": "Upload a clear photo of your pet — JPG or PNG, at least 600×600px.",
                "type": FieldType.IMAGE,
                "required": True,
                "surcharge": 0,
                "config": {"max_file_mb": 10, "min_resolution_px": 600},
            },
            {
                "key": "frame_size",
                "label": "Frame size",
                "help": "Larger sizes use the same photo at the higher resolution.",
                "type": FieldType.SELECT,
                "required": True,
                "surcharge": 0,
                "config": {},
                "options": [
                    {"value": "small", "label": "Small (15 × 20cm)", "surcharge": 0},
                    {"value": "medium", "label": "Medium (20 × 30cm)", "surcharge": 800},
                    {"value": "large", "label": "Large (30 × 40cm)", "surcharge": 1600},
                ],
            },
        ],
    },
    {
        "slug": "tall-cat-scratching-post",
        "name": "Tall Sisal Cat Scratching Post (90cm)",
        "short": "90cm sturdy sisal-wrapped post with sturdy MDF base — saves your furniture.",
        "description": (
            "Tall enough for adult cats to fully extend. Wrapped in dense "
            "natural sisal rope, mounted on a wide MDF base for stability. "
            "Replacement post heads available separately."
        ),
        "category_slug": "cat-toys",
        "brand_slug": None,
        "supplier_slug": "pets-wholesale-uk",
        "price_pence": 2499,
        "compare_at_pence": 2999,
        "cost_pence": 950,
        "stock": 80,
        "weight_g": 3200,
        "images": [
            "https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1574144611937-0df059b5ef3e?w=1200&h=1200&fit=crop&auto=format&q=80",
        ],
        "customizations": [],
    },
    {
        "slug": "cooling-gel-pet-mat",
        "name": "Self-Cooling Gel Pet Mat",
        "short": "Pressure-activated cooling pad for hot days. No water, no electricity.",
        "description": (
            "Non-toxic cooling gel that activates from the warmth of your pet. "
            "Drops surface temperature by 5–8°C for 3–4 hours per use, then "
            "self-recharges in the shade. Wipe-clean, scratch-resistant."
        ),
        "category_slug": "beds-furniture",
        "brand_slug": None,
        "supplier_slug": "pets-wholesale-uk",
        "price_pence": 1899,
        "compare_at_pence": 2499,
        "cost_pence": 720,
        "stock": 120,
        "weight_g": 1100,
        "images": [
            "https://images.unsplash.com/photo-1591946614720-90a587da4a36?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=1200&h=1200&fit=crop&auto=format&q=80",
        ],
        "customizations": [],
    },
    {
        "slug": "interactive-treat-ball",
        "name": "Interactive Slow-Feeder Treat Ball",
        "short": "Adjustable difficulty puzzle ball — slows fast eaters and burns mental energy.",
        "description": (
            "Two halves screw together with an adjustable opening — dial it "
            "tighter for advanced chewers. Use with kibble or dry treats; "
            "dishwasher-safe."
        ),
        "category_slug": "dog-toys",
        "brand_slug": None,
        "supplier_slug": "pets-wholesale-uk",
        "price_pence": 1299,
        "compare_at_pence": None,
        "cost_pence": 480,
        "stock": 200,
        "weight_g": 250,
        "images": [
            "https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1200&h=1200&fit=crop&auto=format&q=80",
        ],
        "customizations": [],
    },
    {
        "slug": "reflective-no-pull-harness",
        "name": "Reflective No-Pull Dog Harness",
        "short": "Front-clip no-pull design with full reflective trim. Adjustable for the perfect fit.",
        "description": (
            "Padded chest plate distributes pressure evenly; front D-ring "
            "discourages pulling without straining the throat. 360° reflective "
            "trim for low-light walks. Four adjustment points fit dogs from "
            "small to extra-large."
        ),
        "category_slug": "collars-leads",
        "brand_slug": "ruffwear",
        "supplier_slug": "pets-wholesale-uk",
        "price_pence": 3499,
        "compare_at_pence": 4499,
        "cost_pence": 1350,
        "stock": 60,
        "weight_g": 400,
        "images": [
            "https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=1200&h=1200&fit=crop&auto=format&q=80",
            "https://images.unsplash.com/photo-1568572933382-74d440642117?w=1200&h=1200&fit=crop&auto=format&q=80",
        ],
        "customizations": [],
    },
]


SUPPLIERS = {
    "artisan-leather-co": {
        "name": "Artisan Leather Co.",
        "contact_email": "orders@artisanleather.example",
    },
    "custom-print-direct": {
        "name": "Custom Print Direct",
        "contact_email": "orders@customprint.example",
    },
    "pets-wholesale-uk": {
        "name": "Pets Wholesale UK",
        "contact_email": "orders@petswholesale.example",
    },
}


def _supplier_for(slug):
    info = SUPPLIERS[slug]
    obj, _ = Supplier.objects.get_or_create(
        name=info["name"],
        defaults={"contact_email": info["contact_email"], "is_active": True},
    )
    return obj


def _category_for(slug):
    return Category.objects.filter(slug=slug).first()


def _brand_for(slug):
    if not slug:
        return None
    return Brand.objects.filter(slug=slug).first()


@transaction.atomic
def main():
    # 1) Wipe — Product cascade nukes ProductVariant, ProductImage,
    #    ProductTranslation, ProductCategory, customisation fields tied
    #    to products. Categories, brands and suppliers are kept.
    wiped = Product.objects.all().count()
    Product.objects.all().delete()
    print(f"Deleted {wiped} products (cascade cleaned variants/images/etc.)")

    # 2) Ensure suppliers exist.
    for sslug in SUPPLIERS:
        s = _supplier_for(sslug)
        print(f"  supplier ready: {s.name}")

    # 3) Seed each product.
    for spec in PRODUCTS:
        category = _category_for(spec["category_slug"])
        if not category:
            print(f"!! skipping {spec['slug']}: category {spec['category_slug']} missing")
            continue

        brand = _brand_for(spec["brand_slug"])
        supplier = _supplier_for(spec["supplier_slug"])

        product = Product.objects.create(
            slug=spec["slug"],
            brand_id=brand.id if brand else None,
            fulfillment_type=Product.FulfillmentType.DROPSHIP,
            is_featured=True,
            is_active=True,
        )
        ProductTranslation.objects.create(
            product=product,
            language="en",
            name=spec["name"],
            short_description=spec["short"],
            description=spec["description"],
        )
        ProductCategory.objects.create(product=product, category_id=category.id)

        # Single variant per product (sizing handled via customisations
        # where relevant). SKU = uppercased slug.
        sku = spec["slug"].upper().replace("-", "_")
        variant = ProductVariant.objects.create(
            product=product,
            sku=sku,
            price=spec["price_pence"],
            compare_at_price=spec["compare_at_pence"],
            cost_price=spec["cost_pence"],
            stock_quantity=spec["stock"],
            weight_grams=spec["weight_g"],
            is_active=True,
        )

        for i, url in enumerate(spec["images"]):
            ProductImage.objects.create(
                product=product,
                url=url,
                alt_text=spec["name"],
                is_primary=(i == 0),
                sort_order=i,
            )

        # Customisation fields (TEXT / IMAGE / SELECT with options).
        for c_i, c in enumerate(spec["customizations"]):
            field = CustomizationField.objects.create(
                product=product,
                key=c["key"],
                label=c["label"],
                help_text=c.get("help", ""),
                field_type=c["type"],
                is_required=c.get("required", False),
                surcharge_pence=c.get("surcharge", 0),
                config=c.get("config", {}),
                sort_order=c_i,
            )
            for o_i, opt in enumerate(c.get("options", []) or []):
                CustomizationFieldOption.objects.create(
                    field=field,
                    value=opt["value"],
                    label=opt["label"],
                    surcharge_pence=opt.get("surcharge", 0),
                    sort_order=o_i,
                )

        on_sale_note = ""
        if spec["compare_at_pence"]:
            on_sale_note = f" (was £{spec['compare_at_pence']/100:.2f})"
        print(
            f"  + {spec['slug']:32}  £{spec['price_pence']/100:.2f}{on_sale_note}  "
            f"supplier={supplier.name}  cost=£{spec['cost_pence']/100:.2f}  "
            f"{len(spec['images'])} imgs  {len(spec['customizations'])} cust"
        )

    print()
    print(f"Now in DB: {Product.objects.count()} products, "
          f"{ProductVariant.objects.count()} variants, "
          f"{ProductImage.objects.count()} images.")


main()
