"""
Private object-storage helper for receipts, supplier invoices and any
other file we never want served from a public URL.

Three backends, chosen automatically at runtime based on what env vars
are configured:

  1. S3-compatible (Railway Bucket, Cloudflare R2, Backblaze B2, AWS
     S3, Storj) — when `AWS_STORAGE_BUCKET_NAME` + `AWS_ACCESS_KEY_ID`
     are set. Uses boto3 + signed pre-signed URLs.

  2. Cloudinary (authenticated delivery) — when `CLOUDINARY_URL` is
     set but no AWS bucket is. Uploads as `type=authenticated` so the
     files require a signed URL to download; signed URLs are
     short-lived and include the `attachment` flag so the browser
     downloads with the original filename.

  3. Local filesystem — when neither is configured. Writes under
     `MEDIA_ROOT/private/`. Convenient for dev; ephemeral on Railway,
     so never the right choice in production.

Public API stays the same regardless of backend:
  put_object(key, fileobj, content_type) -> str
  signed_url(key, ttl_seconds=None) -> str
  delete_object(key) -> None
  build_receipt_key(expense_id, filename) -> str
"""

from __future__ import annotations

import logging
import mimetypes
import os
import re
import time
import uuid
from typing import BinaryIO, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

_RECEIPTS_PREFIX = "receipts"
_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")

# File extensions Cloudinary treats as `resource_type=image`. Everything
# else uploads as `resource_type=raw`, which preserves PDFs / docs /
# zips byte-for-byte instead of trying to render them.
_CLOUDINARY_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}


# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

def _backend() -> str:
    """Pick the storage backend based on what's configured. Order
    matters: S3 wins over Cloudinary because a deployment that has
    set up a real bucket has done so deliberately."""
    if settings.AWS_STORAGE_BUCKET_NAME and settings.AWS_ACCESS_KEY_ID:
        return "s3"
    if getattr(settings, "CLOUDINARY_URL", ""):
        return "cloudinary"
    return "local"


# ---------------------------------------------------------------------------
# S3 client (lazy — boto3 only imported when actually used)
# ---------------------------------------------------------------------------

_s3_client_cache = None


def _s3_client():
    global _s3_client_cache
    if _s3_client_cache is not None:
        return _s3_client_cache
    import boto3
    from botocore.config import Config

    _s3_client_cache = boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL or None,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME or "auto",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": settings.AWS_S3_ADDRESSING_STYLE or "virtual"},
        ),
    )
    return _s3_client_cache


# ---------------------------------------------------------------------------
# Cloudinary helpers
# ---------------------------------------------------------------------------

def _cloudinary_public_id_and_rtype(key: str) -> tuple[str, str]:
    """Decide how to address a private asset in Cloudinary.

    Image extensions become `resource_type=image` so we keep image
    transformations available (e.g. on-the-fly thumbnails of pet
    customisation photos); everything else uploads as `raw` so PDFs
    and docs come back byte-for-byte on download.

    Returns (public_id, resource_type). The public_id is the storage
    key with the extension stripped for image assets (Cloudinary
    re-adds it from the resource_type on delivery) and the full key
    including extension for raw assets (which need the extension to
    serve correctly).
    """
    ext = os.path.splitext(key)[1].lower()
    if ext in _CLOUDINARY_IMAGE_EXTS:
        return os.path.splitext(key)[0], "image"
    return key, "raw"


def _cloudinary_basename(key: str) -> str:
    """Original filename — what we want the user's browser to save as."""
    return os.path.basename(key) or "file"


# ---------------------------------------------------------------------------
# Local fallback — writes under MEDIA_ROOT/private/. Not for prod.
# ---------------------------------------------------------------------------

def _local_root():
    return os.path.join(settings.MEDIA_ROOT, "private")


def _local_put(key: str, fileobj: BinaryIO) -> None:
    path = os.path.join(_local_root(), key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as out:
        for chunk in iter(lambda: fileobj.read(64 * 1024), b""):
            out.write(chunk)


def _local_delete(key: str) -> None:
    path = os.path.join(_local_root(), key)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _local_url(key: str) -> str:
    return f"{settings.MEDIA_URL}private/{key}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def put_object(key: str, fileobj: BinaryIO, content_type: str = "") -> str:
    """Upload `fileobj` to `key` on the active backend. Returns the
    key unchanged so the caller can persist it."""
    if not content_type:
        guessed, _ = mimetypes.guess_type(key)
        content_type = guessed or "application/octet-stream"

    backend = _backend()

    if backend == "s3":
        _s3_client().put_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=key,
            Body=fileobj,
            ContentType=content_type,
            # Private by default. Signed URLs are the only way out.
            ACL="private",
        )
        return key

    if backend == "cloudinary":
        import cloudinary.uploader

        public_id, resource_type = _cloudinary_public_id_and_rtype(key)
        try:
            cloudinary.uploader.upload(
                fileobj,
                public_id=public_id,
                resource_type=resource_type,
                # Authenticated delivery — files cannot be downloaded
                # without a signed URL even if someone guesses the
                # public_id. Cloudinary docs:
                # https://cloudinary.com/documentation/control_access_to_media
                type="authenticated",
                # Idempotent re-uploads: if the admin re-attaches a
                # receipt, replace cleanly rather than 409ing.
                overwrite=True,
                invalidate=True,
            )
        except Exception:
            logger.exception("Cloudinary upload failed for key %s", key)
            raise
        return key

    # Local
    _local_put(key, fileobj)
    return key


def signed_url(key: str, ttl_seconds: Optional[int] = None) -> str:
    """Return a short-lived signed GET URL. In local fallback mode the
    URL is just `/media/private/...` — fine for dev, never used in
    prod because at least one of the cloud env vars is always set."""
    if not key:
        return ""

    ttl = ttl_seconds if ttl_seconds is not None else getattr(
        settings, "AWS_S3_SIGNED_URL_TTL_SECONDS", 600,
    )
    backend = _backend()

    if backend == "s3":
        return _s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": key},
            ExpiresIn=ttl,
        )

    if backend == "cloudinary":
        import cloudinary.utils

        public_id, resource_type = _cloudinary_public_id_and_rtype(key)
        expires_at = int(time.time()) + ttl

        # `cloudinary_url` returns a (url, options) tuple; we only want
        # the URL. `flags="attachment:<filename>"` makes the browser
        # download the file with its original name instead of trying
        # to display it inline. Important for PDFs and receipt
        # downloads — without it Cloudinary serves with whatever
        # Content-Disposition default they pick.
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            type="authenticated",
            resource_type=resource_type,
            sign_url=True,
            secure=True,
            expires_at=expires_at,
            attachment=_cloudinary_basename(key),
        )
        return url

    # Local
    return _local_url(key)


def delete_object(key: str) -> None:
    if not key:
        return
    backend = _backend()

    try:
        if backend == "s3":
            _s3_client().delete_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=key,
            )
            return

        if backend == "cloudinary":
            import cloudinary.uploader

            public_id, resource_type = _cloudinary_public_id_and_rtype(key)
            cloudinary.uploader.destroy(
                public_id,
                resource_type=resource_type,
                type="authenticated",
                invalidate=True,
            )
            return

        _local_delete(key)
    except Exception:
        # Object lifecycle isn't critical for receipts; log and move on
        # so a stale Cloudinary file doesn't block the admin flow.
        logger.exception("Failed to delete object %s", key)


# ---------------------------------------------------------------------------
# Key-builders — kept here so every caller uses the same naming scheme.
# ---------------------------------------------------------------------------

def _safe_filename(name: str) -> str:
    # Strip directory components, keep only the basename.
    base = os.path.basename(name or "file")
    # Replace anything weird with underscores so we never produce keys
    # that break S3 / R2 parsers, signed URLs, or Cloudinary public IDs.
    return _FILENAME_SAFE_RE.sub("_", base)[:120] or "file"


def build_receipt_key(expense_id, filename: str) -> str:
    """Returns a stable, human-readable key like:
        receipts/2026/04/<expense-id>/<sanitised-original-name>
    Filing by year+month makes accountant exports easier than a flat
    bucket of UUIDs."""
    from django.utils import timezone

    now = timezone.now()
    safe_name = _safe_filename(filename)
    return f"{_RECEIPTS_PREFIX}/{now.year:04d}/{now.month:02d}/{expense_id}/{safe_name}"


def build_random_key(prefix: str, filename: str) -> str:
    """For non-receipt private uploads (e.g. customer customisation
    images). Uses a random uuid so two customers uploading the same
    filename don't collide."""
    safe_name = _safe_filename(filename)
    return f"{prefix.strip('/')}/{uuid.uuid4()}/{safe_name}"
