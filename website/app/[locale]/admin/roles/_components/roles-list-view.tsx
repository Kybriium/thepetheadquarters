"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import { useAdminPermission } from "@/hooks/use-admin-permission";
import type { Role } from "@/types/rbac";

export function RolesListView() {
  const router = useRouter();
  const canManage = useAdminPermission("team.manage");

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);
  const [rowError, setRowError] = useState<{ code: string; message: string } | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await apiClient.get<{ status: string; data: Role[] }>(endpoints.admin.roles.list);
      setRoles(res.data);
      setLoadError(null);
    } catch (err) {
      const apiErr = err as ApiError;
      setLoadError(apiErr.message || "Failed to load roles");
    }
  }, []);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  async function handleClone(role: Role) {
    setWorking(role.code);
    setRowError(null);
    try {
      const res = await apiClient.post<{ status: string; data: Role }>(
        endpoints.admin.roles.clone(role.code),
      );
      if (res.status === "success") {
        // Navigate straight into editing the clone.
        router.push(`/admin/roles/${res.data.code}`);
      }
    } catch (err) {
      const apiErr = err as ApiError;
      setRowError({ code: role.code, message: apiErr.message || "Clone failed" });
    } finally {
      setWorking(null);
    }
  }

  async function handleDelete(role: Role) {
    setWorking(role.code);
    setRowError(null);
    try {
      await apiClient.del(endpoints.admin.roles.detail(role.code));
      setRoles((prev) => (prev ? prev.filter((r) => r.code !== role.code) : prev));
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr.message;
      let message = "Delete failed";
      if (code === "admin.roles.in_use") {
        message = "This role is assigned to one or more admins. Reassign them first.";
      } else if (code === "admin.roles.system_role_locked") {
        message = "System roles can't be deleted — clone them instead.";
      } else if (code === "auth.permission_denied") {
        message = "You don't have permission to delete roles.";
      }
      setRowError({ code: role.code, message });
    } finally {
      setWorking(null);
      setConfirmDelete(null);
    }
  }

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

  if (!roles) {
    return (
      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
        Loading roles…
      </p>
    );
  }

  const systemRoles = roles.filter((r) => r.is_system);
  const customRoles = roles.filter((r) => !r.is_system);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            color: "var(--white-faint)",
            lineHeight: 1.6,
            maxWidth: 540,
          }}
        >
          Roles bundle a set of permissions. System roles are templates — clone one
          to make your own. The permissions you pick on a custom role apply to every
          admin you assign it to.
        </p>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/admin/roles/new")}
              className="btn-gold flex items-center gap-2 rounded-md px-4 py-2.5"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-semibold)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              <Plus size={14} />
              New custom role
            </button>
          </div>
        )}
      </div>

      <RoleSection title="System roles" subtitle="Templates shipped with the app. Clone to customise." roles={systemRoles}>
        {(role) => (
          <RoleRow
            key={role.code}
            role={role}
            canManage={canManage}
            working={working === role.code}
            rowError={rowError?.code === role.code ? rowError.message : null}
            onEdit={() => router.push(`/admin/roles/${role.code}`)}
            onClone={() => handleClone(role)}
            onDelete={() => setConfirmDelete(role)}
          />
        )}
      </RoleSection>

      <RoleSection
        title="Custom roles"
        subtitle={customRoles.length === 0 ? "No custom roles yet. Clone a system role above or create one from scratch." : null}
        roles={customRoles}
      >
        {(role) => (
          <RoleRow
            key={role.code}
            role={role}
            canManage={canManage}
            working={working === role.code}
            rowError={rowError?.code === role.code ? rowError.message : null}
            onEdit={() => router.push(`/admin/roles/${role.code}`)}
            onClone={() => handleClone(role)}
            onDelete={() => setConfirmDelete(role)}
          />
        )}
      </RoleSection>

      {confirmDelete && (
        <div
          role="dialog"
          aria-label="Confirm delete role"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setConfirmDelete(null)}
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
            <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              Delete role?
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
              <strong>{confirmDelete.name}</strong> will be removed permanently.{" "}
              {confirmDelete.assigned_user_count > 0 && (
                <span style={{ color: "var(--error)" }}>
                  Currently assigned to {confirmDelete.assigned_user_count} admin
                  {confirmDelete.assigned_user_count > 1 ? "s" : ""} — you'll need to reassign them first.
                </span>
              )}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
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
                onClick={() => handleDelete(confirmDelete)}
                disabled={working === confirmDelete.code}
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleSection({
  title,
  subtitle,
  roles,
  children,
}: {
  title: string;
  subtitle?: string | null;
  roles: Role[];
  children: (role: Role) => React.ReactNode;
}) {
  return (
    <section>
      <h2
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-xl)",
          color: "var(--white)",
          marginBottom: "var(--space-2)",
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white-faint)",
            marginBottom: "var(--space-3)",
          }}
        >
          {subtitle}
        </p>
      )}
      <div
        className="flex flex-col rounded-md overflow-hidden"
        style={{ border: "1px solid var(--bg-border)" }}
      >
        {roles.length === 0 ? null : roles.map(children)}
      </div>
    </section>
  );
}

function RoleRow({
  role,
  canManage,
  working,
  rowError,
  onEdit,
  onClone,
  onDelete,
}: {
  role: Role;
  canManage: boolean;
  working: boolean;
  rowError: string | null;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        padding: "var(--space-4) var(--space-5)",
        borderTop: "1px solid var(--bg-border)",
        background: "var(--bg-secondary)",
      }}
      className="flex flex-col gap-2 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-medium)",
              color: role.is_system ? "var(--gold)" : "var(--white)",
            }}
          >
            {role.name}
          </span>
          {role.is_system && (
            <span
              title="System role — clone to customise"
              className="inline-flex items-center gap-1"
              style={{
                background: "rgba(187,148,41,0.1)",
                border: "1px solid rgba(187,148,41,0.3)",
                borderRadius: 999,
                padding: "2px 8px",
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--gold)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              <ShieldCheck size={10} />
              System
            </span>
          )}
        </div>
        {role.description && (
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-faint)",
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {role.description}
          </p>
        )}
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-faint)",
            marginTop: 4,
          }}
        >
          {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
          {role.assigned_user_count > 0 && (
            <> · Assigned to {role.assigned_user_count} admin{role.assigned_user_count === 1 ? "" : "s"}</>
          )}
        </p>
        {rowError && (
          <p style={{ marginTop: 6, color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: 11 }}>
            {rowError}
          </p>
        )}
      </div>

      <div className="flex gap-1.5">
        <IconButton onClick={onEdit} label={role.is_system ? "View" : "Edit"} disabled={working}>
          <Pencil size={13} />
        </IconButton>
        {canManage && (
          <IconButton onClick={onClone} label="Clone" disabled={working}>
            <Copy size={13} />
          </IconButton>
        )}
        {canManage && !role.is_system && (
          <IconButton onClick={onDelete} label="Delete" variant="danger" disabled={working}>
            <Trash2 size={13} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  variant,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  variant?: "danger";
  disabled?: boolean;
}) {
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
      style={{
        border: `1px solid ${isDanger ? "rgba(198,40,40,0.3)" : "var(--bg-border)"}`,
        color: isDanger ? "var(--error)" : "var(--white-dim)",
        fontFamily: "var(--font-montserrat)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: "transparent",
      }}
    >
      {children}
      {label}
    </button>
  );
}
