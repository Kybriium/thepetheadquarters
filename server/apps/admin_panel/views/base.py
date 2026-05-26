from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.accounts.authentication import CookieJWTAuthentication
from apps.accounts.permissions import HasAdminPermission, IsStaffWithMfa


@method_decorator(csrf_exempt, name="dispatch")
class AdminBaseView(APIView):
    """
    Base view for all admin endpoints.
    Requires cookie-based JWT auth + is_staff flag + active 2FA + the
    specific permission code declared on the subclass.

    CSRF is exempt because:
    1. Auth uses httpOnly tph_access cookie with SameSite=Lax,
       which already prevents cross-origin POSTs from sending it.
    2. is_staff permission check ensures only staff users can access.
    3. Same approach as the Stripe webhook handler.

    Permission chain (each runs in order; first to fail wins):
      1. IsAuthenticated — must be logged in
      2. IsStaffWithMfa — must be staff with active 2FA
      3. HasAdminPermission — must hold the view's required_permission
         (or required_permissions[method] for views that mix actions)

    A view that omits both `required_permission` and
    `required_permissions` is implicitly available to anyone who clears
    the first two gates (dashboard, generic uploads, etc.).
    """
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, IsStaffWithMfa, HasAdminPermission]
