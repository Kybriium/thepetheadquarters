"""
Unit tests for apps.core.storage.

Three backends to exercise:
  1. Local fallback (real on-disk writes — fast, no mocks needed)
  2. S3 (boto3 client mocked — verifies dispatch + key plumbing)
  3. Cloudinary (cloudinary SDK mocked — verifies dispatch + signed
     URL generation + resource-type inference)

We don't hit real Stripe / Cloudinary / S3 endpoints. The goal here is
to catch regressions where the backend dispatch silently routes the
wrong way, or where signed-URL TTLs / resource types drift.
"""

from __future__ import annotations

import io
import os
import shutil
import tempfile
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings

from apps.core import storage


def _file(data: bytes = b"hello") -> io.BytesIO:
    return io.BytesIO(data)


# ---------------------------------------------------------------------------
# Backend selector
# ---------------------------------------------------------------------------

class BackendSelectorTests(SimpleTestCase):
    """Make sure _backend() picks the right path for each env shape."""

    @override_settings(
        AWS_STORAGE_BUCKET_NAME="tph-private",
        AWS_ACCESS_KEY_ID="key",
        CLOUDINARY_URL="cloudinary://x:y@z",
    )
    def test_s3_wins_over_cloudinary_when_both_configured(self):
        # A deployment that explicitly set up an S3 bucket has done so
        # deliberately — don't silently downgrade to Cloudinary.
        self.assertEqual(storage._backend(), "s3")

    @override_settings(
        AWS_STORAGE_BUCKET_NAME="",
        AWS_ACCESS_KEY_ID="",
        CLOUDINARY_URL="cloudinary://x:y@z",
    )
    def test_cloudinary_when_only_cloudinary_set(self):
        self.assertEqual(storage._backend(), "cloudinary")

    @override_settings(
        AWS_STORAGE_BUCKET_NAME="",
        AWS_ACCESS_KEY_ID="",
        CLOUDINARY_URL="",
    )
    def test_local_when_nothing_set(self):
        self.assertEqual(storage._backend(), "local")

    @override_settings(
        AWS_STORAGE_BUCKET_NAME="bucket",
        AWS_ACCESS_KEY_ID="",  # missing key — incomplete config
        CLOUDINARY_URL="",
    )
    def test_local_when_aws_config_incomplete(self):
        # Half-configured S3 doesn't count — we shouldn't try to use a
        # bucket if the access key is missing.
        self.assertEqual(storage._backend(), "local")


# ---------------------------------------------------------------------------
# Cloudinary resource-type detection
# ---------------------------------------------------------------------------

class CloudinaryResourceTypeTests(SimpleTestCase):
    def test_image_extensions_use_image_resource_type(self):
        for ext in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
            pid, rtype = storage._cloudinary_public_id_and_rtype(f"receipts/a/b{ext}")
            self.assertEqual(rtype, "image", f"{ext} should be image")
            # Image public_ids drop the extension — Cloudinary re-adds
            # it from resource_type on delivery.
            self.assertEqual(pid, "receipts/a/b")

    def test_non_image_extensions_use_raw_resource_type(self):
        for ext in (".pdf", ".csv", ".zip", ".docx", ""):
            pid, rtype = storage._cloudinary_public_id_and_rtype(f"receipts/a/b{ext}")
            self.assertEqual(rtype, "raw", f"{ext} should be raw")
            # Raw keeps the full key including extension.
            self.assertEqual(pid, f"receipts/a/b{ext}")


# ---------------------------------------------------------------------------
# Cloudinary backend — mock the SDK
# ---------------------------------------------------------------------------

@override_settings(
    AWS_STORAGE_BUCKET_NAME="",
    AWS_ACCESS_KEY_ID="",
    CLOUDINARY_URL="cloudinary://k:s@c",
)
class CloudinaryBackendTests(SimpleTestCase):
    def test_put_object_uploads_pdf_as_raw_authenticated(self):
        with patch("cloudinary.uploader.upload") as mock_upload:
            mock_upload.return_value = {"public_id": "x", "type": "authenticated"}
            key = "receipts/2026/05/abc/invoice.pdf"
            returned = storage.put_object(key, _file(b"%PDF-1.4..."), "application/pdf")

        # Returns the same key unchanged so the caller can persist it
        self.assertEqual(returned, key)

        # Inspect what we sent to Cloudinary
        args, kwargs = mock_upload.call_args
        self.assertEqual(kwargs["public_id"], key)  # raw keeps extension
        self.assertEqual(kwargs["resource_type"], "raw")
        self.assertEqual(kwargs["type"], "authenticated")
        self.assertTrue(kwargs["overwrite"])
        self.assertTrue(kwargs["invalidate"])

    def test_put_object_uploads_png_as_image_authenticated(self):
        with patch("cloudinary.uploader.upload") as mock_upload:
            mock_upload.return_value = {"public_id": "x"}
            storage.put_object(
                "receipts/2026/05/abc/photo.png", _file(b"\x89PNG..."), "image/png",
            )
        _args, kwargs = mock_upload.call_args
        # Image public_ids drop the extension
        self.assertEqual(kwargs["public_id"], "receipts/2026/05/abc/photo")
        self.assertEqual(kwargs["resource_type"], "image")

    def test_signed_url_for_pdf_uses_raw_and_attachment_flag(self):
        with patch("cloudinary.utils.cloudinary_url") as mock_cu:
            mock_cu.return_value = ("https://res.cloudinary.com/signed-pdf", {})
            url = storage.signed_url("receipts/2026/05/abc/invoice.pdf", ttl_seconds=120)

        self.assertEqual(url, "https://res.cloudinary.com/signed-pdf")
        args, kwargs = mock_cu.call_args
        # First positional arg is the public_id
        self.assertEqual(args[0], "receipts/2026/05/abc/invoice.pdf")
        self.assertEqual(kwargs["type"], "authenticated")
        self.assertEqual(kwargs["resource_type"], "raw")
        self.assertTrue(kwargs["sign_url"])
        self.assertTrue(kwargs["secure"])
        # `attachment` should be set to the original filename so the
        # admin's browser saves the file with a sensible name rather
        # than a Cloudinary-generated public_id.
        self.assertEqual(kwargs["attachment"], "invoice.pdf")
        # Expiry must be in the future and reflect our ttl
        self.assertGreater(kwargs["expires_at"], 0)

    def test_signed_url_for_png_uses_image_resource_type(self):
        with patch("cloudinary.utils.cloudinary_url") as mock_cu:
            mock_cu.return_value = ("https://res.cloudinary.com/signed-png", {})
            storage.signed_url("receipts/a/b/cat.png")
        _args, kwargs = mock_cu.call_args
        self.assertEqual(kwargs["resource_type"], "image")

    def test_signed_url_returns_empty_for_empty_key(self):
        with patch("cloudinary.utils.cloudinary_url") as mock_cu:
            self.assertEqual(storage.signed_url(""), "")
            mock_cu.assert_not_called()

    def test_delete_object_destroys_with_matching_resource_type(self):
        with patch("cloudinary.uploader.destroy") as mock_destroy:
            mock_destroy.return_value = {"result": "ok"}
            storage.delete_object("receipts/a/b/invoice.pdf")

        args, kwargs = mock_destroy.call_args
        self.assertEqual(args[0], "receipts/a/b/invoice.pdf")
        self.assertEqual(kwargs["resource_type"], "raw")
        self.assertEqual(kwargs["type"], "authenticated")
        self.assertTrue(kwargs["invalidate"])

    def test_delete_object_swallows_errors_so_admin_flow_continues(self):
        with patch("cloudinary.uploader.destroy", side_effect=RuntimeError("boom")):
            # Should NOT raise — receipts are non-critical to delete.
            storage.delete_object("receipts/a/b/x.pdf")


# ---------------------------------------------------------------------------
# S3 backend — mock the boto client
# ---------------------------------------------------------------------------

@override_settings(
    AWS_STORAGE_BUCKET_NAME="tph-private",
    AWS_ACCESS_KEY_ID="key",
    AWS_SECRET_ACCESS_KEY="secret",
    AWS_S3_ENDPOINT_URL="https://r2.example.com",
    AWS_S3_REGION_NAME="auto",
    AWS_S3_ADDRESSING_STYLE="virtual",
    AWS_S3_SIGNED_URL_TTL_SECONDS=600,
    CLOUDINARY_URL="",
)
class S3BackendTests(SimpleTestCase):
    def setUp(self):
        # Reset the module-level cache between tests so each test gets
        # a fresh mock client.
        storage._s3_client_cache = None

    def test_put_object_calls_boto_with_private_acl(self):
        fake_client = MagicMock()
        with patch.object(storage, "_s3_client", return_value=fake_client):
            storage.put_object("receipts/x/y.pdf", _file(b"data"), "application/pdf")

        fake_client.put_object.assert_called_once()
        kwargs = fake_client.put_object.call_args.kwargs
        self.assertEqual(kwargs["Bucket"], "tph-private")
        self.assertEqual(kwargs["Key"], "receipts/x/y.pdf")
        self.assertEqual(kwargs["ACL"], "private")
        self.assertEqual(kwargs["ContentType"], "application/pdf")

    def test_signed_url_uses_presigned_url(self):
        fake_client = MagicMock()
        fake_client.generate_presigned_url.return_value = "https://r2/signed"
        with patch.object(storage, "_s3_client", return_value=fake_client):
            url = storage.signed_url("receipts/x/y.pdf", ttl_seconds=300)
        self.assertEqual(url, "https://r2/signed")
        kwargs = fake_client.generate_presigned_url.call_args.kwargs
        self.assertEqual(kwargs["ExpiresIn"], 300)


# ---------------------------------------------------------------------------
# Local fallback — real on-disk writes into a temp dir
# ---------------------------------------------------------------------------

class LocalFallbackTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="tph-test-media-")
        self._media_override = override_settings(
            MEDIA_ROOT=self.tmp,
            MEDIA_URL="/media/",
            AWS_STORAGE_BUCKET_NAME="",
            AWS_ACCESS_KEY_ID="",
            CLOUDINARY_URL="",
        )
        self._media_override.enable()

    def tearDown(self):
        self._media_override.disable()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_put_object_writes_to_disk_and_signed_url_is_relative(self):
        key = "receipts/x/y.pdf"
        returned = storage.put_object(key, _file(b"PDF DATA"), "application/pdf")
        self.assertEqual(returned, key)

        on_disk = os.path.join(self.tmp, "private", key)
        self.assertTrue(os.path.exists(on_disk))
        with open(on_disk, "rb") as f:
            self.assertEqual(f.read(), b"PDF DATA")

        # Local URL is relative — fine in dev, the
        # AdminExpenseReceiptFileView serves the file via Django
        # directly when no cloud backend is configured.
        self.assertEqual(storage.signed_url(key), "/media/private/receipts/x/y.pdf")

    def test_delete_object_removes_the_file(self):
        key = "receipts/x/z.pdf"
        storage.put_object(key, _file(b"x"), "application/pdf")
        on_disk = os.path.join(self.tmp, "private", key)
        self.assertTrue(os.path.exists(on_disk))

        storage.delete_object(key)
        self.assertFalse(os.path.exists(on_disk))

    def test_delete_object_swallows_missing_file_errors(self):
        # No FileNotFoundError when key was never written
        storage.delete_object("receipts/never/existed.pdf")


# ---------------------------------------------------------------------------
# Key builders — shape regression
# ---------------------------------------------------------------------------

class KeyBuilderTests(SimpleTestCase):
    def test_build_receipt_key_has_year_month_structure(self):
        key = storage.build_receipt_key("abc-123", "Tëmu Invoice (1).pdf")
        # year/month/expense_id/safe_name
        parts = key.split("/")
        self.assertEqual(parts[0], "receipts")
        self.assertEqual(len(parts[1]), 4)  # year
        self.assertEqual(len(parts[2]), 2)  # month
        self.assertEqual(parts[3], "abc-123")
        # Filename sanitised — no weird characters break signed URLs
        self.assertNotIn("ë", parts[4])
        self.assertNotIn(" ", parts[4])

    def test_build_random_key_uses_uuid_segment(self):
        key = storage.build_random_key("custom-uploads", "pet.png")
        parts = key.split("/")
        self.assertEqual(parts[0], "custom-uploads")
        # uuid4 hex with dashes is 36 chars
        self.assertEqual(len(parts[1]), 36)
        self.assertEqual(parts[2], "pet.png")
