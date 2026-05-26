"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldAlert, UserMinus, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAdminPermission } from "@/hooks/use-admin-permission";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { Role } from "@/types/rbac";
import { MfaStepUpModal } from "../../_components/mfa-step-up-modal";
import { PromoteCustomerModal } from "./promote-customer-modal";

interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  mfa_enabled: boolean;
  permissions: string[];
  created_at: string;
}

export function TeamView() {
  const { user: currentUser } = useAuth();
  const canManage = useAdminPermission("team.manage");

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirmDemote, setConfirmDemote] = useState<{ member: TeamMember; newRole: string } | null>(null);
  // Step-up MFA prompt for role changes. `pendingRoleChange` holds the
  // intent (which member + new role) until the operator either
  // confirms with a code or cancels.
  const [pendingRoleChange, setPendingRoleChange] = useState<{ member: TeamMember; newRole: string } | null>(null);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  // Two-step demote: confirm modal first ("turn them back to a
  // customer"), then step-up 2FA. `confirmRemove` holds the staff
  // member while we wait for them to confirm; `pendingRemove` holds
  // them while we wait for the 2FA code.
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null);
  const [removeStepUpError, setRemoveStepUpError] = useState<string | null>(null);

  // Lookup table: role code → human label & description. Built from
  // the live /admin/roles/ list so custom roles show up automatically.
  const roleMeta = useMemo(() => {
    const map: Record<string, { name: string; description: string; isSystem: boolean }> = {};
    for (const r of roles ?? []) {
      map[r.code] = { name: r.name, description: r.description, isSystem: r.is_system };
    }
    return map;
  }, [roles]);

  const fetchData = useCallback(async () => {
    try {
      const [memRes, roleRes] = await Promise.all([
        apiClient.get<{ status: string; data: TeamMember[] }>(endpoints.admin.team.list),
        apiClient.get<{ status: string; data: Role[] }>(endpoints.admin.roles.list),
      ]);
      setMembers(memRes.data);
      setRoles(roleRes.data);
      setLoadError(null);
    } catch (err) {
      const apiErr = err as ApiError;
      setLoadError(apiErr.message || "Failed to load team");
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function changeRole(member: TeamMember, role: string, mfaCode: string) {
    setUpdatingId(member.id);
    setRowError(null);
    setStepUpError(null);
    try {
      const res = await apiClient.patch<{ status: string; data: TeamMember; code?: string }>(
        endpoints.admin.team.role(member.id),
        { role, mfa_code: mfaCode },
      );
      if (res.status === "success") {
        setMembers((prev) =>
          prev ? prev.map((m) => (m.id === member.id ? res.data : m)) : prev,
        );
        // Success — close both the demote confirm and step-up modals.
        setConfirmDemote(null);
        setPendingRoleChange(null);
      }
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr.message;
      // Wrong code: keep the step-up modal open so the operator can
      // retry without restarting the whole flow.
      if (code === "auth.mfa_invalid_code") {
        setStepUpError("That code didn't work. Try again with the current 6-digit code.");
        return;
      }
      if (code === "auth.mfa_required_for_action") {
        setStepUpError("A 2FA code is required.");
        return;
      }
      // Everything else is a hard fail — surface inline on the row and
      // close the modals so the operator isn't stuck.
      let message = "Couldn't change role";
      if (code === "admin.team.cant_demote_self") {
        message = "You can't change your own role.";
      } else if (code === "admin.team.last_owner") {
        message = "Can't demote the last Owner. Promote someone else to Owner first.";
      } else if (code === "admin.team.not_staff") {
        message = "That account isn't staff.";
      } else if (code === "auth.permission_denied") {
        message = "You don't have permission to change roles.";
      }
      setRowError({ id: member.id, message });
      setConfirmDemote(null);
      setPendingRoleChange(null);
    } finally {
      setUpdatingId(null);
    }
  }

  function handleRoleChange(member: TeamMember, newRole: string) {
    // No-op if the role didn't actually change — saves the user from
    // typing their 2FA code for nothing.
    if (member.role === newRole) return;
    // Demoting an Owner is destructive — surface a confirmation first,
    // then chain into the step-up modal once they confirm.
    if (member.role === "OWNER" && newRole !== "OWNER") {
      setConfirmDemote({ member, newRole });
      return;
    }
    setPendingRoleChange({ member, newRole });
  }

  async function removeFromAdmins(member: TeamMember, mfaCode: string) {
    setUpdatingId(member.id);
    setRemoveStepUpError(null);
    setRowError(null);
    try {
      await apiClient.post(endpoints.admin.team.demote(member.id), { mfa_code: mfaCode });
      // Demoted user falls out of the staff list — remove locally
      // rather than re-fetching the whole list.
      setMembers((prev) => (prev ? prev.filter((m) => m.id !== member.id) : prev));
      setPendingRemove(null);
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr.message;
      if (code === "auth.mfa_invalid_code") {
        setRemoveStepUpError("That code didn't work. Try again with the current 6-digit code.");
        return;
      }
      if (code === "auth.mfa_required_for_action") {
        setRemoveStepUpError("A 2FA code is required.");
        return;
      }
      let message = "Couldn't remove from admins";
      if (code === "admin.team.cant_demote_self") {
        message = "You can't remove yourself from admins.";
      } else if (code === "admin.team.last_owner") {
        message = "Can't remove the last Owner. Promote someone else to Owner first.";
      } else if (code === "auth.permission_denied") {
        message = "You don't have permission to remove admins.";
      }
      setRowError({ id: member.id, message });
      setPendingRemove(null);
    } finally {
      setUpdatingId(null);
    }
  }

  const sortedMembers = useMemo(() => {
    if (!members) return null;
    // Owners first, then alphabetical
    return [...members].sort((a, b) => {
      if (a.role === "OWNER" && b.role !== "OWNER") return -1;
      if (b.role === "OWNER" && a.role !== "OWNER") return 1;
      return a.email.localeCompare(b.email);
    });
  }, [members]);

  if (loadError) {
    return (
      <p
        style={{
          background: "rgba(198,40,40,0.08)",
          border: "1px solid rgba(198,40,40,0.2)",
          color: "var(--error)",
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          padding: "var(--space-4)",
          borderRadius: "var(--radius-md)",
        }}
      >
        {loadError}
      </p>
    );
  }

  if (!sortedMembers || !roles) {
    return (
      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
        Loading team…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPromoteOpen(true)}
            className="btn-gold flex items-center gap-2 rounded-md px-4 py-2.5"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <UserPlus size={14} />
            Promote customer
          </button>
        </div>
      )}

      {!canManage && (
        <p
          style={{
            background: "rgba(187,148,41,0.05)",
            border: "1px solid var(--bg-border)",
            color: "var(--white-dim)",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
          }}
        >
          You can see who's on the team but only Owners can change roles.
        </p>
      )}

      <div
        className="overflow-hidden rounded-md"
        style={{ border: "1px solid var(--bg-border)" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--bg-tertiary)" }}>
            <tr>
              <Th>Name & email</Th>
              <Th>Role</Th>
              <Th>2FA</Th>
              <Th>Status</Th>
              {canManage && <Th>&nbsp;</Th>}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((m) => {
              const isSelf = m.id === currentUser?.id;
              const isRowUpdating = updatingId === m.id;
              return (
                <tr key={m.id} style={{ borderTop: "1px solid var(--bg-border)" }}>
                  <Td>
                    <div style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)", fontWeight: "var(--weight-medium)" }}>
                      {m.first_name} {m.last_name}
                      {isSelf && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: "var(--text-xs)",
                            color: "var(--gold-dark)",
                            fontWeight: "var(--weight-regular)",
                          }}
                        >
                          (you)
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 2 }}>
                      {m.email}
                    </div>
                    {rowError && rowError.id === m.id && (
                      <p
                        style={{
                          marginTop: 6,
                          color: "var(--error)",
                          fontFamily: "var(--font-montserrat)",
                          fontSize: "var(--text-xs)",
                        }}
                      >
                        {rowError.message}
                      </p>
                    )}
                  </Td>
                  <Td>
                    {canManage && !isSelf ? (
                      <select
                        value={m.role || "AUDITOR"}
                        disabled={isRowUpdating}
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                        style={{
                          background: "var(--bg-tertiary)",
                          border: "1px solid var(--bg-border)",
                          color: "var(--white)",
                          fontFamily: "var(--font-montserrat)",
                          fontSize: "var(--text-sm)",
                          borderRadius: "var(--radius-md)",
                          padding: "6px 10px",
                          cursor: isRowUpdating ? "wait" : "pointer",
                          minWidth: 180,
                        }}
                      >
                        {/* Show system roles first, then customs */}
                        <optgroup label="System roles">
                          {roles
                            .filter((r) => r.is_system)
                            .map((r) => (
                              <option key={r.code} value={r.code}>
                                {r.name}
                              </option>
                            ))}
                        </optgroup>
                        {roles.some((r) => !r.is_system) && (
                          <optgroup label="Custom roles">
                            {roles
                              .filter((r) => !r.is_system)
                              .map((r) => (
                                <option key={r.code} value={r.code}>
                                  {r.name}
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>
                    ) : (
                      <span
                        title={isSelf ? "You can't change your own role." : roleMeta[m.role]?.description ?? ""}
                        style={{
                          fontFamily: "var(--font-montserrat)",
                          fontSize: "var(--text-sm)",
                          color: m.role === "OWNER" ? "var(--gold)" : "var(--white-dim)",
                          fontWeight: m.role === "OWNER" ? "var(--weight-medium)" : "var(--weight-regular)",
                        }}
                      >
                        {roleMeta[m.role]?.name ?? m.role}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {m.mfa_enabled ? (
                      <span style={{ color: "var(--success, #4ade80)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}>
                        On
                      </span>
                    ) : (
                      <span style={{ color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}>
                        Off
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span
                      style={{
                        fontFamily: "var(--font-montserrat)",
                        fontSize: "var(--text-xs)",
                        color: m.is_active ? "var(--white-dim)" : "var(--white-faint)",
                      }}
                    >
                      {m.is_active ? "Active" : "Disabled"}
                    </span>
                  </Td>
                  {canManage && (
                    <Td>
                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(m)}
                          disabled={isRowUpdating}
                          aria-label={`Remove ${m.email} from admins`}
                          title="Remove from admins (turn back into a customer)"
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50 hover:bg-[rgba(198,40,40,0.08)]"
                          style={{
                            border: "1px solid rgba(198,40,40,0.3)",
                            color: "var(--error)",
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            background: "transparent",
                          }}
                        >
                          <UserMinus size={12} />
                          Remove
                        </button>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
        <summary style={{ cursor: "pointer", color: "var(--white-dim)" }}>
          What each role can do
        </summary>
        <ul style={{ marginTop: 10, lineHeight: 1.7, listStyle: "disc", paddingLeft: 18 }}>
          {roles.map((r) => (
            <li key={r.code}>
              <strong style={{ color: "var(--white-dim)" }}>{r.name}:</strong>{" "}
              {r.description || `${r.permissions.length} permissions`}
              {!r.is_system && (
                <span style={{ color: "var(--gold-dark)", marginLeft: 6 }}>(custom)</span>
              )}
            </li>
          ))}
        </ul>
      </details>

      {confirmDemote && (
        <div
          role="dialog"
          aria-label="Confirm demote owner"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setConfirmDemote(null)}
        >
          <div
            className="max-w-md rounded-lg"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
              padding: "var(--space-6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3" style={{ marginBottom: "var(--space-4)" }}>
              <ShieldAlert size={24} style={{ color: "var(--error)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "var(--text-xl)",
                    color: "var(--white)",
                  }}
                >
                  Demote Owner?
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-sm)",
                    color: "var(--white-dim)",
                    marginTop: "var(--space-2)",
                    lineHeight: 1.6,
                  }}
                >
                  {confirmDemote.member.email} will lose Owner access and become{" "}
                  <strong>{roleMeta[confirmDemote.newRole]?.name ?? confirmDemote.newRole}</strong>. They won't be able to
                  manage roles or reach Owner-only endpoints anymore.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDemote(null)}
                className="flex-1 rounded-md py-2.5"
                style={{
                  border: "1px solid var(--bg-border)",
                  color: "var(--white-dim)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Chain into step-up: keep `pendingRoleChange` in
                  // sync with what the operator just confirmed, then
                  // close the demote confirmation. The MfaStepUpModal
                  // (mounted below) appears next.
                  setPendingRoleChange({
                    member: confirmDemote.member,
                    newRole: confirmDemote.newRole,
                  });
                  setConfirmDemote(null);
                }}
                disabled={updatingId === confirmDemote.member.id}
                className="flex-1 rounded-md py-2.5 disabled:opacity-50"
                style={{
                  background: "var(--error)",
                  color: "var(--white)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--weight-semibold)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <MfaStepUpModal
        open={pendingRoleChange !== null}
        title="Confirm role change"
        body={
          pendingRoleChange ? (
            <>
              Change <strong>{pendingRoleChange.member.email}</strong>'s role to{" "}
              <strong>{roleMeta[pendingRoleChange.newRole]?.name ?? pendingRoleChange.newRole}</strong>?
              Enter your 2FA code to confirm.
            </>
          ) : null
        }
        error={stepUpError}
        pending={updatingId !== null}
        confirmLabel="Change role"
        onConfirm={(code) => {
          if (pendingRoleChange) {
            void changeRole(pendingRoleChange.member, pendingRoleChange.newRole, code);
          }
        }}
        onCancel={() => {
          setPendingRoleChange(null);
          setStepUpError(null);
        }}
      />

      {roles && (
        <PromoteCustomerModal
          open={promoteOpen}
          roles={roles}
          onCancel={() => setPromoteOpen(false)}
          onSuccess={() => {
            setPromoteOpen(false);
            void fetchData();
          }}
        />
      )}

      {/* "Remove from admins" two-step flow: confirmation → step-up MFA. */}
      {confirmRemove && (
        <div
          role="dialog"
          aria-label="Confirm remove from admins"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="max-w-md rounded-lg"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
              padding: "var(--space-6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3" style={{ marginBottom: "var(--space-4)" }}>
              <UserMinus size={22} style={{ color: "var(--error)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
                  Remove from admins?
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-sm)",
                    color: "var(--white-dim)",
                    marginTop: "var(--space-2)",
                    lineHeight: 1.6,
                  }}
                >
                  <strong>{confirmRemove.email}</strong> will turn back into a regular customer.
                  Their account, order history, and addresses all stay intact — they just
                  won't be able to reach the admin panel anymore. You can promote them again
                  later if needed.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 rounded-md py-2.5"
                style={{
                  border: "1px solid var(--bg-border)",
                  color: "var(--white-dim)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPendingRemove(confirmRemove);
                  setConfirmRemove(null);
                }}
                className="flex-1 rounded-md py-2.5"
                style={{
                  background: "var(--error)",
                  color: "var(--white)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--weight-semibold)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <MfaStepUpModal
        open={pendingRemove !== null}
        title="Confirm removal"
        body={
          pendingRemove ? (
            <>
              Remove <strong>{pendingRemove.email}</strong> from admins? Enter your 2FA code to
              confirm.
            </>
          ) : null
        }
        error={removeStepUpError}
        pending={updatingId !== null}
        confirmLabel="Remove admin"
        onConfirm={(code) => {
          if (pendingRemove) {
            void removeFromAdmins(pendingRemove, code);
          }
        }}
        onCancel={() => {
          setPendingRemove(null);
          setRemoveStepUpError(null);
        }}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        fontFamily: "var(--font-montserrat)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        color: "var(--white-faint)",
        letterSpacing: "var(--tracking-wide)",
        textTransform: "uppercase",
        padding: "12px 16px",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "12px 16px", verticalAlign: "top" }}>{children}</td>;
}
