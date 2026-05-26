"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

interface MfaStepUpModalProps {
  open: boolean;
  title: string;
  // Short message explaining what's about to happen so the operator
  // can confirm they're acting on the right thing.
  body: React.ReactNode;
  // Inline error text — shown beneath the input. Parent controls it
  // so the same component can surface "wrong code" without owning
  // the API call.
  error?: string | null;
  pending?: boolean;
  confirmLabel?: string;
  onConfirm: (code: string) => void;
  onCancel: () => void;
}

/**
 * Re-prompt the admin for their 2FA code before a sensitive action.
 *
 * Used for: changing someone's role, promoting a customer to admin,
 * and any other "the session cookie isn't enough" action that should
 * fail closed even if a tab is left open.
 *
 * Accepts either a 6-digit TOTP or an 8-character backup code — the
 * backend (verify_step_up) picks the right path. We don't enforce
 * length on the frontend beyond a soft minimum so the input stays
 * forgiving.
 */
export function MfaStepUpModal({
  open,
  title,
  body,
  error,
  pending,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: MfaStepUpModalProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Wipe any leftover code from a prior open so the operator
      // never accidentally re-submits a stale value.
      setCode("");
      // Focus next tick so the modal has finished animating in.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 6) {
      onConfirm(code.trim());
    }
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          padding: "var(--space-6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={22} style={{ color: "var(--gold)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <h3
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "var(--text-xl)",
                  color: "var(--white)",
                }}
              >
                {title}
              </h3>
              <div
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-sm)",
                  color: "var(--white-dim)",
                  marginTop: "var(--space-2)",
                  lineHeight: 1.6,
                }}
              >
                {body}
              </div>
            </div>
          </div>

          <div>
            <label
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-dim)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "var(--space-2)",
              }}
            >
              Your 2FA code
            </label>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.trim().slice(0, 16))}
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              className="w-full text-center outline-none"
              style={{
                background: "var(--bg-tertiary)",
                border: `1px solid ${error ? "var(--error)" : "var(--bg-border)"}`,
                color: "var(--white)",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: "var(--text-xl)",
                letterSpacing: "0.4em",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
              }}
            />
            <p
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: error ? "var(--error)" : "var(--white-faint)",
                marginTop: "var(--space-2)",
              }}
            >
              {error || "6-digit code from your authenticator app or an 8-character backup code."}
            </p>
          </div>

          <div className="flex gap-3 mt-2">
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
              type="submit"
              disabled={pending || code.trim().length < 6}
              className="btn-gold flex-1 rounded-md py-2.5 disabled:opacity-50"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-semibold)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              {pending ? "Verifying…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
