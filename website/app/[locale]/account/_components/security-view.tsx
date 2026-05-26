"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { endpoints } from "@/config/endpoints";
import { apiClient, ApiError } from "@/lib/api-client";
import type enAuth from "@/i18n/dictionaries/en/auth.json";

interface SecurityViewProps {
  dict: typeof enAuth;
  reason: string | null;
}

type Mode = "idle" | "disable" | "regenerate";

export function SecurityView({ dict, reason }: SecurityViewProps) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);

  if (!user) return null;

  const mfa = user.mfa;
  const t = dict.twoFactor;
  const adminRequired = user.mfa_required && reason === "admin_required";
  const enabledAt = mfa.enabled_at ? new Date(mfa.enabled_at) : null;

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setServerError("");
    try {
      await apiClient.post(endpoints.auth.mfaDisable, { password, code });
      await refreshUser();
      setMode("idle");
      setPassword("");
      setCode("");
    } catch (err) {
      const apiErr = err as ApiError;
      const c = apiErr.message;
      if (c === "auth.wrong_password") setServerError(t.disable.wrongPassword);
      else if (c === "auth.mfa_invalid_code") setServerError(t.disable.invalidCode);
      else setServerError(t.status.loadError);
    } finally {
      setPending(false);
    }
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setServerError("");
    try {
      const res = await apiClient.post<{ status: string; data: { backup_codes: string[] } }>(
        endpoints.auth.mfaRegenBackupCodes,
        { password, code },
      );
      if (res.status === "success") {
        setNewBackupCodes(res.data.backup_codes);
        setPassword("");
        setCode("");
      }
    } catch (err) {
      const apiErr = err as ApiError;
      const c = apiErr.message;
      if (c === "auth.wrong_password") setServerError(t.disable.wrongPassword);
      else if (c === "auth.mfa_invalid_code") setServerError(t.disable.invalidCode);
      else setServerError(t.status.loadError);
    } finally {
      setPending(false);
    }
  }

  function downloadBackupCodes(codes: string[]) {
    const blob = new Blob(
      [
        "The Pet Headquarters — Backup codes\n",
        "Generated: " + new Date().toISOString() + "\n",
        "Each code works once. Keep them somewhere safe.\n\n",
        ...codes.map((c, i) => `${i + 1}. ${c}\n`),
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tph-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-3xl)",
            fontWeight: "var(--weight-regular)",
            color: "var(--white)",
            marginBottom: "var(--space-2)",
          }}
        >
          {t.status.title}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            color: "var(--white-faint)",
            lineHeight: "var(--leading-relaxed)",
          }}
        >
          {t.status.subtitle}
        </p>
      </header>

      {adminRequired && !mfa.enabled && (
        <div
          className="flex items-start gap-3 rounded-md p-4"
          style={{
            background: "rgba(198,40,40,0.08)",
            border: "1px solid rgba(198,40,40,0.3)",
          }}
        >
          <AlertTriangle size={18} style={{ color: "var(--error)", flexShrink: 0, marginTop: 2 }} />
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              color: "var(--white-dim)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            {t.status.adminRequiredBanner}
          </p>
        </div>
      )}

      <div
        className="flex flex-col gap-4 rounded-lg p-6"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <div className="flex items-center gap-3">
          {mfa.enabled ? (
            <ShieldCheck size={24} style={{ color: "var(--success, #4ade80)" }} />
          ) : (
            <Shield size={24} style={{ color: "var(--white-faint)" }} />
          )}
          <div>
            <p
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-base)",
                fontWeight: "var(--weight-medium)",
                color: "var(--white)",
              }}
            >
              {mfa.enabled ? t.status.stateOn : t.status.stateOff}
            </p>
            {mfa.enabled && enabledAt && (
              <p
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  color: "var(--white-faint)",
                }}
              >
                {t.status.stateOnSince.replace("{date}", enabledAt.toLocaleDateString("en-GB"))}
              </p>
            )}
          </div>
        </div>

        {!mfa.enabled && mode === "idle" && (
          <button
            onClick={() => router.push("/account/security/setup" + (reason ? `?reason=${reason}` : ""))}
            className="btn-gold rounded-md py-3"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--tracking-wider)",
              textTransform: "uppercase",
            }}
          >
            {t.status.enableButton}
          </button>
        )}

        {mfa.enabled && mode === "idle" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => { setMode("regenerate"); setServerError(""); }}
              className="flex-1 rounded-md py-2.5 transition-colors hover:bg-[rgba(187,148,41,0.05)]"
              style={{
                border: "1px solid var(--bg-border)",
                color: "var(--white-dim)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-medium)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              {t.status.regenerateButton}
            </button>
            <button
              onClick={() => { setMode("disable"); setServerError(""); }}
              className="flex-1 rounded-md py-2.5 transition-colors hover:bg-[rgba(198,40,40,0.08)]"
              style={{
                border: "1px solid rgba(198,40,40,0.3)",
                color: "var(--error)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-medium)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              {t.status.disableButton}
            </button>
          </div>
        )}
      </div>

      {mode === "disable" && (
        <form onSubmit={handleDisable} className="flex flex-col gap-4 rounded-lg p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
            {t.disable.title}
          </h2>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
            {t.disable.body}
          </p>
          {serverError && (
            <p style={{ background: "rgba(198,40,40,0.08)", border: "1px solid rgba(198,40,40,0.2)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", padding: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
              {serverError}
            </p>
          )}
          <div>
            <label className="block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", marginBottom: "var(--space-2)" }}>
              {t.disable.passwordLabel}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full outline-none"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)" }}
            />
          </div>
          <div>
            <label className="block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", marginBottom: "var(--space-2)" }}>
              {t.disable.codeLabel}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="text"
              autoComplete="one-time-code"
              className="w-full outline-none"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)" }}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setMode("idle"); setServerError(""); setPassword(""); setCode(""); }}
              className="flex-1 rounded-md py-2.5"
              style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
              {t.disable.cancel}
            </button>
            <button type="submit" disabled={pending} className="flex-1 rounded-md py-2.5 disabled:opacity-50"
              style={{ background: "var(--error)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
              {pending ? "…" : t.disable.submit}
            </button>
          </div>
        </form>
      )}

      {mode === "regenerate" && !newBackupCodes && (
        <form onSubmit={handleRegenerate} className="flex flex-col gap-4 rounded-lg p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
            {t.regenerate.title}
          </h2>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
            {t.regenerate.body}
          </p>
          {serverError && (
            <p style={{ background: "rgba(198,40,40,0.08)", border: "1px solid rgba(198,40,40,0.2)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", padding: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
              {serverError}
            </p>
          )}
          <div>
            <label className="block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", marginBottom: "var(--space-2)" }}>
              {t.regenerate.passwordLabel}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full outline-none"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)" }}
            />
          </div>
          <div>
            <label className="block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", marginBottom: "var(--space-2)" }}>
              {t.regenerate.codeLabel}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="one-time-code"
              className="w-full outline-none"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)" }}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setMode("idle"); setServerError(""); setPassword(""); setCode(""); }}
              className="flex-1 rounded-md py-2.5"
              style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
              {t.regenerate.cancel}
            </button>
            <button type="submit" disabled={pending} className="btn-gold flex-1 rounded-md py-2.5 disabled:opacity-50"
              style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
              {pending ? "…" : t.regenerate.submit}
            </button>
          </div>
        </form>
      )}

      {newBackupCodes && (
        <div className="flex flex-col gap-4 rounded-lg p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--gold)" }}>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
            {t.setup.step5.heading}
          </h2>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
            {t.setup.step5.body}
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-md p-4" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}>
            {newBackupCodes.map((c) => (
              <code key={c} style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "var(--text-sm)", color: "var(--white)", letterSpacing: "0.05em", padding: "var(--space-2)", textAlign: "center" }}>
                {c}
              </code>
            ))}
          </div>
          <button
            type="button"
            onClick={() => downloadBackupCodes(newBackupCodes)}
            className="btn-gold rounded-md py-2.5"
            style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}
          >
            {t.setup.step5.downloadButton}
          </button>
          <button
            type="button"
            onClick={() => { setNewBackupCodes(null); setMode("idle"); }}
            className="rounded-md py-2.5"
            style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}
          >
            {t.setup.step5.confirmStored}
          </button>
        </div>
      )}
    </div>
  );
}
