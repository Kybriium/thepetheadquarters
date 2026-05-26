"""
TOTP-based 2FA helpers.

Wraps pyotp with project-specific conventions:
  - Secret length: 20 bytes (160 bits) → 32-char base32, the RFC 4226
    recommendation. All major authenticators accept this.
  - Time window: ±1 step (30 s either side) for clock drift. Tighter than
    the pyotp default of ±0; looser is needed for users whose phone clock
    drifted (common on cheap Androids).
  - Replay protection: we record the step number of each successful use
    and refuse to accept any step ≤ that. Without this, an attacker who
    shoulder-surfs a 6-digit code has up to 30 s to use it themselves.

Backup codes are 10 alphanumeric strings (8 chars, base32 alphabet, no
ambiguous chars like 0/O/1/I). They're hashed with Django's password
hashers and verified the same way as passwords.

The "challenge token" is a short-lived signed envelope handed to the
client after a correct password but before the TOTP step. It carries the
user_id and a 5-minute max age — the client trades it + a code for the
real auth cookies via /api/v1/auth/2fa/login/.
"""

import secrets
from datetime import timedelta
from typing import Optional

import pyotp
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.utils import timezone

# 30-second TOTP step matches every consumer authenticator app.
TOTP_INTERVAL_SECONDS = 30

# ±1 step = up to 30 s of clock drift in either direction tolerated.
# Two consecutive steps = 60 s total acceptance window.
TOTP_VALID_WINDOW = 1

# Backup codes: 10 codes × 8 chars from a 32-char alphabet (5 bits/char)
# = 40 bits of entropy per code = ~1 in 1 trillion guess. Plenty given
# we also rate-limit the verify endpoint.
BACKUP_CODE_COUNT = 10
BACKUP_CODE_LENGTH = 8

# Base32 alphabet with ambiguous chars (0/O, 1/I/L) removed.
_BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

# Login-step challenge token: signed envelope, 5-minute TTL. Long enough
# for the user to fish out their phone, short enough that a stolen
# challenge token can't be reused tomorrow.
CHALLENGE_MAX_AGE = timedelta(minutes=5)
_CHALLENGE_SALT = "tph-mfa-challenge-v1"

# TOTP provisioning URI issuer string — what shows up in the user's
# authenticator app as the account label.
TOTP_ISSUER = "The Pet Headquarters"


def generate_secret() -> str:
    """Fresh base32-encoded TOTP secret. 32 chars, 160 bits."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, account_email: str) -> str:
    """
    otpauth:// URI suitable for QR encoding. Authenticator apps parse
    this to create the account entry — they read the issuer, label, and
    secret. We don't include any custom parameters; all defaults
    (SHA1, 6 digits, 30 s) match what every app expects.
    """
    return pyotp.TOTP(secret).provisioning_uri(
        name=account_email,
        issuer_name=TOTP_ISSUER,
    )


def verify_totp(secret: str, code: str, last_used_counter: int = 0) -> Optional[int]:
    """
    Verify a 6-digit TOTP code against a secret.

    Returns the step number on success (caller must persist as
    `last_used_counter` to prevent same-window replay), or None on
    failure. Rejects any code whose step is ≤ last_used_counter even if
    it would otherwise match — that's the replay protection.
    """
    if not code or not code.isdigit() or len(code) != 6:
        return None

    totp = pyotp.TOTP(secret, interval=TOTP_INTERVAL_SECONDS)
    now_step = int(timezone.now().timestamp()) // TOTP_INTERVAL_SECONDS

    # Try each step in the acceptance window. We can't use pyotp.verify
    # directly because it doesn't tell us *which* step matched, only
    # whether one did — and we need the step number for replay defence.
    # generate_otp() takes a step counter directly; .at() expects unix
    # seconds, which would silently produce wrong codes here.
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        step = now_step + offset
        if step <= last_used_counter:
            continue
        if totp.generate_otp(step) == code:
            return step

    return None


def generate_backup_codes() -> list[str]:
    """Return BACKUP_CODE_COUNT fresh plaintext codes."""
    return [
        "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(BACKUP_CODE_LENGTH))
        for _ in range(BACKUP_CODE_COUNT)
    ]


def hash_backup_code(plaintext: str) -> str:
    """Hash a backup code so the DB never holds the plaintext."""
    return make_password(plaintext.upper().strip())


def check_backup_code(plaintext: str, hashed: str) -> bool:
    """Constant-time comparison via Django's hasher."""
    return check_password(plaintext.upper().strip(), hashed)


def consume_code(mfa, code: str) -> bool:
    """
    Verify a TOTP or backup code against a user's MFA enrollment, and
    persist the consumption so the same code can't be reused.

      - 6-digit numeric → tries TOTP. On success, advances
        last_used_counter (replay defence).
      - Anything else → walks unused backup codes; on a match, stamps
        used_at on the matched code.

    Used by both /auth/2fa/login/ (step 2 of the regular login flow)
    and the step-up flows for sensitive admin actions (promote a
    customer to admin, change someone's role, etc). Reusing the same
    helper keeps the consume semantics identical everywhere.

    Returns True on success, False on any failure (including missing
    enrollment, disabled MFA, or no matching code).
    """
    from django.utils import timezone

    if mfa is None or not mfa.is_enabled:
        return False

    code = (code or "").strip()
    if not code:
        return False

    if len(code) == 6 and code.isdigit():
        step = verify_totp(mfa.secret, code, last_used_counter=mfa.last_used_counter)
        if step is not None:
            mfa.last_used_counter = step
            mfa.save(update_fields=["last_used_counter", "updated_at"])
            return True
        # 6-digit code that didn't match TOTP — don't fall through to
        # backup codes (those are longer). Caller reports failure.
        return False

    normalised = code.upper()
    for entry in mfa.backup_codes.filter(used_at__isnull=True):
        if check_backup_code(normalised, entry.code_hash):
            entry.used_at = timezone.now()
            entry.save(update_fields=["used_at", "updated_at"])
            return True
    return False


def verify_step_up(user, code: str) -> bool:
    """
    Step-up auth helper for sensitive admin actions.

    The acting user must already have MFA enrolled — staff accounts
    without 2FA can't perform step-up-gated actions at all, because
    they can't be reached past IsStaffWithMfa to begin with. We re-
    check that here defensively in case the helper is ever wired into
    a non-admin flow.
    """
    try:
        mfa = user.mfa
    except Exception:
        return False
    return consume_code(mfa, code)


def sign_challenge_token(user_id) -> str:
    """
    Issue a short-lived signed envelope after step-1 (password) auth.
    Client trades this + a TOTP/backup code for real auth cookies.
    """
    return signing.dumps(
        {"user_id": str(user_id)},
        salt=_CHALLENGE_SALT,
    )


class ChallengeTokenError(Exception):
    """Raised when a challenge token is missing, malformed, or expired."""

    def __init__(self, code):
        self.code = code
        super().__init__(code)


def verify_challenge_token(token: str):
    """
    Decode and validate a challenge token. Returns the user_id (str) on
    success. Raises ChallengeTokenError with a stable error code on
    failure so the API can surface a translatable error.
    """
    if not token:
        raise ChallengeTokenError("challenge_missing")
    try:
        data = signing.loads(
            token,
            salt=_CHALLENGE_SALT,
            max_age=int(CHALLENGE_MAX_AGE.total_seconds()),
        )
    except signing.SignatureExpired:
        raise ChallengeTokenError("challenge_expired")
    except signing.BadSignature:
        raise ChallengeTokenError("challenge_invalid")

    user_id = data.get("user_id")
    if not user_id:
        raise ChallengeTokenError("challenge_invalid")

    return user_id
