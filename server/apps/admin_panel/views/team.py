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

from apps.accounts.models import Role, User
from apps.accounts.rbac import (
    ROLE_OWNER,
    permissions_for_role,
)
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
    `team.manage` (only Owner gets this by default).
    """

    required_permission = "team.manage"

    def patch(self, request, user_id):
        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return error_response("admin.team.not_found", status_code=404)

        if not target.is_staff:
            # RBAC roles are meaningless on customer accounts. Refuse
            # rather than silently writing a role nobody honours.
            return error_response("admin.team.not_staff", status_code=400)

        new_role = (request.data.get("role") or "").strip()
        # Validate against the live Role table — both system and custom
        # role codes are valid assignment targets. An empty string or a
        # non-existent code is refused.
        if not new_role or not Role.objects.filter(code=new_role).exists():
            return validation_error_response({"role": "invalid"})

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
