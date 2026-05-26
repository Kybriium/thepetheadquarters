"""
Role CRUD + catalogue endpoints for the custom-role feature.

Endpoints (all under /admin/roles/, all require team.* permissions):

  GET    /admin/roles/                  — list every role (system + custom)
  POST   /admin/roles/                  — create a new custom role
  GET    /admin/roles/<code>/           — single role detail
  PATCH  /admin/roles/<code>/           — edit a custom role (refuse if system)
  DELETE /admin/roles/<code>/           — delete a custom role (refuse if
                                          system OR currently assigned to
                                          any user)
  POST   /admin/roles/<code>/clone/     — clone any role (system or
                                          custom) into a new editable
                                          custom role

  GET    /admin/roles/catalogue/        — return PERMISSION_GROUPS as JSON
                                          so the frontend can render
                                          the checkbox panel without
                                          duplicating the catalogue

The catalogue endpoint is read-only and only needs team.view because
it returns metadata, not access decisions.
"""

import re

from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.rbac import (
    PERMISSION_GROUPS,
    PERMISSIONS,
    SYSTEM_ROLE_CODES,
)
from apps.admin_panel.views.base import AdminBaseView
from apps.core.responses import (
    created_response,
    error_response,
    success_response,
    validation_error_response,
)


# Code generated from the name — lowercase, slug-friendly, max 64 chars.
_SLUG_RE = re.compile(r"[^a-z0-9_]+")


def _slug_from_name(name: str) -> str:
    """Turn a human name like 'Dispatch Lead' into 'dispatch_lead'."""
    slug = _SLUG_RE.sub("_", (name or "").strip().lower()).strip("_")
    return slug[:64] or "custom_role"


class RoleSerializer(serializers.ModelSerializer):
    # `assigned_user_count` exposes the "in use" status to the UI so
    # we can disable the delete button before submission.
    assigned_user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "code",
            "name",
            "description",
            "permissions",
            "is_system",
            "assigned_user_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["code", "is_system", "assigned_user_count", "created_at", "updated_at"]

    def get_assigned_user_count(self, obj):
        return User.objects.filter(is_staff=True, role=obj.code).count()


def _clean_permissions(raw) -> list[str] | None:
    """
    Filter incoming permission list to known catalogue codes. Returns
    a deduped + sorted list, or None if the input wasn't a list.
    """
    if not isinstance(raw, list):
        return None
    valid = {p for p in raw if isinstance(p, str) and p in PERMISSIONS}
    return sorted(valid)


class AdminRoleListView(AdminBaseView):
    """List all roles (system + custom) and create new custom roles."""

    required_permissions = {
        "GET": "team.view",
        "POST": "team.manage",
    }

    def get(self, request):
        roles = Role.objects.all()
        return success_response(data=RoleSerializer(roles, many=True).data)

    def post(self, request):
        name = (request.data.get("name") or "").strip()
        description = (request.data.get("description") or "").strip()
        permissions = _clean_permissions(request.data.get("permissions"))

        if not name:
            return validation_error_response({"name": "required"})
        if permissions is None:
            return validation_error_response({"permissions": "must_be_list"})

        # Auto-slug from the name. Collisions get a numeric suffix
        # rather than refusing the request — Owners shouldn't have to
        # care about unique codes.
        base_code = _slug_from_name(name)
        code = base_code
        suffix = 1
        while Role.objects.filter(code=code).exists() or code in SYSTEM_ROLE_CODES:
            suffix += 1
            code = f"{base_code}_{suffix}"[:64]

        role = Role.objects.create(
            code=code,
            name=name,
            description=description,
            permissions=permissions,
            is_system=False,
        )
        return created_response(data=RoleSerializer(role).data)


class AdminRoleDetailView(AdminBaseView):
    """Read / edit / delete a single role."""

    required_permissions = {
        "GET": "team.view",
        "PATCH": "team.manage",
        "DELETE": "team.manage",
    }

    def _get(self, code):
        try:
            return Role.objects.get(code=code)
        except Role.DoesNotExist:
            return None

    def get(self, request, code):
        role = self._get(code)
        if not role:
            return error_response("admin.roles.not_found", status_code=404)
        return success_response(data=RoleSerializer(role).data)

    def patch(self, request, code):
        role = self._get(code)
        if not role:
            return error_response("admin.roles.not_found", status_code=404)
        if role.is_system:
            # System roles are templates — Owners clone them to make
            # editable copies. Refuse to overwrite the originals.
            return error_response("admin.roles.system_role_locked", status_code=400)

        updates: list[str] = []
        if "name" in request.data:
            name = (request.data["name"] or "").strip()
            if not name:
                return validation_error_response({"name": "required"})
            role.name = name
            updates.append("name")
        if "description" in request.data:
            role.description = (request.data["description"] or "").strip()
            updates.append("description")
        if "permissions" in request.data:
            cleaned = _clean_permissions(request.data["permissions"])
            if cleaned is None:
                return validation_error_response({"permissions": "must_be_list"})
            role.permissions = cleaned
            updates.append("permissions")

        if updates:
            updates.append("updated_at")
            role.save(update_fields=updates)
        return success_response(data=RoleSerializer(role).data)

    def delete(self, request, code):
        role = self._get(code)
        if not role:
            return error_response("admin.roles.not_found", status_code=404)
        if role.is_system:
            return error_response("admin.roles.system_role_locked", status_code=400)
        # Refuse if any user still holds this role — the operator
        # should reassign first. Saves us from having to silently
        # demote affected users at deletion time.
        in_use = User.objects.filter(is_staff=True, role=role.code).exists()
        if in_use:
            return error_response("admin.roles.in_use", status_code=400)
        role.delete()
        return success_response()


class AdminRoleCloneView(AdminBaseView):
    """
    Copy any existing role (system or custom) into a new editable
    custom role. The new role starts with the same permission set and
    a name like "Copy of Owner".
    """

    required_permission = "team.manage"

    def post(self, request, code):
        try:
            source = Role.objects.get(code=code)
        except Role.DoesNotExist:
            return error_response("admin.roles.not_found", status_code=404)

        base_name = f"Copy of {source.name}"
        # Auto-suffix the slug if it collides.
        base_code = _slug_from_name(base_name)
        new_code = base_code
        suffix = 1
        while Role.objects.filter(code=new_code).exists() or new_code in SYSTEM_ROLE_CODES:
            suffix += 1
            new_code = f"{base_code}_{suffix}"[:64]

        clone = Role.objects.create(
            code=new_code,
            name=base_name,
            description=source.description,
            permissions=list(source.permissions),
            is_system=False,
        )
        return created_response(data=RoleSerializer(clone).data)


class AdminRoleCatalogueView(AdminBaseView):
    """
    Return the PERMISSION_GROUPS structure so the frontend can render
    the checkbox panel without re-deriving labels and hints.

    Anyone with team.view can read this — it's metadata, not access
    decisions.
    """

    required_permission = "team.view"

    def get(self, request):
        return success_response(data={"groups": PERMISSION_GROUPS})
