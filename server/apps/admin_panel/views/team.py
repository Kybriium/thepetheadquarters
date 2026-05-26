"""
Team management for the admin RBAC system.

Two endpoints, both gated by team.* permissions:

  GET  /admin/team/                — list every staff account + role
  PATCH /admin/team/<id>/role/      — change a staff account's role

Safety rails:

  - Owner can't change their own role (otherwise the only Owner could
    accidentally demote themselves and lock the company out).

  - The system always retains at least one Owner. Attempting to demote
    the last Owner is refused with `admin.team.last_owner`.

  - Promoting a non-staff user to a role is refused — assigning RBAC
    bundles to customer accounts has no meaning (admin endpoints
    require is_staff first). Use Django's `make_admin` management
    command to flip is_staff, then change the role through this
    endpoint.

  - Demoting an Owner to a non-Owner role isn't blocked, but the UI
    surfaces a confirmation modal because it's an irreversible-feeling
    step from the operator's perspective.
"""

from django.db.models import Count, Q
from rest_framework import serializers

from apps.accounts.mfa import verify_step_up
from apps.accounts.models import Role, User
from apps.accounts.rbac import (
    ROLE_AUDITOR,
    ROLE_OWNER,
    permissions_for_role,
)
from apps.accounts.throttling import MfaVerifyThrottle
from apps.admin_panel.views.base import AdminBaseView
from apps.core.responses import (
    error_response,
    success_response,
    validation_error_response,
)


class TeamMemberSerializer(serializers.ModelSerializer):
    """Public shape for a staff user in the team admin."""

    permissions = serializers.SerializerMethodField()
    mfa_enabled = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_email_verified",
            "mfa_enabled",
            "permissions",
            "created_at",
        ]

    def get_permissions(self, obj):
        # Sort for stable JSON output so the frontend's "diff this
        # against last fetch" logic isn't fooled by set ordering.
        return sorted(permissions_for_role(obj.role))

    def get_mfa_enabled(self, obj):
        try:
            return obj.mfa.is_enabled
        except Exception:
            return False


class AdminTeamListView(AdminBaseView):
    """Every staff user + their role. Used by the team management page."""

    required_permission = "team.view"

    def get(self, request):
        staff = User.objects.filter(is_staff=True).order_by("email")
        return success_response(
            data=TeamMemberSerializer(staff, many=True).data,
        )


class AdminTeamRoleView(AdminBaseView):
    """
    Change a single staff user's role. The acting user must hold
    `team.manage` (only Owner gets this by default) AND pass a fresh
    2FA challenge — role changes are sensitive enough to ask for the
    code every time, even though the user is already logged in.
    """

    required_permission = "team.manage"
    # 10/min/user. Tight enough to make brute-force of 6-digit codes
    # useless (1M space, 60k tries/hr at this rate would take years).
    throttle_classes = [MfaVerifyThrottle]

    def patch(self, request, user_id):
        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return error_response("admin.team.not_found", status_code=404)

        if not target.is_staff:
            # RBAC roles are meaningless on customer accounts. Refuse
            # rather than silently writing a role nobody honours. Use
            # /admin/team/promote/ to promote a customer to admin.
            return error_response("admin.team.not_staff", status_code=400)

        new_role = (request.data.get("role") or "").strip()
        # Validate against the live Role table — both system and custom
        # role codes are valid assignment targets. An empty string or a
        # non-existent code is refused.
        if not new_role or not Role.objects.filter(code=new_role).exists():
            return validation_error_response({"role": "invalid"})

        # Step-up 2FA. Required for every role change, even no-op
        # changes — keeps the gate consistent so an attacker who steals
        # a session cookie can't promote themselves without the second
        # factor.
        #
        # Failures return 400 (not 401) so the api-client's "session
        # might have expired, refresh + retry" logic doesn't auto-fire
        # the same wrong code twice. The user is fully authenticated;
        # they're just failing the elevation step.
        mfa_code = (request.data.get("mfa_code") or "").strip()
        if not mfa_code:
            return error_response("auth.mfa_required_for_action", status_code=400)
        if not verify_step_up(request.user, mfa_code):
            return error_response("auth.mfa_invalid_code", status_code=400)

        # Owner self-protection — can't demote yourself. If the user is
        # the last Owner this also catches the company-locked-out case.
        if target.id == request.user.id and target.role == ROLE_OWNER and new_role != ROLE_OWNER:
            return error_response("admin.team.cant_demote_self", status_code=400)

        # System always keeps ≥1 Owner. Catches the "Owner demotes the
        # only other Owner" edge case too.
        if target.role == ROLE_OWNER and new_role != ROLE_OWNER:
            other_owners = (
                User.objects.filter(is_staff=True, role=ROLE_OWNER)
                .exclude(id=target.id)
                .count()
            )
            if other_owners == 0:
                return error_response("admin.team.last_owner", status_code=400)

        target.role = new_role
        target.save(update_fields=["role", "updated_at"])

        return success_response(data=TeamMemberSerializer(target).data)


class AdminTeamPromoteView(AdminBaseView):
    """
    Promote an existing customer account to admin.

    Body: {user_id, role, mfa_code}

    The target must be a real existing user who isn't currently staff.
    Flips is_staff=True + sets the role. The new admin will be force-
    redirected to the 2FA setup wizard on their next login (because
    mfa_required is True for any is_staff user without active MFA).

    Step-up 2FA required from the acting Owner. We don't trust the
    session cookie alone for promotions — too easy to mass-promote if
    someone walks past an unlocked laptop.
    """

    required_permission = "team.manage"
    throttle_classes = [MfaVerifyThrottle]

    def post(self, request):
        user_id = (request.data.get("user_id") or "").strip()
        new_role = (request.data.get("role") or "").strip()
        mfa_code = (request.data.get("mfa_code") or "").strip()

        if not user_id:
            return validation_error_response({"user_id": "required"})
        if not new_role or not Role.objects.filter(code=new_role).exists():
            return validation_error_response({"role": "invalid"})
        if not mfa_code:
            return error_response("auth.mfa_required_for_action", status_code=400)

        # Step-up check before any DB mutation. The order matters —
        # don't even look up the target until we know the code is good.
        if not verify_step_up(request.user, mfa_code):
            return error_response("auth.mfa_invalid_code", status_code=400)

        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return error_response("admin.team.not_found", status_code=404)

        if target.is_staff:
            # Already an admin — use /admin/team/<id>/role/ to change
            # their role. We refuse to silently overwrite because
            # "promote" implies going from customer → admin.
            return error_response("admin.team.already_staff", status_code=400)

        target.is_staff = True
        target.role = new_role
        target.save(update_fields=["is_staff", "role", "updated_at"])

        return success_response(data=TeamMemberSerializer(target).data)


class AdminTeamDemoteView(AdminBaseView):
    """
    Demote an existing admin back to a customer account.

    Body: {mfa_code}

    Flips is_staff=False and resets role to AUDITOR (harmless default —
    role only matters for staff users, but we don't leave Owner sitting
    on a customer row). The user's account, orders, addresses, and
    even their MFA enrollment all survive — they can still log in as a
    customer afterwards, just without admin access.

    Safety rails mirror role changes:
      - Can't demote yourself (would lock the system out).
      - Can't demote the last Owner (system always keeps ≥1 Owner).
      - Step-up 2FA required.
    """

    required_permission = "team.manage"
    throttle_classes = [MfaVerifyThrottle]

    def post(self, request, user_id):
        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return error_response("admin.team.not_found", status_code=404)

        if not target.is_staff:
            # Already a customer — nothing to do.
            return error_response("admin.team.not_staff", status_code=400)

        mfa_code = (request.data.get("mfa_code") or "").strip()
        if not mfa_code:
            return error_response("auth.mfa_required_for_action", status_code=400)
        if not verify_step_up(request.user, mfa_code):
            return error_response("auth.mfa_invalid_code", status_code=400)

        if target.id == request.user.id:
            return error_response("admin.team.cant_demote_self", status_code=400)

        if target.role == ROLE_OWNER:
            other_owners = (
                User.objects.filter(is_staff=True, role=ROLE_OWNER)
                .exclude(id=target.id)
                .count()
            )
            if other_owners == 0:
                return error_response("admin.team.last_owner", status_code=400)

        target.is_staff = False
        target.role = ROLE_AUDITOR
        target.save(update_fields=["is_staff", "role", "updated_at"])

        return success_response(data=TeamMemberSerializer(target).data)
