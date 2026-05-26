"""
Unit tests for the TOTP-based 2FA flow.

Covers the full lifecycle from a fresh setup through admin gating:
  - Helper layer (pyotp wrap, replay defence, backup codes, challenge tokens)
  - Setup → verify → enabled state transition
  - Login flow split (password → challenge → code → cookies)
  - Backup-code single-use semantics
  - Disable / regen flows
  - Admin endpoint hard-block when staff lacks 2FA

We compute live TOTP codes from the secret returned by /setup/ so tests
exercise the real verification path — no mocking of pyotp itself.
"""

from __future__ import annotations

import time

import pyotp
from django.conf import settings as live_settings
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts import mfa as mfa_helpers
from apps.accounts.models import MfaBackupCode, User, UserMfa


# Suppress throttling for tests — we're not testing rate limits here and
# leaving them on means tests fail intermittently when re-run quickly.
# Merge with the live REST_FRAMEWORK dict so EXCEPTION_HANDLER, auth
# classes etc. aren't wiped (override_settings replaces, not merges).
THROTTLE_OVERRIDE = override_settings(
    REST_FRAMEWORK={
        **live_settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    }
)


def _code_for(secret: str) -> str:
    return pyotp.TOTP(secret).now()


@THROTTLE_OVERRIDE
class MfaHelperTests(TestCase):
    """Pure-Python helpers, no DB."""

    def test_secret_is_base32_and_32_chars(self):
        secret = mfa_helpers.generate_secret()
        self.assertEqual(len(secret), 32)
        # Base32 alphabet check — pyotp.random_base32 conforms to RFC 4648.
        self.assertTrue(all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in secret))

    def test_provisioning_uri_includes_issuer_and_email(self):
        uri = mfa_helpers.provisioning_uri("JBSWY3DPEHPK3PXP", "user@example.com")
        # Email's `@` is URL-encoded as %40 inside the otpauth:// URI.
        self.assertIn("user%40example.com", uri)
        self.assertIn("issuer=The%20Pet%20Headquarters", uri)
        self.assertIn("secret=JBSWY3DPEHPK3PXP", uri)

    def test_verify_totp_accepts_live_code_and_returns_step(self):
        secret = mfa_helpers.generate_secret()
        code = _code_for(secret)
        step = mfa_helpers.verify_totp(secret, code)
        self.assertIsNotNone(step)
        self.assertGreater(step, 0)

    def test_verify_totp_rejects_wrong_code(self):
        secret = mfa_helpers.generate_secret()
        self.assertIsNone(mfa_helpers.verify_totp(secret, "000000"))

    def test_verify_totp_rejects_replay_via_counter(self):
        secret = mfa_helpers.generate_secret()
        code = _code_for(secret)
        step = mfa_helpers.verify_totp(secret, code)
        # Second submit of the same code with the counter already advanced
        # past that step must fail — that's the replay defence.
        self.assertIsNone(
            mfa_helpers.verify_totp(secret, code, last_used_counter=step)
        )

    def test_verify_totp_rejects_non_digit_input(self):
        secret = mfa_helpers.generate_secret()
        self.assertIsNone(mfa_helpers.verify_totp(secret, "abcdef"))
        self.assertIsNone(mfa_helpers.verify_totp(secret, "12345"))   # too short
        self.assertIsNone(mfa_helpers.verify_totp(secret, "1234567")) # too long

    def test_backup_codes_unique_and_correct_shape(self):
        codes = mfa_helpers.generate_backup_codes()
        self.assertEqual(len(codes), 10)
        self.assertEqual(len(set(codes)), 10)  # All unique
        for c in codes:
            self.assertEqual(len(c), 8)
            # Alphabet has no 0/O/1/I/L
            self.assertNotIn("0", c)
            self.assertNotIn("O", c)
            self.assertNotIn("1", c)
            self.assertNotIn("I", c)
            self.assertNotIn("L", c)

    def test_backup_code_hashing_roundtrip(self):
        plaintext = "ABCDEFGH"
        hashed = mfa_helpers.hash_backup_code(plaintext)
        self.assertNotEqual(hashed, plaintext)
        self.assertTrue(mfa_helpers.check_backup_code(plaintext, hashed))
        # Case-insensitive — wizard prints uppercase but users may type lowercase.
        self.assertTrue(mfa_helpers.check_backup_code("abcdefgh", hashed))
        self.assertFalse(mfa_helpers.check_backup_code("WRONGCOD", hashed))

    def test_challenge_token_roundtrip(self):
        token = mfa_helpers.sign_challenge_token("abc-123")
        self.assertEqual(mfa_helpers.verify_challenge_token(token), "abc-123")

    def test_challenge_token_rejects_tampered(self):
        token = mfa_helpers.sign_challenge_token("abc-123")
        with self.assertRaises(mfa_helpers.ChallengeTokenError) as ctx:
            mfa_helpers.verify_challenge_token(token + "x")
        self.assertEqual(ctx.exception.code, "challenge_invalid")

    def test_challenge_token_rejects_empty(self):
        with self.assertRaises(mfa_helpers.ChallengeTokenError) as ctx:
            mfa_helpers.verify_challenge_token("")
        self.assertEqual(ctx.exception.code, "challenge_missing")


def _make_user(email="user@test.local", password="Testpass1!", is_staff=False):
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Test",
        last_name="User",
        is_email_verified=True,
        is_staff=is_staff,
    )


@THROTTLE_OVERRIDE
class MfaSetupFlowTests(TestCase):
    """End-to-end: enable 2FA from zero."""

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user()
        self.client.force_authenticate(user=self.user)

    def test_setup_returns_secret_and_provisioning_uri(self):
        res = self.client.post("/api/v1/auth/2fa/setup/")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertIn("secret", data)
        self.assertIn("provisioning_uri", data)
        self.assertEqual(len(data["secret"]), 32)
        # Email's @ becomes %40 in the URL
        self.assertIn(self.user.email.replace("@", "%40"), data["provisioning_uri"])

    def test_setup_creates_user_mfa_row_disabled(self):
        self.client.post("/api/v1/auth/2fa/setup/")
        mfa = UserMfa.objects.get(user=self.user)
        self.assertIsNone(mfa.enabled_at)
        self.assertFalse(mfa.is_enabled)

    def test_setup_rotates_secret_on_repeat_call(self):
        first = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]["secret"]
        second = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]["secret"]
        self.assertNotEqual(first, second)

    def test_verify_with_valid_code_enables_and_returns_backup_codes(self):
        setup = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]
        code = _code_for(setup["secret"])
        res = self.client.post(
            "/api/v1/auth/2fa/setup/verify/",
            {"code": code},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(len(data["backup_codes"]), 10)
        self.assertIsNotNone(data["enabled_at"])

        self.user.refresh_from_db()
        self.user.mfa.refresh_from_db()
        self.assertTrue(self.user.mfa.is_enabled)
        self.assertEqual(self.user.mfa.backup_codes.count(), 10)

    def test_verify_with_wrong_code_does_not_enable(self):
        self.client.post("/api/v1/auth/2fa/setup/")
        res = self.client.post(
            "/api/v1/auth/2fa/setup/verify/",
            {"code": "000000"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(UserMfa.objects.get(user=self.user).is_enabled)

    def test_setup_rejected_if_already_enabled(self):
        # First enroll
        setup = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]
        self.client.post(
            "/api/v1/auth/2fa/setup/verify/",
            {"code": _code_for(setup["secret"])},
            format="json",
        )
        # Second /setup/ call must fail
        res = self.client.post("/api/v1/auth/2fa/setup/")
        self.assertEqual(res.status_code, 409)


@THROTTLE_OVERRIDE
class MfaLoginFlowTests(TestCase):
    """Login splits into two steps when MFA is on."""

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user()
        # Enable MFA on the test user
        self.client.force_authenticate(user=self.user)
        setup = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]
        self.secret = setup["secret"]
        verify = self.client.post(
            "/api/v1/auth/2fa/setup/verify/",
            {"code": _code_for(self.secret)},
            format="json",
        ).json()["data"]
        self.backup_codes = verify["backup_codes"]
        self.client.force_authenticate(user=None)
        self.client.cookies.clear()

    def test_login_returns_challenge_when_mfa_on(self):
        res = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "Testpass1!"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertTrue(data["requires_2fa"])
        self.assertIn("challenge_token", data)
        # Crucially: no auth cookies set
        self.assertNotIn("tph_access", res.cookies)
        self.assertNotIn("tph_refresh", res.cookies)

    def test_mfa_login_with_valid_totp_sets_cookies(self):
        challenge = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "Testpass1!"},
            format="json",
        ).json()["data"]["challenge_token"]

        # Sleep briefly so the step counter has moved past the one used
        # at setup time — otherwise replay defence rejects the same code.
        time.sleep(1)
        res = self.client.post(
            "/api/v1/auth/2fa/login/",
            {"challenge_token": challenge, "code": _code_for(self.secret)},
            format="json",
        )
        # Allow either 200 (advanced step) or 401 (same step) — retry with
        # a fresh code if the first hit landed on the already-used step.
        if res.status_code == 401:
            time.sleep(30 - (int(time.time()) % 30) + 1)
            res = self.client.post(
                "/api/v1/auth/2fa/login/",
                {"challenge_token": challenge, "code": _code_for(self.secret)},
                format="json",
            )
        self.assertEqual(res.status_code, 200)
        self.assertIn("tph_access", res.cookies)
        self.assertIn("tph_refresh", res.cookies)

    def test_mfa_login_with_wrong_code_fails(self):
        challenge = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "Testpass1!"},
            format="json",
        ).json()["data"]["challenge_token"]
        res = self.client.post(
            "/api/v1/auth/2fa/login/",
            {"challenge_token": challenge, "code": "000000"},
            format="json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertNotIn("tph_access", res.cookies)

    def test_mfa_login_with_backup_code_consumes_it(self):
        challenge = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "Testpass1!"},
            format="json",
        ).json()["data"]["challenge_token"]
        code = self.backup_codes[0]
        res = self.client.post(
            "/api/v1/auth/2fa/login/",
            {"challenge_token": challenge, "code": code},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        # That code must now be marked used and unusable a second time
        used = MfaBackupCode.objects.filter(
            mfa__user=self.user, used_at__isnull=False,
        )
        self.assertEqual(used.count(), 1)

        # Get fresh challenge token and try the same backup code again
        challenge2 = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "Testpass1!"},
            format="json",
        ).json()["data"]["challenge_token"]
        res2 = self.client.post(
            "/api/v1/auth/2fa/login/",
            {"challenge_token": challenge2, "code": code},
            format="json",
        )
        self.assertEqual(res2.status_code, 401)

    def test_mfa_login_with_tampered_challenge_token_fails(self):
        res = self.client.post(
            "/api/v1/auth/2fa/login/",
            {"challenge_token": "tampered.token.value", "code": "123456"},
            format="json",
        )
        self.assertEqual(res.status_code, 401)


@THROTTLE_OVERRIDE
class MfaDisableTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_user()
        self.client.force_authenticate(user=self.user)
        setup = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]
        self.secret = setup["secret"]
        self.client.post(
            "/api/v1/auth/2fa/setup/verify/",
            {"code": _code_for(self.secret)},
            format="json",
        )
        time.sleep(1)

    def test_disable_requires_password_and_code(self):
        # Missing code — serializer rejects with 422 (validation error)
        res = self.client.post(
            "/api/v1/auth/2fa/disable/",
            {"password": "Testpass1!"},
            format="json",
        )
        self.assertEqual(res.status_code, 422)

        # Wrong password
        res = self.client.post(
            "/api/v1/auth/2fa/disable/",
            {"password": "wrong", "code": _code_for(self.secret)},
            format="json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertTrue(UserMfa.objects.filter(user=self.user).exists())

    def test_disable_with_valid_factors_removes_enrollment(self):
        res = self.client.post(
            "/api/v1/auth/2fa/disable/",
            {"password": "Testpass1!", "code": _code_for(self.secret)},
            format="json",
        )
        if res.status_code == 401:
            time.sleep(30 - (int(time.time()) % 30) + 1)
            res = self.client.post(
                "/api/v1/auth/2fa/disable/",
                {"password": "Testpass1!", "code": _code_for(self.secret)},
                format="json",
            )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(UserMfa.objects.filter(user=self.user).exists())


@THROTTLE_OVERRIDE
class AdminMfaGateTests(TestCase):
    """is_staff alone is no longer enough — must also have MFA on."""

    def setUp(self):
        self.client = APIClient()
        self.staff = _make_user(email="admin@test.local", is_staff=True)

    def test_staff_without_mfa_is_blocked(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get("/api/v1/admin/products/")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "auth.mfa_required")

    def test_staff_with_mfa_passes(self):
        # Enroll the staff user
        self.client.force_authenticate(user=self.staff)
        setup = self.client.post("/api/v1/auth/2fa/setup/").json()["data"]
        self.client.post(
            "/api/v1/auth/2fa/setup/verify/",
            {"code": _code_for(setup["secret"])},
            format="json",
        )
        res = self.client.get("/api/v1/admin/products/")
        # 200 or 404 both acceptable — what matters is *not* 403
        self.assertNotEqual(res.status_code, 403)

    def test_profile_surfaces_mfa_required_for_unenrolled_staff(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertTrue(data["mfa_required"])
        self.assertFalse(data["mfa"]["enabled"])

    def test_profile_surfaces_mfa_not_required_for_customer(self):
        customer = _make_user(email="cust@test.local", is_staff=False)
        self.client.force_authenticate(user=customer)
        res = self.client.get("/api/v1/auth/me/")
        data = res.json()["data"]
        self.assertFalse(data["mfa_required"])
        self.assertFalse(data["mfa"]["enabled"])
