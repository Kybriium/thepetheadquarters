"""
Public customization endpoints (storefront-facing).

The endpoints intentionally live on the public API surface so a guest
checking out can both read a product's field schema and upload an image
without authenticating. The upload endpoint is rate-limited tightly to
prevent abuse, since it accepts files into our storage backend.
"""

from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.admin_panel.services.uploads import UploadError, upload_image
from apps.core.responses import error_response, success_response
from apps.products.models import Product

from .services import resolve_product_fields


class ProductCustomizationsView(APIView):
    """`GET /products/<slug>/customizations/` → ordered field schema."""

    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        try:
            product = (
                Product.objects
                .prefetch_related(
                    "ad_hoc_customization_fields__options",
                    "customization_template_links__template__fields__options",
                )
                .get(slug=slug, is_active=True)
            )
        except Product.DoesNotExist:
            return error_response("product.not_found", status_code=404)

        fields = resolve_product_fields(product)
        return success_response([f.as_dict() for f in fields])


class CustomizationUploadBurst(AnonRateThrottle):
    scope = "customization_upload"


class CustomizationUploadBurstAuth(UserRateThrottle):
    scope = "customization_upload"


class CustomizationUploadView(APIView):
    """
    `POST /customizations/upload/` — accepts a multipart file, returns the
    uploaded image URL. Same validator as the admin uploader; storage backend
    (Cloudinary vs local) is chosen by settings.CLOUDINARY_URL.

    Throttled tightly via `customization_upload` scope to make abuse expensive.
    """

    permission_classes = [AllowAny]
    throttle_classes = [CustomizationUploadBurst, CustomizationUploadBurstAuth]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return error_response("upload.no_file")

        try:
            result = upload_image(file, folder="customizations")
        except UploadError as exc:
            return error_response(exc.code)

        return success_response(data={
            "url": result["url"],
            "public_id": result["public_id"],
        })
