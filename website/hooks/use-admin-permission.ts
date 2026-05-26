"use client";

import { useAuth } from "@/lib/auth-context";

/**
 * RBAC helper for admin UI gating.
 *
 *   const canRefund = useAdminPermission("orders.refund");
 *   if (!canRefund) return null;
 *
 * Single source of truth for whether the current user can perform a
 * permission code. Returns `false` for non-staff users automatically
 * (their permissions array is empty server-side).
 *
 * Owner users implicitly have every permission — the server expands
 * Owner to the full set in /auth/me/, so we don't need a special case
 * here.
 *
 * UI gating is UX, not security. The backend re-validates every
 * endpoint with HasAdminPermission; this hook just keeps users from
 * seeing buttons they can't use.
 */
export function useAdminPermission(code: string): boolean {
  const { user } = useAuth();
  if (!user || !user.is_staff) return false;
  return user.permissions.includes(code);
}

/**
 * Multi-permission variant — returns true only if the user holds
 * *all* of the requested codes. Useful for pages that need both
 * "view list" + "view a specific resource" before the route is
 * worth rendering.
 */
export function useAdminPermissions(codes: string[]): boolean {
  const { user } = useAuth();
  if (!user || !user.is_staff) return false;
  return codes.every((c) => user.permissions.includes(c));
}

/**
 * Returns true if the user holds at least one of the supplied codes.
 * Sidebar groups use this — show "Catalog" if the user can edit OR
 * just view brands/categories.
 */
export function useAdminAnyPermission(codes: string[]): boolean {
  const { user } = useAuth();
  if (!user || !user.is_staff) return false;
  return codes.some((c) => user.permissions.includes(c));
}
