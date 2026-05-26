from django.contrib.auth import authenticate
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)

from apps.accounts.mfa import (
    ChallengeTokenError,
    check_backup_code,
    generate_backup_codes,
    generate_secret,
    hash_backup_code,
    provisioning_uri,
    sign_challenge_token,
    verify_challenge_token,
    verify_totp,
)
from apps.accounts.models import (
    Address,
    EmailVerificationToken,
    MfaBackupCode,
    PasswordResetToken,
    RefreshToken,
    User,
    UserMfa,
)
from apps.accounts.serializers import (
    AddressCreateSerializer,
    AddressSerializer,
    LoginSerializer,
    MfaCodeSerializer,
    MfaDisableSerializer,
    MfaLoginSerializer,
    MfaRegenBackupSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    VerifyEmailSerializer,
)
from apps.accounts.services import (
    send_password_reset_email,
    send_verification_email,
    send_welcome_email,
)
from apps.accounts.throttling import (
    LoginThrottle,
    MfaLoginThrottle,
    MfaSetupThrottle,
    MfaVerifyThrottle,
    PasswordChangeThrottle,
    PasswordResetConfirmThrottle,
    PasswordResetRequestThrottle,
    RegisterThrottle,
    ResendVerificationThrottle,
    TokenRefreshThrottle,
    VerifyEmailThrottle,
)
from apps.accounts.tokens import (
    TokenError,
    clear_auth_cookies,
    decode_token,
    set_access_cookie_only,
    set_auth_cookies,
)


class RegisterView(APIView):
    throttle_classes = [RegisterThrottle]

    def post(self, request):
        from apps.orders.services import link_guest_orders_to_user

        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            gdpr_consent=True,
            gdpr_consent_at=timezone.now(),
        )

        token = EmailVerificationToken.generate(user)
        send_verification_email(user, token)

        # Attach any guest orders that were placed with this email so the new
        # account picks up its purchase history (review eligibility, order list).
        link_guest_orders_to_user(user)

        response = created_response(
            data=ProfileSerializer(user).data,
        )
        set_auth_cookies(response, user)
        return response


class LoginView(APIView):
    throttle_classes = [LoginThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        user = authenticate(
            request,
            email=serializer.validated_data["email"].lower().strip(),
            password=serializer.validated_data["password"],
        )

        if user is None or not user.is_active:
            return error_response("auth.invalid_credentials", status_code=401)

        # If 2FA is enabled, password alone is not enough. Hand the
        # client a short-lived signed challenge token; they trade it for
        # real cookies by posting it + a TOTP/backup code to
        # /2fa/login/. We deliberately *don't* set any auth cookies yet
        # — anyone with just the password must still pass step 2.
        mfa = UserMfa.objects.filter(user=user, enabled_at__isnull=False).first()
        if mfa is not None:
            return success_response(
                data={
                    "requires_2fa": True,
                    "challenge_token": sign_challenge_token(user.id),
                },
            )

        # Attach any guest orders sharing this email so order history and
        # review eligibility immediately reflect prior guest purchases.
        from apps.orders.services import link_guest_orders_to_user
        link_guest_orders_to_user(user)

        response = success_response(
            data=ProfileSerializer(user).data,
        )
        set_auth_cookies(response, user)
        return response


class MfaLoginView(APIView):
    """
    Step 2 of the login flow for users with 2FA enabled. Accepts the
    challenge_token issued by LoginView + a 6-digit TOTP code or a
    backup code. On success, sets the same auth cookies a normal login
    would have set.
    """

    throttle_classes = [MfaLoginThrottle]

    def post(self, request):
        serializer = MfaLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        try:
            user_id = verify_challenge_token(
                serializer.validated_data["challenge_token"],
            )
        except ChallengeTokenError as e:
            return error_response(f"auth.{e.code}", status_code=401)

        try:
            user = User.objects.get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return error_response("auth.invalid_credentials", status_code=401)

        try:
            mfa = user.mfa
        except UserMfa.DoesNotExist:
            mfa = None

        if mfa is None or not mfa.is_enabled:
            # Someone holding a challenge token for an account that
            # since disabled 2FA. Refuse — they should log in again
            # without the second step.
            return error_response("auth.mfa_not_enrolled", status_code=401)

        code = serializer.validated_data["code"].strip()

        if not _consume_mfa_code(mfa, code):
            return error_response("auth.mfa_invalid_code", status_code=401)

        from apps.orders.services import link_guest_orders_to_user
        link_guest_orders_to_user(user)

        response = success_response(data=ProfileSerializer(user).data)
        set_auth_cookies(response, user)
        return response


def _consume_mfa_code(mfa, code):
    """
    Try the submitted code as a TOTP first, then as a backup code.
    Persists state on success: TOTP bumps last_used_counter (replay
    defence), backup code is marked used_at.
    Returns True on success, False on failure.
    """
    if len(code) == 6 and code.isdigit():
        step = verify_totp(mfa.secret, code, last_used_counter=mfa.last_used_counter)
        if step is not None:
            mfa.last_used_counter = step
            mfa.save(update_fields=["last_used_counter", "updated_at"])
            return True
        # 6-digit code that didn't match TOTP — don't fall through to
        # backup codes (those are longer). Caller will report failure.
        return False

    # Backup code path. Walk unused codes, check_password is constant
    # time so iteration timing doesn't leak which one matched.
    normalised = code.upper().strip()
    for entry in mfa.backup_codes.filter(used_at__isnull=True):
        if check_backup_code(normalised, entry.code_hash):
            entry.used_at = timezone.now()
            entry.save(update_fields=["used_at", "updated_at"])
            return True
    return False


class MfaSetupView(APIView):
    """
    Begin 2FA setup. Generates (or replaces) the user's secret and
    returns the provisioning URI for the QR code. The user must still
    POST a valid code to /setup/verify/ before 2FA is actually enabled —
    until then we sit in a half-configured state with enabled_at=null.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [MfaSetupThrottle]

    def post(self, request):
        mfa, _ = UserMfa.objects.get_or_create(user=request.user)

        if mfa.is_enabled:
            # Already enrolled — refuse to overwrite. To re-enroll, the
            # user must disable first (which requires both factors).
            return error_response("auth.mfa_already_enabled", status_code=409)

        # Pre-enrollment: roll a fresh secret each time setup is initiated
        # so an abandoned setup can't leave a known-to-attacker secret in
        # the DB. The user always scans the QR shown on the same
        # request that wrote the secret.
        mfa.secret = generate_secret()
        mfa.last_used_counter = 0
        mfa.save(update_fields=["secret", "last_used_counter", "updated_at"])

        return success_response(
            data={
                "secret": mfa.secret,
                "provisioning_uri": provisioning_uri(mfa.secret, request.user.email),
            },
        )


class MfaSetupVerifyView(APIView):
    """
    Confirm the user has the secret in their authenticator app by
    asking them to enter a live code. On success, flip enabled_at and
    return the 10 backup codes — these are the only time the plaintext
    is ever shown.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [MfaVerifyThrottle]

    def post(self, request):
        serializer = MfaCodeSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        try:
            mfa = request.user.mfa
        except UserMfa.DoesNotExist:
            return error_response("auth.mfa_setup_not_started", status_code=400)

        if mfa.is_enabled:
            return error_response("auth.mfa_already_enabled", status_code=409)

        step = verify_totp(
            mfa.secret,
            serializer.validated_data["code"],
            last_used_counter=mfa.last_used_counter,
        )
        if step is None:
            return error_response("auth.mfa_invalid_code", status_code=400)

        plaintext_codes = generate_backup_codes()
        MfaBackupCode.objects.bulk_create(
            [
                MfaBackupCode(mfa=mfa, code_hash=hash_backup_code(c))
                for c in plaintext_codes
            ],
        )

        mfa.enabled_at = timezone.now()
        mfa.last_used_counter = step
        mfa.save(update_fields=["enabled_at", "last_used_counter", "updated_at"])

        return success_response(
            data={
                "enabled_at": mfa.enabled_at.isoformat(),
                "backup_codes": plaintext_codes,
            },
        )


class MfaDisableView(APIView):
    """
    Disable 2FA. Requires both the password (proves it isn't just a
    stolen session) and a current code or backup code (proves
    possession). Deletes the secret + every backup code; re-enrolling
    starts a fresh setup.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [MfaVerifyThrottle]

    def post(self, request):
        serializer = MfaDisableSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        if not request.user.check_password(serializer.validated_data["password"]):
            return error_response("auth.wrong_password", status_code=401)

        try:
            mfa = request.user.mfa
        except UserMfa.DoesNotExist:
            return error_response("auth.mfa_not_enrolled", status_code=400)

        if not mfa.is_enabled:
            return error_response("auth.mfa_not_enrolled", status_code=400)

        if not _consume_mfa_code(mfa, serializer.validated_data["code"]):
            return error_response("auth.mfa_invalid_code", status_code=401)

        # Tear down completely. Re-enrolling = new secret + new backup
        # codes; nothing carries over.
        mfa.delete()

        return success_response()


class MfaRegenerateBackupCodesView(APIView):
    """
    Issue a fresh set of 10 backup codes. Same auth as Disable —
    password + a live factor. Old codes are invalidated.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [MfaVerifyThrottle]

    def post(self, request):
        serializer = MfaRegenBackupSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        if not request.user.check_password(serializer.validated_data["password"]):
            return error_response("auth.wrong_password", status_code=401)

        try:
            mfa = request.user.mfa
        except UserMfa.DoesNotExist:
            return error_response("auth.mfa_not_enrolled", status_code=400)

        if not mfa.is_enabled:
            return error_response("auth.mfa_not_enrolled", status_code=400)

        if not _consume_mfa_code(mfa, serializer.validated_data["code"]):
            return error_response("auth.mfa_invalid_code", status_code=401)

        mfa.backup_codes.all().delete()
        plaintext_codes = generate_backup_codes()
        MfaBackupCode.objects.bulk_create(
            [
                MfaBackupCode(mfa=mfa, code_hash=hash_backup_code(c))
                for c in plaintext_codes
            ],
        )

        return success_response(data={"backup_codes": plaintext_codes})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.COOKIES.get("tph_refresh")
        if refresh_token:
            try:
                payload = decode_token(refresh_token, expected_type="refresh")
                RefreshToken.objects.filter(
                    jti=payload["jti"],
                    revoked_at__isnull=True,
                ).update(revoked_at=timezone.now())
            except TokenError:
                pass

        response = success_response()
        clear_auth_cookies(response)
        return response


class TokenRefreshView(APIView):
    throttle_classes = [TokenRefreshThrottle]

    def post(self, request):
        refresh_token = request.COOKIES.get("tph_refresh")
        if not refresh_token:
            return error_response("auth.no_refresh_token", status_code=401)

        try:
            payload = decode_token(refresh_token, expected_type="refresh")
        except TokenError as e:
            response = error_response(f"auth.{e.code}", status_code=401)
            clear_auth_cookies(response)
            return response

        try:
            stored_token = RefreshToken.objects.get(
                jti=payload["jti"],
                revoked_at__isnull=True,
            )
        except RefreshToken.DoesNotExist:
            response = error_response("auth.token_revoked", status_code=401)
            clear_auth_cookies(response)
            return response

        if not stored_token.is_valid:
            response = error_response("auth.token_expired", status_code=401)
            clear_auth_cookies(response)
            return response

        try:
            user = User.objects.get(id=payload["user_id"], is_active=True)
        except User.DoesNotExist:
            response = error_response("auth.user_not_found", status_code=401)
            clear_auth_cookies(response)
            return response

        # Don't rotate the refresh token on each use. Concurrent refresh
        # calls (multi-tab + api-client 401 retries) would otherwise race
        # to revoke each other and one tab would get logged out. Keep the
        # refresh token alive for its full 7-day lifetime; rotation only
        # happens on a fresh login or explicit logout.
        response = success_response(data=ProfileSerializer(user).data)
        set_access_cookie_only(response, user)
        return response


class VerifyEmailView(APIView):
    throttle_classes = [VerifyEmailThrottle]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        try:
            token = EmailVerificationToken.objects.get(
                token=serializer.validated_data["token"],
            )
        except EmailVerificationToken.DoesNotExist:
            return error_response("auth.verification_invalid")

        if not token.is_valid:
            return error_response("auth.verification_expired")

        token.used_at = timezone.now()
        token.save(update_fields=["used_at"])

        token.user.is_email_verified = True
        token.user.save(update_fields=["is_email_verified"])

        send_welcome_email(token.user)

        return success_response()


class ResendVerificationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ResendVerificationThrottle]

    def post(self, request):
        if request.user.is_email_verified:
            return error_response("auth.already_verified")

        EmailVerificationToken.objects.filter(
            user=request.user,
            used_at__isnull=True,
        ).update(used_at=timezone.now())

        token = EmailVerificationToken.generate(request.user)
        send_verification_email(request.user, token)

        return success_response()


class PasswordResetRequestView(APIView):
    throttle_classes = [PasswordResetRequestThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        try:
            user = User.objects.get(
                email=serializer.validated_data["email"].lower().strip(),
                is_active=True,
            )
            PasswordResetToken.objects.filter(
                user=user,
                used_at__isnull=True,
            ).update(used_at=timezone.now())

            token = PasswordResetToken.generate(user)
            send_password_reset_email(user, token)
        except User.DoesNotExist:
            pass

        return success_response()


class PasswordResetConfirmView(APIView):
    throttle_classes = [PasswordResetConfirmThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        try:
            token = PasswordResetToken.objects.get(
                token=serializer.validated_data["token"],
            )
        except PasswordResetToken.DoesNotExist:
            return error_response("auth.reset_invalid")

        if not token.is_valid:
            return error_response("auth.reset_expired")

        token.used_at = timezone.now()
        token.save(update_fields=["used_at"])

        user = token.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        RefreshToken.objects.filter(
            user=user,
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())

        return success_response()


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [PasswordChangeThrottle]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        if not request.user.check_password(serializer.validated_data["current_password"]):
            return error_response("auth.wrong_password")

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])

        RefreshToken.objects.filter(
            user=request.user,
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())

        response = success_response()
        set_auth_cookies(response, request.user)
        return response


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        get_token(request)
        return success_response(
            data=ProfileSerializer(request.user).data,
        )

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        for field, value in serializer.validated_data.items():
            setattr(request.user, field, value)

        request.user.save(update_fields=list(serializer.validated_data.keys()))

        return success_response(
            data=ProfileSerializer(request.user).data,
        )


class AccountDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        password = request.data.get("password", "")

        if not request.user.check_password(password):
            return error_response("auth.wrong_password")

        RefreshToken.objects.filter(
            user=request.user,
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())

        request.user.is_active = False
        request.user.email = f"deleted_{request.user.id}@deleted.local"
        request.user.first_name = ""
        request.user.last_name = ""
        request.user.phone = ""
        request.user.save()

        Address.objects.filter(user=request.user).delete()

        response = success_response()
        clear_auth_cookies(response)
        return response


class AddressListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        addresses = Address.objects.filter(user=request.user)
        return success_response(
            data=AddressSerializer(addresses, many=True).data,
        )

    def post(self, request):
        serializer = AddressCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        if serializer.validated_data.get("is_default"):
            Address.objects.filter(
                user=request.user,
                is_default=True,
            ).update(is_default=False)

        address = serializer.save(user=request.user)
        return created_response(
            data=AddressSerializer(address).data,
        )


class AddressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_address(self, request, address_id):
        try:
            return Address.objects.get(id=address_id, user=request.user)
        except Address.DoesNotExist:
            return None

    def patch(self, request, address_id):
        address = self._get_address(request, address_id)
        if not address:
            return error_response("auth.address_not_found", status_code=404)

        serializer = AddressCreateSerializer(address, data=request.data, partial=True)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        if serializer.validated_data.get("is_default"):
            Address.objects.filter(
                user=request.user,
                is_default=True,
            ).exclude(id=address.id).update(is_default=False)

        serializer.save()
        return success_response(
            data=AddressSerializer(address).data,
        )

    def delete(self, request, address_id):
        address = self._get_address(request, address_id)
        if not address:
            return error_response("auth.address_not_found", status_code=404)

        address.delete()
        return success_response()
