from django.conf import settings

from apps.core.responses import error_response, success_response

from apps.admin_panel.services.uploads import UploadError, upload_image
from apps.admin_panel.views.base import AdminBaseView


class AdminImageUploadView(AdminBaseView):
    """
    Upload an image file. Returns the public URL.
    Storage backend (Cloudinary or local) is determined by settings.CLOUDINARY_URL.
    """

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return error_response("upload.no_file")

        folder = request.data.get("folder", "products")

        try:
            # Pass the request so the local-storage path can build
            # an absolute URL — without that the response URL is
            # relative and downstream URLField validation fails.
            result = upload_image(file, folder=folder, request=request)
        except UploadError as e:
            return error_response(e.code)

        return success_response(data={
            "url": result["url"],
            "storage": result["storage"],
            "public_id": result["public_id"],
        })


class AdminUploadInfoView(AdminBaseView):
    """Returns which storage backend is currently active."""

    def get(self, request):
        return success_response(data={
            "storage": "cloudinary" if settings.CLOUDINARY_URL else "local",
            "max_file_size_mb": 8,
            "allowed_formats": ["JPEG", "PNG", "WEBP", "GIF"],
        })
