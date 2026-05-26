from django.contrib.auth import password_validation
from rest_framework import serializers

from apps.accounts.models import User, Address


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    gdpr_consent = serializers.BooleanField()

    def validate_email(self, value):
        email = value.lower().strip()
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("auth.email_taken")
        return email

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_gdpr_consent(self, value):
        if not value:
            raise serializers.ValidationError("auth.gdpr_required")
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class ProfileSerializer(serializers.ModelSerializer):
    mfa = serializers.SerializerMethodField()
    mfa_required = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_email_verified",
            "is_staff",
            "role",
            "permissions",
            "created_at",
            "mfa",
            "mfa_required",
        ]
        read_only_fields = [
            "id",
            "email",
            "is_email_verified",
            "is_staff",
            "role",
            "permissions",
            "created_at",
            "mfa",
            "mfa_required",
        ]

    def get_permissions(self, obj):
        # Empty list for customer users — saves the frontend a None
        # check on every permission lookup. Sorted for stable shape.
        return sorted(obj.admin_permissions)

    def _get_mfa_record(self, obj):
        try:
            return obj.mfa
        except Exception:
            return None

    def get_mfa(self, obj):
        # Returns {enabled, enabled_at} so the frontend can render the
        # "2FA is ON since …" status line. enabled_at is null when the
        # user has started setup but not yet verified the first code.
        mfa = self._get_mfa_record(obj)
        if mfa is None:
            return {"enabled": False, "enabled_at": None}
        return {
            "enabled": mfa.is_enabled,
            "enabled_at": mfa.enabled_at.isoformat() if mfa.enabled_at else None,
        }

    def get_mfa_required(self, obj):
        # Staff users *must* have 2FA on. Frontend uses this flag to
        # hard-redirect to the setup wizard from the admin layout.
        # Backend also enforces this via IsStaffWithMfa on admin views,
        # so this is purely UX — the gate isn't trusting the client.
        if not obj.is_staff:
            return False
        mfa = self._get_mfa_record(obj)
        return mfa is None or not mfa.is_enabled


class ProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class MfaCodeSerializer(serializers.Serializer):
    """Six-digit TOTP code from an authenticator app."""

    code = serializers.RegexField(regex=r"^\d{6}$")


class MfaDisableSerializer(serializers.Serializer):
    """
    Disabling 2FA is a privileged action — require both the current
    password (proves the session isn't just a stolen cookie) and a live
    code or backup code (proves possession of the second factor).
    """

    password = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=16)


class MfaLoginSerializer(serializers.Serializer):
    """
    Step-2 login submission. `code` accepts either a 6-digit TOTP code
    or a backup code (longer alphanumeric). The view decides which path
    to try.
    """

    challenge_token = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=16)


class MfaRegenBackupSerializer(serializers.Serializer):
    """Regenerating backup codes re-prompts both factors, same as disable."""

    password = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=16)


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id",
            "label",
            "full_name",
            "address_line_1",
            "address_line_2",
            "city",
            "county",
            "postcode",
            "country",
            "phone",
            "is_default",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AddressCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "label",
            "full_name",
            "address_line_1",
            "address_line_2",
            "city",
            "county",
            "postcode",
            "country",
            "phone",
            "is_default",
        ]
