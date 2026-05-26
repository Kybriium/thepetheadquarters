from rest_framework.permissions import BasePermission


class IsEmailVerified(BasePermission):
    """
    Allow access only to users with a verified email address.
    Used as a gate for checkout and other sensitive operations.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_email_verified
        )


class IsStaff(BasePermission):
    """
    Allow access only to staff users.
    Used to gate the admin section.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )


class HasAdminPermission(BasePermission):
    """
    Per-endpoint RBAC for admin views.

    Looks at the view for one of two declarations:

      - `required_permission = "orders.refund"` — single code applies
        to every method that reaches the view.

      - `required_permissions = {"GET": "products.view", "PATCH":
        "products.update", "DELETE": "products.delete"}` — different
        codes per HTTP method, for views that mix list/detail/edit.

    If the view declares neither, the gate is open (admin auth alone is
    enough — e.g. the dashboard, generic uploads). This means the
    permission class is safe to drop in at the AdminBaseView level
    without breaking views that haven't been annotated yet.

    Refusals carry the stable code `auth.permission_denied` so the
    frontend can branch on it (toast + redirect instead of generic
    403). Note that IsStaffWithMfa runs first in the permission chain,
    so non-staff and unenrolled-staff hit those gates before this one.
    """

    message = "auth.permission_denied"

    def has_permission(self, request, view):
        required = self._required_for(request, view)
        if required is None:
            # No annotation → no extra gate beyond IsStaffWithMfa.
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return user.has_admin_perm(required)

    @staticmethod
    def _required_for(request, view):
        per_method = getattr(view, "required_permissions", None)
        if isinstance(per_method, dict):
            return per_method.get(request.method)
        return getattr(view, "required_permission", None)


class IsStaffWithMfa(BasePermission):
    """
    Allow access only to staff users who have completed 2FA enrollment.

    A staff account without 2FA gets a 403 with a stable error code
    `auth.mfa_required` so the frontend can recognise the gate and
    bounce them to /account/security/setup. Authenticated-but-not-staff
    users get the normal 403 — no leak about what's missing.
    """

    # Stable code the frontend matches on. Surfaced to DRF as the
    # message attribute of PermissionDenied; the existing error_response
    # plumbing turns DRF auth errors into {"error": "<code>"} envelopes.
    message = "auth.mfa_required"

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_staff):
            return False
        try:
            return user.mfa.is_enabled
        except Exception:
            return False
