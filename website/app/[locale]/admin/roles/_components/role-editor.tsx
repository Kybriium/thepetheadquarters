"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, Lock, ShieldCheck } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import { useAdminPermission } from "@/hooks/use-admin-permission";
import type { PermissionCatalogue, PermissionGroup, Role } from "@/types/rbac";

interface RoleEditorProps {
  // When `code` is "new", we're creating from scratch. Otherwise it's
  // an existing role's code (e.g. "OWNER" or "dispatch_lead").
  code: string;
}

export function RoleEditor({ code }: RoleEditorProps) {
  const router = useRouter();
  const canManage = useAdminPermission("team.manage");
  const isNew = code === "new";

  const [role, setRole] = useState<Role | null>(null);
  const [catalogue, setCatalogue] = useState<PermissionCatalogue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load the catalogue once.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ status: string; data: PermissionCatalogue }>(endpoints.admin.roles.catalogue)
      .then((res) => {
        if (cancelled) return;
        setCatalogue(res.data);
        // Open all groups by default so the user immediately sees the
        // shape of what they can pick. They can collapse what they
        // don't care about.
        setOpenGroups(new Set(res.data.groups.map((g) => g.code)));
      })
      .catch((err: ApiError) => {
        if (!cancelled) setLoadError(err.message || "Failed to load catalogue");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the role itself (skip when creating new).
  useEffect(() => {
    if (isNew) {
      setRole({
        code: "new",
        name: "",
        description: "",
        permissions: [],
        is_system: false,
        assigned_user_count: 0,
        created_at: "",
        updated_at: "",
      });
      return;
    }
    let cancelled = false;
    apiClient
      .get<{ status: string; data: Role }>(endpoints.admin.roles.detail(code))
      .then((res) => {
        if (cancelled) return;
        setRole(res.data);
        setName(res.data.name);
        setDescription(res.data.description);
        setPermissions(new Set(res.data.permissions));
      })
      .catch((err: ApiError) => {
        if (!cancelled) setLoadError(err.message || "Failed to load role");
      });
    return () => {
      cancelled = true;
    };
  }, [code, isNew]);

  const isSystem = role?.is_system === true;
  const readOnly = isSystem || !canManage;

  const toggleGroup = useCallback((groupCode: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupCode)) next.delete(groupCode);
      else next.add(groupCode);
      return next;
    });
  }, []);

  function togglePermission(permCode: string) {
    if (readOnly) return;
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permCode)) next.delete(permCode);
      else next.add(permCode);
      return next;
    });
  }

  function toggleGroupAll(group: PermissionGroup, selected: boolean) {
    if (readOnly) return;
    setPermissions((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (selected) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  }

  async function handleSave() {
    setPending(true);
    setSubmitError(null);
    setValidationErrors({});
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        permissions: Array.from(permissions),
      };
      if (isNew) {
        const res = await apiClient.post<{ status: string; data: Role }>(
          endpoints.admin.roles.list,
          body,
        );
        router.push(`/admin/roles/${res.data.code}`);
      } else {
        await apiClient.patch(endpoints.admin.roles.detail(code), body);
        router.push("/admin/roles");
      }
    } catch (err) {
      const apiErr = err as ApiError;
      const apiCode = apiErr.message;
      if (apiCode === "common.validation_error" && apiErr.body?.errors) {
        setValidationErrors(apiErr.body.errors as Record<string, string>);
      } else if (apiCode === "admin.roles.system_role_locked") {
        setSubmitError("System roles can't be edited. Clone this role to customise it.");
      } else if (apiCode === "auth.permission_denied") {
        setSubmitError("You don't have permission to edit roles.");
      } else {
        setSubmitError("Couldn't save the role. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  async function handleClone() {
    setPending(true);
    setSubmitError(null);
    try {
      const res = await apiClient.post<{ status: string; data: Role }>(
        endpoints.admin.roles.clone(code),
      );
      router.push(`/admin/roles/${res.data.code}`);
    } catch (err) {
      setSubmitError("Couldn't clone the role. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Filter UI based on text search across the catalogue.
  const [search, setSearch] = useState("");
  const filteredGroups = useMemo(() => {
    if (!catalogue) return [];
    const term = search.trim().toLowerCase();
    if (!term) return catalogue.groups;
    return catalogue.groups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(term) ||
            p.label.toLowerCase().includes(term) ||
            p.hint.toLowerCase().includes(term),
        ),
      }))
      .filter((g) => g.permissions.length > 0 || g.label.toLowerCase().includes(term));
  }, [catalogue, search]);

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

  if (!role || !catalogue) {
    return (
      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
        Loading…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href="/admin/roles"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--gold-dark)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          ← All roles
        </Link>
        {isSystem && (
          <button
            onClick={handleClone}
            disabled={!canManage || pending}
            className="flex items-center gap-2 rounded-md px-4 py-2 disabled:opacity-50"
            style={{
              border: "1px solid var(--gold)",
              background: "rgba(187,148,41,0.05)",
              color: "var(--gold)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <Copy size={12} />
            Clone to edit
          </button>
        )}
      </div>

      {isSystem && (
        <div
          className="flex items-start gap-3 rounded-md p-4"
          style={{
            background: "rgba(187,148,41,0.05)",
            border: "1px solid rgba(187,148,41,0.2)",
          }}
        >
          <Lock size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)", lineHeight: 1.6 }}>
            <strong>System role</strong> — view-only. Use <strong>Clone to edit</strong> to make
            an editable copy you can adjust.
          </p>
        </div>
      )}

      <section
        className="rounded-md"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}
      >
        <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)", marginBottom: "var(--space-4)" }}>
          {isNew ? "Create custom role" : "Role details"}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Role name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="e.g. Dispatch Lead"
              className="w-full outline-none disabled:opacity-50"
              style={inputStyle}
            />
            {validationErrors.name && (
              <p style={errorTextStyle}>Name is required.</p>
            )}
          </div>
          {!isNew && (
            <div>
              <label style={labelStyle}>Code</label>
              <input
                type="text"
                value={role.code}
                disabled
                className="w-full outline-none"
                style={{ ...inputStyle, opacity: 0.5 }}
              />
            </div>
          )}
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          <label style={labelStyle}>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            placeholder="What does someone with this role do?"
            rows={2}
            className="w-full outline-none disabled:opacity-50"
            style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
          />
        </div>
      </section>

      <section
        className="rounded-md"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginBottom: "var(--space-4)" }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              Permissions
            </h2>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 4 }}>
              {permissions.size} of{" "}
              {catalogue.groups.reduce((n, g) => n + g.permissions.length, 0)} selected
            </p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions…"
            className="outline-none"
            style={{ ...inputStyle, width: 220 }}
          />
        </div>

        <div className="flex flex-col gap-2">
          {filteredGroups.map((group) => {
            const groupCodes = group.permissions.map((p) => p.code);
            const selectedInGroup = groupCodes.filter((c) => permissions.has(c)).length;
            const allSelected = selectedInGroup === groupCodes.length && groupCodes.length > 0;
            const noneSelected = selectedInGroup === 0;
            const isOpen = openGroups.has(group.code) || search.trim().length > 0;
            return (
              <div
                key={group.code}
                className="rounded-md"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--bg-border)",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.code)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3"
                  style={{ background: "transparent", border: "none", textAlign: "left" }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isOpen ? (
                      <ChevronDown size={14} style={{ color: "var(--white-faint)" }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: "var(--white-faint)" }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
                        {group.label}
                      </p>
                      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 2 }}>
                        {group.description}
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: 11,
                      color: noneSelected ? "var(--white-faint)" : allSelected ? "var(--gold)" : "var(--white-dim)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedInGroup}/{groupCodes.length}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--bg-border)", padding: "var(--space-3) var(--space-5) var(--space-4)" }}>
                    {!readOnly && (
                      <div className="flex justify-end" style={{ marginBottom: "var(--space-2)" }}>
                        <button
                          type="button"
                          onClick={() => toggleGroupAll(group, !allSelected)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--gold-dark)",
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            cursor: "pointer",
                          }}
                        >
                          {allSelected ? "Clear all" : "Select all"}
                        </button>
                      </div>
                    )}
                    <ul className="flex flex-col gap-2">
                      {group.permissions.map((perm) => {
                        const checked = permissions.has(perm.code);
                        return (
                          <li key={perm.code}>
                            <label
                              className="flex cursor-pointer items-start gap-3"
                              style={{
                                cursor: readOnly ? "default" : "pointer",
                                opacity: readOnly && !checked ? 0.6 : 1,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={readOnly}
                                onChange={() => togglePermission(perm.code)}
                                style={{
                                  marginTop: 3,
                                  width: 16,
                                  height: 16,
                                  accentColor: "var(--gold)",
                                  cursor: readOnly ? "default" : "pointer",
                                  flexShrink: 0,
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>
                                  {perm.label}
                                </p>
                                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 1 }}>
                                  {perm.hint}
                                </p>
                                <code
                                  style={{
                                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                                    fontSize: 10,
                                    color: "var(--white-faint)",
                                    opacity: 0.6,
                                  }}
                                >
                                  {perm.code}
                                </code>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {submitError && (
        <p
          style={{
            background: "rgba(198,40,40,0.08)",
            border: "1px solid rgba(198,40,40,0.2)",
            color: "var(--error)",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {submitError}
        </p>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-3">
          <Link
            href="/admin/roles"
            className="rounded-md px-5 py-2.5"
            style={{
              border: "1px solid var(--bg-border)",
              color: "var(--white-dim)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={pending || !name.trim()}
            className="btn-gold rounded-md px-5 py-2.5 disabled:opacity-50"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            {pending ? "Saving…" : isNew ? "Create role" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-xs)",
  fontWeight: "var(--weight-medium)",
  color: "var(--white-dim)",
  letterSpacing: "var(--tracking-wide)",
  textTransform: "uppercase",
  marginBottom: "var(--space-2)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-sm)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3) var(--space-4)",
};

const errorTextStyle: React.CSSProperties = {
  marginTop: 4,
  color: "var(--error)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-xs)",
};
