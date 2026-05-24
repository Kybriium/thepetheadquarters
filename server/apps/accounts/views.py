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

from apps.accounts.models import (
    Address,
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken,
    User,
)
from apps.accounts.serializers import (
    AddressCreateSerializer,
    AddressSerializer,
    LoginSerializer,
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

        # Attach any guest orders sharing this email so order history and
        # review eligibility immediately reflect prior guest purchases.
        from apps.orders.services import link_guest_orders_to_user
        link_guest_orders_to_user(user)

        response = success_response(
            data=ProfileSerializer(user).data,
        )
        set_auth_cookies(response, user)
        return response


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
