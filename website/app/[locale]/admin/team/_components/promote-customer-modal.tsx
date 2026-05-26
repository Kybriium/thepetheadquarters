"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { Role } from "@/types/rbac";
import { MfaStepUpModal } from "../../_components/mfa-step-up-modal";

interface CustomerHit {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface PromoteCustomerModalProps {
  open: boolean;
  roles: Role[];
  onCancel: () => void;
  // Called after the promote succeeds so the parent can refresh its
  // staff list and any other derived UI.
  onSuccess: () => void;
}

export function PromoteCustomerModal({
  open,
  roles,
  onCancel,
  onSuccess,
}: PromoteCustomerModalProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerHit | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Reset when the modal opens — wipes any state left from a previous
  // session so we don't accidentally promote the wrong person.
  useEffect(() => {
    if (open) {
      setSearch("");
      setResults(null);
      setSelected(null);
      setRoleCode(roles.find((r) => r.code === "AUDITOR")?.code ?? roles[0]?.code ?? "");
      setStepUpOpen(false);
      setStepUpError(null);
      setSearchError(null);
    }
  }, [open, roles]);

  // Debounced customer search.
  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    if (term.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ results: CustomerHit[] }>(
          `${endpoints.admin.customers.list}?search=${encodeURIComponent(term)}&page_size=8`,
        );
        if (!cancelled) {
          setResults(res.results ?? []);
          setSearchError(null);
        }
      } catch (err) {
        if (!cancelled) setSearchError((err as ApiError).message || "Search failed");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, open]);

  const submit = useCallback(
    async (mfaCode: string) => {
      if (!selected || !roleCode) return;
      setPending(true);
      setStepUpError(null);
      try {
        await apiClient.post(endpoints.admin.team.promote, {
          user_id: selected.id,
          role: roleCode,
          mfa_code: mfaCode,
        });
        setStepUpOpen(false);
        onSuccess();
      } catch (err) {
        const apiErr = err as ApiError;
        const code = apiErr.message;
        if (code === "auth.mfa_invalid_code") {
          setStepUpError("That code didn't work. Try again with the current 6-digit code.");
        } else if (code === "auth.mfa_required_for_action") {
          setStepUpError("A 2FA code is required.");
        } else if (code === "admin.team.already_staff") {
          setStepUpError("That account is already an admin.");
        } else {
          setStepUpError("Couldn't promote — please try again.");
        }
      } finally {
        setPending(false);
      }
    },
    [selected, roleCode, onSuccess],
  );

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="Promote customer to admin"
        className="fixed inset-0 z-40 flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onCancel}
      >
        <div
          className="w-full max-w-lg rounded-lg"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--bg-border)",
            padding: "var(--space-6)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <UserPlus size={22} style={{ color: "var(--gold)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
                  Promote customer to admin
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-sm)",
                    color: "var(--white-faint)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  Search by email or name. The customer will be force-redirected to set up 2FA on
                  their next login before they can reach any admin endpoint.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="rounded-md p-1.5"
              style={{ color: "var(--white-faint)", background: "transparent", border: "none" }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Customer search */}
          <div style={{ marginTop: "var(--space-5)" }}>
            <label style={labelStyle}>Find a customer</label>
            <div className="relative">
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--white-faint)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected(null);
                }}
                placeholder="Email, first name, or last name"
                className="w-full outline-none"
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>

            {searchError && (
              <p style={{ ...errorTextStyle, marginTop: 4 }}>{searchError}</p>
            )}

            {!selected && results && results.length > 0 && (
              <ul
                className="mt-2 overflow-hidden rounded-md"
                style={{ border: "1px solid var(--bg-border)", maxHeight: 240, overflowY: "auto" }}
              >
                {results.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      padding: "10px 14px",
                      cursor: "pointer",
                      borderTop: "1px solid var(--bg-border)",
                      background: "var(--bg-tertiary)",
                    }}
                    className="hover:bg-[rgba(187,148,41,0.08)] first:border-t-0"
                    onClick={() => setSelected(c)}
                  >
                    <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>
                      {c.first_name} {c.last_name}
                    </p>
                    <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                      {c.email}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {!selected && results && results.length === 0 && search.trim().length >= 2 && (
              <p
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  color: "var(--white-faint)",
                  marginTop: 8,
                }}
              >
                No customers match that search. Note: existing admins are filtered out.
              </p>
            )}

            {selected && (
              <div
                className="mt-2 flex items-center justify-between gap-3 rounded-md p-3"
                style={{
                  border: "1px solid var(--gold)",
                  background: "rgba(187,148,41,0.05)",
                }}
              >
                <div>
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)", fontWeight: "var(--weight-medium)" }}>
                    {selected.first_name} {selected.last_name}
                  </p>
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                    {selected.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Clear selection"
                  style={{ color: "var(--white-faint)", background: "transparent", border: "none" }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Role picker — only shown after a customer is selected */}
          {selected && (
            <div style={{ marginTop: "var(--space-5)" }}>
              <label style={labelStyle}>Assign role</label>
              <select
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                className="w-full outline-none"
                style={inputStyle}
              >
                <optgroup label="System roles">
                  {roles.filter((r) => r.is_system).map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
                {roles.some((r) => !r.is_system) && (
                  <optgroup label="Custom roles">
                    {roles.filter((r) => !r.is_system).map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {roleCode && (
                <p
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-xs)",
                    color: "var(--white-faint)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {roles.find((r) => r.code === roleCode)?.description}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
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
              type="button"
              onClick={() => setStepUpOpen(true)}
              disabled={!selected || !roleCode}
              className="btn-gold flex-1 rounded-md py-2.5 disabled:opacity-50"
              style={{
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

      <MfaStepUpModal
        open={stepUpOpen}
        title="Confirm promotion"
        body={
          selected ? (
            <>
              You're about to make <strong>{selected.email}</strong> an admin with the{" "}
              <strong>{roles.find((r) => r.code === roleCode)?.name}</strong> role. Enter your 2FA
              code to confirm.
            </>
          ) : null
        }
        error={stepUpError}
        pending={pending}
        confirmLabel="Promote"
        onConfirm={submit}
        onCancel={() => {
          setStepUpOpen(false);
          setStepUpError(null);
        }}
      />
    </>
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
  color: "var(--error)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-xs)",
};
