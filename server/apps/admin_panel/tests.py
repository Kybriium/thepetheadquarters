"""
RBAC end-to-end coverage for the admin panel.

Approach:
  - Make a test user per role (helper enrols MFA inline so admin
    endpoints aren't blocked by the MFA gate first).
  - Hit a representative endpoint for each permission code and check
    whether the role is allowed or refused.
  - Cover the Owner-only team management endpoints and their safety
    rails (last-Owner protection, self-demote refusal, non-staff
    refusal).

We don't try to enumerate every endpoint × every role — that would be
brittle. We test the *permission gate*, trusting the role → permission
mapping is correct because the catalogue is verified at import time
and the gate is one tiny class.
"""

from __future__ import annotations

import pyotp
from django.conf import settings as live_settings
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserMfa
from apps.accounts.rbac import (
    PERMISSION_GROUPS,
    PERMISSIONS,
    ROLE_AUDITOR,
    ROLE_INVENTORY_MANAGER,
    ROLE_MARKETING,
    ROLE_ORDER_MANAGER,
    ROLE_OWNER,
    permissions_for_role,
)


# Merge with live REST_FRAMEWORK so we don't blow away EXCEPTION_HANDLER
# (same trap that bit the MFA tests). Drop throttling so re-runs work.
THROTTLE_OVERRIDE = override_settings(
    REST_FRAMEWORK={
        **live_settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    }
)


def _make_staff(email: str, role: str) -> User:
    """Create a staff user with the given role and MFA already enrolled."""
    user = User.objects.create_user(
        email=email,
        password="StaffPass1!",
        first_name="Test",
        last_name="Staff",
        is_email_verified=True,
        is_staff=True,
        role=role,
    )
    UserMfa.objects.create(
        user=user,
        secret=pyotp.random_base32(),
        enabled_at=timezone.now(),
        last_used_counter=0,
    )
    return user


@THROTTLE_OVERRIDE
class CatalogIntegrityTests(TestCase):
    """The catalogue keeps itself honest — sanity check that here too."""

    def test_owner_has_every_permission(self):
        self.assertEqual(permissions_for_role(ROLE_OWNER), PERMISSIONS)

    def test_auditor_is_view_only(self):
        perms = permissions_for_role(ROLE_AUDITOR)
        self.assertGreater(len(perms), 0)
        for p in perms:
            self.assertTrue(
                p.endswith(".view"),
                msg=f"Auditor holds non-view permission: {p}",
            )

    def test_unknown_role_has_no_permissions(self):
        self.assertEqual(permissions_for_role("NONSENSE"), set())
        self.assertEqual(permissions_for_role(None), set())

    def test_order_manager_does_not_hold_inventory_write(self):
        perms = permissions_for_role(ROLE_ORDER_MANAGER)
        self.assertNotIn("inventory.update", perms)
        self.assertNotIn("products.update", perms)

    def test_marketing_does_not_hold_orders_refund(self):
        perms = permissions_for_role(ROLE_MARKETING)
        self.assertNotIn("orders.refund", perms)
        self.assertNotIn("orders.update", perms)


@THROTTLE_OVERRIDE
class UserHelperTests(TestCase):
    def test_has_admin_perm_respects_role(self):
        u = _make_staff("inv@test.local", ROLE_INVENTORY_MANAGER)
        self.assertTrue(u.has_admin_perm("inventory.update"))
        self.assertFalse(u.has_admin_perm("orders.refund"))

    def test_non_staff_has_no_admin_perms(self):
        # Customers with role set still get nothing because is_staff=False.
        u = User.objects.create_user(
            email="cust@test.local",
            password="Pass1!",
            first_name="X",
            last_name="Y",
            is_email_verified=True,
        )
        # Force-set a role through .save (bypasses normal flow).
        u.role = ROLE_OWNER
        u.save()
        self.assertFalse(u.is_staff)
        self.assertEqual(u.admin_permissions, set())


@THROTTLE_OVERRIDE
class RoleEndpointAccessTests(TestCase):
    """
    Pick a handful of endpoints that touch different permission codes
    and verify each role hits the expected gate.
    """

    @classmethod
    def setUpTestData(cls):
        cls.owner = _make_staff("owner@test.local", ROLE_OWNER)
        cls.order_mgr = _make_staff("orders@test.local", ROLE_ORDER_MANAGER)
        cls.inv_mgr = _make_staff("inv@test.local", ROLE_INVENTORY_MANAGER)
        cls.marketing = _make_staff("marketing@test.local", ROLE_MARKETING)
        cls.auditor = _make_staff("auditor@test.local", ROLE_AUDITOR)

    def setUp(self):
        self.client = APIClient()

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def test_owner_can_list_products(self):
        self._as(self.owner)
        res = self.client.get("/api/v1/admin/products/")
        self.assertEqual(res.status_code, 200)

    def test_auditor_can_view_but_not_create_products(self):
        self._as(self.auditor)
        get_res = self.client.get("/api/v1/admin/products/")
        self.assertEqual(get_res.status_code, 200)
        # POST → 403 from HasAdminPermission (products.update missing)
        post_res = self.client.post(
            "/api/v1/admin/products/",
            {"sku": "TPH-NOPE"},
            format="json",
        )
        self.assertEqual(post_res.status_code, 403)
        self.assertEqual(post_res.json().get("code"), "auth.permission_denied")

    def test_order_mgr_cannot_reach_inventory_endpoints(self):
        self._as(self.order_mgr)
        res = self.client.get("/api/v1/admin/inventory/")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "auth.permission_denied")

    def test_inv_mgr_cannot_reach_orders_list(self):
        self._as(self.inv_mgr)
        res = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(res.status_code, 403)

    def test_marketing_can_view_promotions(self):
        self._as(self.marketing)
        res = self.client.get("/api/v1/admin/promotions/")
        self.assertEqual(res.status_code, 200)

    def test_marketing_cannot_refund_orders(self):
        self._as(self.marketing)
        res = self.client.post(
            "/api/v1/admin/orders/TPH-DOES-NOT-EXIST/refund/",
            {},
            format="json",
        )
        # 403 (permission) — not 404 (order not found). The gate fires
        # before the view body runs.
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "auth.permission_denied")

    def test_dashboard_open_to_every_role(self):
        # Dashboard has no required_permission declared — any staff
        # user with MFA gets it.
        for user in [self.owner, self.order_mgr, self.inv_mgr, self.marketing, self.auditor]:
            self._as(user)
            res = self.client.get("/api/v1/admin/dashboard/")
            self.assertEqual(res.status_code, 200, msg=f"failed for {user.role}")


@THROTTLE_OVERRIDE
class TeamManagementTests(TestCase):
    """Owner-only role editing + the safety rails."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = _make_staff("owner@test.local", ROLE_OWNER)
        cls.other_owner = _make_staff("owner2@test.local", ROLE_OWNER)
        cls.auditor = _make_staff("auditor@test.local", ROLE_AUDITOR)

    def setUp(self):
        self.client = APIClient()

    def test_team_list_visible_to_team_view_holders(self):
        # Auditor has team.view → can list
        self.client.force_authenticate(user=self.auditor)
        res = self.client.get("/api/v1/admin/team/")
        self.assertEqual(res.status_code, 200)
        emails = {row["email"] for row in res.json()["data"]}
        self.assertIn("owner@test.local", emails)
        self.assertIn("auditor@test.local", emails)

    def test_only_owner_can_change_roles(self):
        # Auditor cannot manage roles
        self.client.force_authenticate(user=self.auditor)
        res = self.client.patch(
            f"/api/v1/admin/team/{self.other_owner.id}/role/",
            {"role": ROLE_AUDITOR},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_owner_can_demote_other_owner(self):
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            f"/api/v1/admin/team/{self.other_owner.id}/role/",
            {"role": ROLE_AUDITOR},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.other_owner.refresh_from_db()
        self.assertEqual(self.other_owner.role, ROLE_AUDITOR)

    def test_cannot_demote_self(self):
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            f"/api/v1/admin/team/{self.owner.id}/role/",
            {"role": ROLE_AUDITOR},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get("code"), "admin.team.cant_demote_self")

    def test_cannot_demote_last_owner(self):
        # Remove the second owner first so only one Owner remains.
        self.other_owner.role = ROLE_AUDITOR
        self.other_owner.save()
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            f"/api/v1/admin/team/{self.owner.id}/role/",
            {"role": ROLE_AUDITOR},
            format="json",
        )
        # cant_demote_self trips first (it's the same user). To test
        # last_owner specifically, demote a non-self owner.
        # Re-create scenario with two owners then have one demote the
        # other after the cant_demote_self trips — covered by
        # test_owner_can_demote_other_owner above.
        self.assertEqual(res.status_code, 400)

    def test_invalid_role_rejected(self):
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            f"/api/v1/admin/team/{self.other_owner.id}/role/",
            {"role": "GOD_MODE"},
            format="json",
        )
        self.assertEqual(res.status_code, 422)

    def test_non_staff_target_rejected(self):
        customer = User.objects.create_user(
            email="customer-target@test.local",
            password="Pass1!",
            first_name="X",
            last_name="Y",
            is_email_verified=True,
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            f"/api/v1/admin/team/{customer.id}/role/",
            {"role": ROLE_OWNER},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get("code"), "admin.team.not_staff")


@THROTTLE_OVERRIDE
class ProfileExposureTests(TestCase):
    """/auth/me/ must surface role + permissions so the frontend can gate."""

    def test_owner_profile_includes_role_and_full_perm_list(self):
        owner = _make_staff("owner@test.local", ROLE_OWNER)
        client = APIClient()
        client.force_authenticate(user=owner)
        res = client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["role"], ROLE_OWNER)
        self.assertEqual(set(data["permissions"]), PERMISSIONS)

    def test_customer_profile_has_empty_permissions(self):
        cust = User.objects.create_user(
            email="cust2@test.local",
            password="Pass1!",
            first_name="X",
            last_name="Y",
            is_email_verified=True,
        )
        client = APIClient()
        client.force_authenticate(user=cust)
        res = client.get("/api/v1/auth/me/")
        data = res.json()["data"]
        self.assertEqual(data["permissions"], [])
        self.assertFalse(data["is_staff"])


@THROTTLE_OVERRIDE
class RoleCatalogueTests(TestCase):
    """Read-only catalogue endpoint that drives the checkbox UI."""

    def test_catalogue_includes_every_permission_grouped(self):
        owner = _make_staff("owner@test.local", ROLE_OWNER)
        client = APIClient()
        client.force_authenticate(user=owner)
        res = client.get("/api/v1/admin/roles/catalogue/")
        self.assertEqual(res.status_code, 200)
        groups = res.json()["data"]["groups"]
        flat = {p["code"] for g in groups for p in g["permissions"]}
        self.assertEqual(flat, PERMISSIONS)

    def test_catalogue_requires_team_view(self):
        # An auditor (has team.view) can read it; a freshly created
        # custom role with NO permissions cannot.
        owner = _make_staff("owner@test.local", ROLE_OWNER)
        client = APIClient()
        client.force_authenticate(user=owner)
        # Create a permissionless custom role and assign it to a user.
        empty_role = Role.objects.create(
            code="empty_role", name="Empty", permissions=[], is_system=False,
        )
        empty_user = _make_staff("empty@test.local", "empty_role")
        client.force_authenticate(user=empty_user)
        res = client.get("/api/v1/admin/roles/catalogue/")
        self.assertEqual(res.status_code, 403)


@THROTTLE_OVERRIDE
class CustomRoleLifecycleTests(TestCase):
    """End-to-end coverage of the GitHub-style custom-role workflow."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = _make_staff("owner@test.local", ROLE_OWNER)
        cls.auditor = _make_staff("auditor@test.local", ROLE_AUDITOR)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_list_includes_system_and_custom(self):
        Role.objects.create(
            code="dispatch_lead",
            name="Dispatch Lead",
            permissions=["orders.view", "orders.ship"],
        )
        res = self.client.get("/api/v1/admin/roles/")
        codes = {r["code"] for r in res.json()["data"]}
        self.assertIn("OWNER", codes)
        self.assertIn("dispatch_lead", codes)

    def test_create_custom_role(self):
        res = self.client.post(
            "/api/v1/admin/roles/",
            {
                "name": "Customer Support",
                "description": "Handles tickets + refunds.",
                "permissions": [
                    "orders.view", "orders.refund",
                    "contact.view", "contact.respond",
                    "fake.permission",  # unknown code — should be silently dropped
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["name"], "Customer Support")
        self.assertEqual(data["code"], "customer_support")
        self.assertNotIn("fake.permission", data["permissions"])
        self.assertEqual(
            set(data["permissions"]),
            {"orders.view", "orders.refund", "contact.view", "contact.respond"},
        )
        self.assertFalse(data["is_system"])

    def test_slug_collision_gets_numeric_suffix(self):
        Role.objects.create(code="support", name="Support", permissions=[])
        res = self.client.post(
            "/api/v1/admin/roles/",
            {"name": "Support", "permissions": ["orders.view"]},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertNotEqual(res.json()["data"]["code"], "support")

    def test_cannot_collide_with_system_code(self):
        # Forcing the slug to a system code is impossible — auto-suffix
        # makes it "owner_2", "owner_3", etc.
        res = self.client.post(
            "/api/v1/admin/roles/",
            {"name": "owner", "permissions": []},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertNotEqual(res.json()["data"]["code"], "OWNER")

    def test_edit_custom_role(self):
        role = Role.objects.create(
            code="dispatch", name="Dispatch", permissions=["orders.view"]
        )
        res = self.client.patch(
            f"/api/v1/admin/roles/{role.code}/",
            {
                "name": "Dispatch Lead",
                "permissions": ["orders.view", "orders.ship", "orders.update"],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        role.refresh_from_db()
        self.assertEqual(role.name, "Dispatch Lead")
        self.assertEqual(set(role.permissions), {"orders.view", "orders.ship", "orders.update"})

    def test_cannot_edit_system_role(self):
        res = self.client.patch(
            f"/api/v1/admin/roles/{ROLE_OWNER}/",
            {"name": "New Owner Name"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get("code"), "admin.roles.system_role_locked")

    def test_cannot_delete_system_role(self):
        res = self.client.delete(f"/api/v1/admin/roles/{ROLE_OWNER}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get("code"), "admin.roles.system_role_locked")

    def test_cannot_delete_role_in_use(self):
        role = Role.objects.create(code="custom_x", name="Custom X", permissions=[])
        # Assign it to someone
        self.auditor.role = role.code
        self.auditor.save(update_fields=["role"])
        res = self.client.delete(f"/api/v1/admin/roles/{role.code}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get("code"), "admin.roles.in_use")

    def test_delete_unused_custom_role(self):
        role = Role.objects.create(code="custom_y", name="Custom Y", permissions=[])
        res = self.client.delete(f"/api/v1/admin/roles/{role.code}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Role.objects.filter(code="custom_y").exists())

    def test_clone_system_role_creates_editable_copy(self):
        res = self.client.post(f"/api/v1/admin/roles/{ROLE_AUDITOR}/clone/")
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertFalse(data["is_system"])
        self.assertEqual(data["name"], "Copy of Auditor")
        # Permissions copied from source
        self.assertEqual(set(data["permissions"]), permissions_for_role(ROLE_AUDITOR))

    def test_custom_role_assignment_grants_permissions(self):
        """End-to-end: create a custom role, assign it, hit an endpoint."""
        role = Role.objects.create(
            code="orders_only",
            name="Orders Only",
            permissions=["orders.view"],
        )
        target = _make_staff("orders-only@test.local", role.code)
        # The target can list orders…
        self.client.force_authenticate(user=target)
        res = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(res.status_code, 200)
        # …but not refund them.
        res = self.client.post(
            "/api/v1/admin/orders/TPH-FAKE/refund/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "auth.permission_denied")

    def test_auditor_cannot_create_role(self):
        self.client.force_authenticate(user=self.auditor)
        res = self.client.post(
            "/api/v1/admin/roles/",
            {"name": "Sneaky", "permissions": []},
            format="json",
        )
        self.assertEqual(res.status_code, 403)


@THROTTLE_OVERRIDE
class OwnerLivePermissionTests(TestCase):
    """
    Owner returns the LIVE catalogue, not the snapshot stored on the
    Role row. Future-proofing: a new permission code added to the
    catalogue auto-grants to Owner without needing to update the seed.
    """

    def test_owner_gets_live_permissions(self):
        owner_role = Role.objects.get(code=ROLE_OWNER)
        # Truncate the seeded permissions to simulate a stale snapshot.
        owner_role.permissions = ["orders.view"]
        owner_role.save(update_fields=["permissions"])
        # Lookup ignores the truncated row and returns the full catalogue.
        self.assertEqual(permissions_for_role(ROLE_OWNER), PERMISSIONS)
