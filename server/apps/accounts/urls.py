from django.urls import path

from apps.accounts.views import (
    AccountDeleteView,
    AddressDetailView,
    AddressListCreateView,
    LoginView,
    LogoutView,
    MfaDisableView,
    MfaLoginView,
    MfaRegenerateBackupCodesView,
    MfaSetupVerifyView,
    MfaSetupView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    RegisterView,
    ResendVerificationView,
    TokenRefreshView,
    VerifyEmailView,
)

auth_urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("verify-email/", VerifyEmailView.as_view()),
    path("verify-email/resend/", ResendVerificationView.as_view()),
    path("password/reset/", PasswordResetRequestView.as_view()),
    path("password/reset/confirm/", PasswordResetConfirmView.as_view()),
    path("password/change/", PasswordChangeView.as_view()),
    path("me/", ProfileView.as_view()),
    path("me/delete/", AccountDeleteView.as_view()),
    # 2FA / TOTP
    path("2fa/setup/", MfaSetupView.as_view()),
    path("2fa/setup/verify/", MfaSetupVerifyView.as_view()),
    path("2fa/disable/", MfaDisableView.as_view()),
    path("2fa/login/", MfaLoginView.as_view()),
    path("2fa/backup-codes/regenerate/", MfaRegenerateBackupCodesView.as_view()),
]

address_urlpatterns = [
    path("", AddressListCreateView.as_view()),
    path("<uuid:address_id>/", AddressDetailView.as_view()),
]
