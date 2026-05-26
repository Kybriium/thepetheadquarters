import uuid
import secrets

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone

from apps.accounts.rbac import (
    ROLE_AUDITOR,
    ROLE_OWNER,
    permissions_for_role,
)
from apps.core.models import BaseModel


class UserManager(BaseUserManager):
    """Custom manager using email as the unique identifier."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email address is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_email_verified", True)
        # createsuperuser shouldn't strand the operator with no admin
        # power — promote to OWNER unless something else was passed in.
        extra_fields.setdefault("role", ROLE_OWNER)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Custom user model with email as the primary identifier."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)

    is_email_verified = models.BooleanField(default=False)

    # Admin RBAC. Only meaningful when is_staff=True — customers ignore
    # this. Stores the `code` of a Role record. No `choices=` on the
    # field because Owners can define custom roles at runtime, so the
    # set of valid values isn't known at deploy time. Validation that
    # the role exists happens at the permission gate (unknown role →
    # empty permission set → 403).
    #
    # Defaults to AUDITOR so accidentally promoting someone to staff
    # (is_staff=True) without explicitly setting a role grants the
    # safest possible access (read-only) rather than full control.
    role = models.CharField(
        max_length=64,
        default=ROLE_AUDITOR,
        blank=True,
    )

    gdpr_consent = models.BooleanField(default=False)
    gdpr_consent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    @property
    def admin_permissions(self) -> set[str]:
        """
        Set of permission codes this user holds via their role. Empty
        set for non-staff users — even if they somehow have a role
        assigned, they can't reach admin endpoints without is_staff=True
        (which IsStaffWithMfa checks first).
        """
        if not self.is_staff:
            return set()
        return permissions_for_role(self.role)

    def has_admin_perm(self, code: str) -> bool:
        """True if this user can perform the given permission code."""
        return code in self.admin_permissions

    @property
    def is_owner(self) -> bool:
        """Convenience for endpoint code that needs Owner-only logic."""
        return self.is_staff and self.role == ROLE_OWNER


class Role(BaseModel):
    """
    A bundle of permission codes assignable to a staff user.

    Two flavours:
      - `is_system=True`: shipped with the app and seeded by migration.
        The 5 presets (OWNER, ORDER_MANAGER, INVENTORY_MANAGER, MARKETING,
        AUDITOR) live here. UI shows them as templates — you can clone
        one to start a custom role, but the originals can't be edited
        or deleted.
      - `is_system=False`: created by an Owner via /admin/roles/. Fully
        editable. Deletable only when no user currently holds it.

    `code` is the slug stored on User.role (e.g. "OWNER",
    "custom_dispatch_lead"). System roles use the rbac.py constants;
    custom roles get a slug derived from their name at creation.

    `permissions` is a JSON list of codes from the PERMISSIONS
    catalogue. The Role table never invents new permission strings —
    only existing catalogue codes are valid. Owner is the special
    case: even though the seed migration copies all current codes into
    its `permissions`, the lookup function always returns the live
    PERMISSIONS set so a newly added permission auto-grants to Owner
    without a migration.
    """

    code = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=list)
    is_system = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["-is_system", "name"]

    def __str__(self):
        return self.name


class EmailVerificationToken(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="verification_tokens",
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def generate(user):
        token = secrets.token_urlsafe(48)
        expiry_hours = getattr(settings, "EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS", 24)
        return EmailVerificationToken.objects.create(
            user=user,
            token=token,
            expires_at=timezone.now() + timezone.timedelta(hours=expiry_hours),
        )

    @property
    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()


class PasswordResetToken(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def generate(user):
        token = secrets.token_urlsafe(48)
        expiry_hours = getattr(settings, "PASSWORD_RESET_TOKEN_EXPIRY_HOURS", 1)
        return PasswordResetToken.objects.create(
            user=user,
            token=token,
            expires_at=timezone.now() + timezone.timedelta(hours=expiry_hours),
        )

    @property
    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()


class RefreshToken(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
    )
    jti = models.UUIDField(unique=True, default=uuid.uuid4, db_index=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_valid(self):
        return self.revoked_at is None and self.expires_at > timezone.now()

    def revoke(self):
        self.revoked_at = timezone.now()
        self.save(update_fields=["revoked_at"])


class UserMfa(BaseModel):
    """
    TOTP-based 2FA enrollment for a user.

    A row exists only after a successful setup (or in-progress setup —
    `enabled_at` is null until the first verifying code is submitted).
    `last_used_counter` is the TOTP step number of the most recent
    successful verification; subsequent verifications must use a strictly
    greater step to prevent replay of the same 6-digit code within its
    30-second window.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa",
    )
    secret = models.CharField(max_length=64)
    enabled_at = models.DateTimeField(null=True, blank=True)
    last_used_counter = models.BigIntegerField(default=0)

    @property
    def is_enabled(self):
        return self.enabled_at is not None


class MfaBackupCode(BaseModel):
    """
    Single-use recovery codes shown once at setup. The plaintext is hashed
    with Django's password hasher and discarded; we can verify but never
    re-display.
    """

    mfa = models.ForeignKey(
        UserMfa,
        on_delete=models.CASCADE,
        related_name="backup_codes",
    )
    code_hash = models.CharField(max_length=255)
    used_at = models.DateTimeField(null=True, blank=True)


class Address(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    label = models.CharField(max_length=50, blank=True)
    full_name = models.CharField(max_length=255)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    county = models.CharField(max_length=100, blank=True)
    postcode = models.CharField(max_length=10)
    country = models.CharField(max_length=2, default="GB")
    phone = models.CharField(max_length=20, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_default", "-created_at"]

    def __str__(self):
        return f"{self.full_name} — {self.postcode}"
