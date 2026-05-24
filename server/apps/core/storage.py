"""
Private object-storage helper for receipts, supplier invoices and any
other file we never want served from a public URL.

Backed by any S3-compatible service via boto3 — Railway Bucket,
Cloudflare R2, Backblaze B2, Storj, plain AWS S3. The interface stays
the same; callers don't know or care which provider is on the other
side. When no bucket is configured (e.g. local dev with no env vars),
files are written under MEDIA_ROOT/private/ and served via the normal
Django MEDIA_URL — convenient locally, never used in prod.

Public API:
  put_object(key, fileobj, content_type) -> str  # returns the key
  signed_url(key, ttl_seconds=None) -> str       # short-lived GET URL
  delete_object(key) -> None
  build_receipt_key(expense_id, filename) -> str # canonical naming
"""

from __future__ import annotations

import logging
import mimetypes
import os
import re
import uuid
from typing import BinaryIO, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

_RECEIPTS_PREFIX = "receipts"
_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


# ---------------------------------------------------------------------------
# Client (lazy — boto3 is imported only when we actually need it so the
# rest of the app doesn't pay the cost when no bucket is configured)
# ---------------------------------------------------------------------------

_client_cache = None


def _client():
    global _client_cache
    if _client_cache is not None:
        return _client_cache
    if not settings.PRIVATE_STORAGE_ENABLED:
        return None
    import boto3
    from botocore.config import Config

    _client_cache = boto3.client(
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
    return _client_cache


# ---------------------------------------------------------------------------
# Local fallback — writes to MEDIA_ROOT/private/ when no bucket is set.
# The signed-url path returns a normal /media/private/... URL which is
# fine for dev but should NEVER be the path in production.
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
    # Served by Django's static serving in DEBUG. In prod the user would
    # provision a real bucket so this code path is never hit.
    return f"{settings.MEDIA_URL}private/{key}"


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def put_object(key: str, fileobj: BinaryIO, content_type: str = "") -> str:
    """
    Upload `fileobj` (a readable binary file-like) to the given key.
    Returns the key so the caller can persist it.
    """
    if not content_type:
        content_type, _ = mimetypes.guess_type(key)
        content_type = content_type or "application/octet-stream"

    client = _client()
    if client is None:
        _local_put(key, fileobj)
        return key

    client.put_object(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        Key=key,
        Body=fileobj,
        ContentType=content_type,
        # Private by default. Signed URLs are the only legitimate way out.
        ACL="private",
    )
    return key


def signed_url(key: str, ttl_seconds: Optional[int] = None) -> str:
    """
    Return a short-lived signed GET URL for the object. In local-fallback
    mode the URL is a plain /media/ URL (not actually signed) — fine for
    dev, never used in prod because the env vars are always set there.
    """
    if not key:
        return ""

    client = _client()
    if client is None:
        return _local_url(key)

    ttl = ttl_seconds if ttl_seconds is not None else settings.AWS_S3_SIGNED_URL_TTL_SECONDS
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": key},
        ExpiresIn=ttl,
    )


def delete_object(key: str) -> None:
    if not key:
        return
    client = _client()
    if client is None:
        _local_delete(key)
        return
    try:
        client.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=key)
    except Exception:
        # Object lifecycle isn't critical for receipts; log and move on.
        logger.exception("Failed to delete object %s", key)


# ---------------------------------------------------------------------------
# Key-builders — kept here so every caller uses the same naming scheme,
# which keeps the bucket browsable for humans and easy to lifecycle.
# ---------------------------------------------------------------------------

def _safe_filename(name: str) -> str:
    # Strip any directory components, keep only the basename.
    base = os.path.basename(name or "file")
    # Replace anything weird with underscores so we never produce keys
    # that break S3 / R2 parsers or the signed URL signature.
    return _FILENAME_SAFE_RE.sub("_", base)[:120] or "file"


def build_receipt_key(expense_id, filename: str) -> str:
    """
    Returns a stable, human-readable key like:
        receipts/2026/04/<expense-id>/<sanitised-original-name>
    Filing by year+month makes accountant exports easier than a flat
    bucket of UUIDs.
    """
    from django.utils import timezone

    now = timezone.now()
    safe_name = _safe_filename(filename)
    return f"{_RECEIPTS_PREFIX}/{now.year:04d}/{now.month:02d}/{expense_id}/{safe_name}"


def build_random_key(prefix: str, filename: str) -> str:
    """
    For non-receipt private uploads (e.g. customer customisation images).
    Uses a random uuid so two customers uploading the same filename
    don't collide.
    """
    safe_name = _safe_filename(filename)
    return f"{prefix.strip('/')}/{uuid.uuid4()}/{safe_name}"
