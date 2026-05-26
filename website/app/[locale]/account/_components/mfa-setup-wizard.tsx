"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { endpoints } from "@/config/endpoints";
import { apiClient, ApiError } from "@/lib/api-client";
import type enAuth from "@/i18n/dictionaries/en/auth.json";

interface WizardProps {
  dict: typeof enAuth;
}

// Concrete app recommendations with iOS + Android deep links.
// Ordered most-popular first; the user picks whichever they trust.
const APPS = [
  {
    key: "google",
    ios: "https://apps.apple.com/app/google-authenticator/id388497605",
    android: "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
  },
  {
    key: "microsoft",
    ios: "https://apps.apple.com/app/microsoft-authenticator/id983156458",
    android: "https://play.google.com/store/apps/details?id=com.azure.authenticator",
  },
  {
    key: "authy",
    ios: "https://apps.apple.com/app/authy/id494168017",
    android: "https://play.google.com/store/apps/details?id=com.authy.authy",
  },
] as const;

export function MfaSetupWizard({ dict }: WizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const { refreshUser } = useAuth();

  const t = dict.twoFactor.setup;

  const [step, setStep] = useState(1);
  const [setup, setSetup] = useState<{ secret: string; provisioning_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // Kick off the setup when entering step 3. The secret + URI need to be
  // fresh because the backend rolls a new secret on every /setup/ call.
  useEffect(() => {
    if (step !== 3 || setup) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.post<{
          status: string;
          data: { secret: string; provisioning_uri: string };
        }>(endpoints.auth.mfaSetup, {});
        if (cancelled) return;
        if (res.status === "success") setSetup(res.data);
        else setServerError(t.loadError);
      } catch {
        if (!cancelled) setServerError(t.loadError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, setup, t.loadError]);

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setServerError("");
    try {
      const res = await apiClient.post<{
        status: string;
        data: { enabled_at: string; backup_codes: string[] };
      }>(endpoints.auth.mfaSetupVerify, { code });
      if (res.status === "success") {
        setBackupCodes(res.data.backup_codes);
        await refreshUser();
        setStep(5);
      }
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 429 || apiErr.message?.includes("rate_limited")) {
        setServerError(t.step4.rateLimited);
      } else {
        setServerError(t.step4.invalid);
      }
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

  async function copySecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Clipboard API can fail in non-secure contexts or when the user
      // has denied permission — silently no-op, user can read the key.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-widest)", textTransform: "uppercase" }}>
          {t.stepLabel.replace("{n}", String(step))}
        </p>
        <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", color: "var(--white)", marginTop: "var(--space-2)" }}>
          {t.title}
        </h1>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", marginTop: "var(--space-2)" }}>
          {t.subtitle}
        </p>
      </header>

      {/* Progress dots */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 1,
              background: n <= step ? "var(--gold)" : "var(--bg-border)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>

      <div className="rounded-lg p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              {t.step1.heading}
            </h2>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
              {t.step1.body}
            </p>

            <ul className="flex flex-col gap-3">
              {APPS.map((app) => {
                const titleKey = `${app.key}Title` as const;
                const noteKey = `${app.key}Note` as const;
                return (
                  <li
                    key={app.key}
                    className="rounded-md p-4"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
                          {t.step1.apps[titleKey]}
                        </p>
                        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 2 }}>
                          {t.step1.apps[noteKey]}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={app.ios}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors hover:bg-[rgba(187,148,41,0.08)]"
                          style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
                        >
                          {t.step1.iosStore}
                          <ExternalLink size={10} />
                        </a>
                        <a
                          href={app.android}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors hover:bg-[rgba(187,148,41,0.08)]"
                          style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
                        >
                          {t.step1.androidStore}
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
              <li className="rounded-md p-4" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
                  {t.step1.apps.applepwdTitle}
                </p>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 2 }}>
                  {t.step1.apps.applepwdNote}
                </p>
              </li>
            </ul>

            <button
              onClick={() => setStep(2)}
              className="btn-gold flex items-center justify-center gap-2 rounded-md py-3"
              style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}
            >
              {t.step1.continue}
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              {t.step2.heading}
            </h2>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
              {t.step2.body}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="rounded-md px-4 py-3"
                style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setStep(3)} className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-md py-3"
                style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}>
                {t.step2.continue}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              {t.step3.heading}
            </h2>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
              {t.step3.body}
            </p>

            {!setup ? (
              <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", textAlign: "center", padding: "var(--space-8)" }}>
                {t.step3.loadingQr}
              </p>
            ) : (
              <>
                <div className="flex justify-center rounded-md p-4" style={{ background: "var(--white)" }}>
                  <QRCodeSVG
                    value={setup.provisioning_uri}
                    size={200}
                    level="M"
                    aria-label="2FA setup QR code"
                  />
                </div>

                <div className="rounded-md p-4" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}>
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", marginBottom: "var(--space-2)" }}>
                    {t.step3.manualPrompt}
                  </p>
                  <div className="flex items-center gap-2">
                    <code style={{ flex: 1, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "var(--text-sm)", color: "var(--white)", letterSpacing: "0.1em", wordBreak: "break-all" }}>
                      {setup.secret}
                    </code>
                    <button
                      onClick={copySecret}
                      aria-label="Copy secret"
                      className="rounded-md p-2 transition-colors hover:bg-[rgba(187,148,41,0.08)]"
                      style={{ color: secretCopied ? "var(--gold)" : "var(--white-faint)" }}
                    >
                      {secretCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: "var(--space-2)", lineHeight: 1.5 }}>
                    {t.step3.manualHelp}
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="rounded-md px-4 py-3"
                style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!setup}
                className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-md py-3 disabled:opacity-50"
                style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}
              >
                {t.step3.continue}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <form onSubmit={verifyCode} className="flex flex-col gap-5">
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              {t.step4.heading}
            </h2>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
              {t.step4.body}
            </p>
            {serverError && (
              <p style={{ background: "rgba(198,40,40,0.08)", border: "1px solid rgba(198,40,40,0.2)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", padding: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
                {serverError}
              </p>
            )}
            <div>
              <label className="block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", marginBottom: "var(--space-2)" }}>
                {t.step4.label}
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t.step4.placeholder}
                required
                pattern="\d{6}"
                maxLength={6}
                className="w-full text-center outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--bg-border)",
                  color: "var(--white)",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontSize: "var(--text-2xl)",
                  letterSpacing: "0.5em",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                }}
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(3)} className="rounded-md px-4 py-3"
                style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
                <ChevronLeft size={14} />
              </button>
              <button type="submit" disabled={pending || code.length !== 6}
                className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-md py-3 disabled:opacity-50"
                style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}>
                {pending ? "…" : t.step4.submit}
              </button>
            </div>
          </form>
        )}

        {step === 5 && backupCodes && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Shield size={24} style={{ color: "var(--gold)" }} />
              <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
                {t.step5.heading}
              </h2>
            </div>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: 1.6 }}>
              {t.step5.body}
            </p>

            <div className="grid grid-cols-2 gap-2 rounded-md p-4" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--gold)" }}>
              {backupCodes.map((c) => (
                <code key={c} style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "var(--text-sm)", color: "var(--white)", letterSpacing: "0.05em", padding: "var(--space-2)", textAlign: "center" }}>
                  {c}
                </code>
              ))}
            </div>

            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", fontStyle: "italic" }}>
              {t.step5.warning}
            </p>

            <button
              type="button"
              onClick={() => downloadBackupCodes(backupCodes)}
              className="flex items-center justify-center gap-2 rounded-md py-2.5"
              style={{ border: "1px solid var(--gold)", color: "var(--gold)", background: "rgba(187,148,41,0.05)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}
            >
              <Download size={14} />
              {t.step5.downloadButton}
            </button>

            <button
              type="button"
              onClick={() => {
                // Admin force-enrol path: bounce them into the admin once
                // setup is complete. Otherwise back to the status screen.
                if (reason === "admin_required") {
                  router.push("/admin");
                } else {
                  router.push("/account/security");
                }
              }}
              className="btn-gold rounded-md py-3"
              style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}
            >
              {t.step5.finish}
            </button>
          </div>
        )}
      </div>

      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", textAlign: "center" }}>
        <Link href="/account/security" style={{ color: "var(--gold-dark)" }}>
          ← {dict.account.security}
        </Link>
      </p>
    </div>
  );
}
