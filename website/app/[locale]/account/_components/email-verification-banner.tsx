"use client";

import { useEffect, useState } from "react";
import { Mail, Send, Loader2 } from "lucide-react";
import { toast } from "@heroui/react";
import { useAuth } from "@/lib/auth-context";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

/**
 * Persistent banner that appears on every /account/* page when the logged-in
 * customer hasn't yet clicked the verification link in their welcome email.
 *
 * Backend throttle: 3/min per user (apps/accounts/throttling.py
 * ResendVerificationThrottle). We add a 60-second client-side cooldown on
 * top of that to prevent the customer from spamming the button — and we
 * persist the cooldown in localStorage so refreshing the page doesn't
 * reset it (otherwise a customer could refresh-then-click N times).
 */

const COOLDOWN_SECONDS = 60;
const STORAGE_KEY = "tph-last-verification-resend";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [resending, setResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Restore cooldown from localStorage on mount — survives page reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const lastSent = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    if (!lastSent) return;
    const elapsed = Math.floor((Date.now() - lastSent) / 1000);
    const remaining = COOLDOWN_SECONDS - elapsed;
    if (remaining > 0) setCooldownSeconds(remaining);
  }, []);

  // Tick the cooldown down to zero, one second at a time.
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setTimeout(() => setCooldownSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldownSeconds]);

  // Only render once we have a real user AND they aren't verified.
  // Returning null during the initial auth-fetch avoids a flicker.
  if (!user || user.is_email_verified) return null;

  async function handleResend() {
    if (resending || cooldownSeconds > 0) return;
    setResending(true);
    try {
      await apiClient.post(endpoints.auth.resendVerification);
      toast.success(`Verification email sent to ${user!.email} — check your inbox`);
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      setCooldownSeconds(COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          toast.warning("Too many requests — try again in a minute");
          // Backend has 3/min throttle; lock the button for a full minute
          // so the customer doesn't keep hammering 429.
          localStorage.setItem(STORAGE_KEY, Date.now().toString());
          setCooldownSeconds(COOLDOWN_SECONDS);
        } else if (typeof err.message === "string" && err.message.includes("already_verified")) {
          toast.warning("Your email is already verified — refresh the page");
        } else {
          toast.danger("Couldn't send — please try again");
        }
      } else {
        toast.danger("Couldn't send — please try again");
      }
    } finally {
      setResending(false);
    }
  }

  const disabled = resending || cooldownSeconds > 0;
  const buttonLabel = resending
    ? "Sending…"
    : cooldownSeconds > 0
      ? `Wait ${cooldownSeconds}s`
      : "Resend email";

  return (
    <div
      style={{
        background: "rgba(230,81,0,0.08)",
        borderBottom: "1px solid rgba(230,81,0,0.3)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(230,81,0,0.15)", color: "var(--warning)" }}
        >
          <Mail size={16} />
        </div>
        <div className="flex-1">
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--white)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            Your email isn&apos;t verified yet
          </p>
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-dim)",
              marginTop: 2,
            }}
          >
            We sent a confirmation link to <strong style={{ color: "var(--white)" }}>{user.email}</strong>. Click it to unlock checkout and reviews.
          </p>
        </div>
        <button
          onClick={handleResend}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 disabled:opacity-60"
          style={{
            background: disabled ? "var(--bg-tertiary)" : "var(--warning)",
            color: disabled ? "var(--white-faint)" : "#fff",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "var(--tracking-wide)",
            whiteSpace: "nowrap",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {resending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : cooldownSeconds === 0 ? (
            <Send size={12} />
          ) : null}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
