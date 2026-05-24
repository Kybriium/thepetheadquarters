"""
Image upload service.

Strategy: if CLOUDINARY_URL is configured, upload to Cloudinary CDN.
Otherwise save to local MEDIA_ROOT (dev fallback). The caller always
gets a URL back regardless of which backend was used.
"""

import io
import logging
import secrets
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)


ALLOWED_FORMATS = {"JPEG", "JPG", "PNG", "WEBP", "GIF"}
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB
MAX_DIMENSION = 4000  # px


class UploadError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _validate_image(file):
    """Open with Pillow to verify it's a real image and within size limits."""
    if file.size > MAX_FILE_SIZE:
        raise UploadError("upload.file_too_large")

    file.seek(0)
    try:
        img = Image.open(file)
        img.verify()  # Verify it's a valid image
    except (UnidentifiedImageError, Exception):
        raise UploadError("upload.invalid_image")

    file.seek(0)
    img = Image.open(file)
    fmt = (img.format or "").upper()
    if fmt not in ALLOWED_FORMATS:
        raise UploadError("upload.unsupported_format")

    if img.width > MAX_DIMENSION or img.height > MAX_DIMENSION:
        raise UploadError("upload.image_too_large")

    file.seek(0)
    return img, fmt


def upload_image(file, folder="products", request=None):
    """
    Upload an image and return its public URL.

    Args:
        file: Django UploadedFile (multipart/form-data)
        folder: subfolder within storage
        request: the originating HTTPRequest, used only by the
            local-storage path to build an absolute URL. Optional;
            without it we fall back to a relative `/media/...` URL
            which means downstream callers must accept that shape.

    Returns:
        dict with 'url' (public URL) and 'storage' ('cloudinary' or 'local')
    """
    _validate_image(file)
    file.seek(0)

    if settings.CLOUDINARY_URL:
        return _upload_to_cloudinary(file, folder)

    return _upload_to_local(file, folder, request=request)


def _upload_to_cloudinary(file, folder):
    import cloudinary.uploader

    try:
        result = cloudinary.uploader.upload(
            file,
            folder=f"tph/{folder}",
            resource_type="image",
            quality="auto",
            fetch_format="auto",
        )
    except Exception:
        logger.exception("Cloudinary upload failed")
        raise UploadError("upload.cloudinary_failed")

    return {
        "url": result["secure_url"],
        "storage": "cloudinary",
        "public_id": result.get("public_id", ""),
    }


def _upload_to_local(file, folder, request=None):
    """Save to MEDIA_ROOT/<folder>/<random_name>.<ext>.

    Returns an ABSOLUTE URL when a request is provided (e.g.
    `http://localhost:8000/media/products/abc.jpg`). Falls back to a
    relative `/media/...` URL otherwise. Why absolute matters:
    downstream callers persist this URL as a `ProductImage.url`,
    which is validated as `URLField` — relative paths fail that
    validator and surface as a 422 to the admin.
    """
    ext = Path(file.name).suffix.lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        ext = ".jpg"

    # Generate unguessable filename
    name = f"{secrets.token_urlsafe(16)}{ext}"
    relative_path = f"{folder}/{name}"

    saved_path = default_storage.save(
        relative_path,
        ContentFile(file.read()),
    )

    # Build public URL: /media/<folder>/<name>
    relative_url = f"{settings.MEDIA_URL}{saved_path}"
    url = request.build_absolute_uri(relative_url) if request is not None else relative_url

    return {
        "url": url,
        "storage": "local",
        "public_id": "",
    }


def delete_image(public_id):
    """Delete an image from Cloudinary by public_id (no-op for local storage)."""
    if not settings.CLOUDINARY_URL or not public_id:
        return
    try:
        import cloudinary.uploader
        cloudinary.uploader.destroy(public_id)
    except Exception:
        logger.warning("Failed to delete Cloudinary image %s", public_id)
