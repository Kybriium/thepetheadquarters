"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth";
import { ApiError } from "@/lib/api-client";
import type enAuth from "@/i18n/dictionaries/en/auth.json";

interface LoginFormProps {
  dict: typeof enAuth;
}

export function LoginForm({ dict }: LoginFormProps) {
  const { login, completeMfaLogin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/account";
  const [serverError, setServerError] = useState("");

  // 2FA step state — populated when /login/ says requires_2fa. We swap
  // the form contents to the code input instead of routing away; the
  // password is already verified, the challenge token is short-lived.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaPending, setMfaPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    // Defined defaults from first render — keeps inputs in a single
    // controlled-ness mode for their whole lifetime instead of starting
    // as uncontrolled (no value) and flipping when react-hook-form
    // first writes state.
    defaultValues: { email: "", password: "" },
  });

  const errorMessages: Record<string, string> = {
    "auth.email_required": dict.errors.email_required,
    "auth.email_invalid": dict.errors.email_invalid,
    "auth.password_required": dict.errors.password_required,
  };

  async function onSubmit(data: LoginFormData) {
    setServerError("");
    try {
      const result = await login(data.email, data.password);
      if (result.kind === "challenge") {
        setChallengeToken(result.challengeToken);
        return;
      }
      router.push(redirect);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("rate_limited")) {
        setServerError(dict.login.rateLimited);
      } else {
        setServerError(dict.login.invalidCredentials);
      }
    }
  }

  async function onSubmitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setMfaPending(true);
    setServerError("");
    try {
      await completeMfaLogin(challengeToken, mfaCode);
      router.push(redirect);
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr.message;
      if (code === "auth.challenge_expired") {
        // Token aged out — drop them back to step 1 with their email
        // intact so they re-auth without retyping the address.
        setChallengeToken(null);
        setMfaCode("");
        setServerError(dict.twoFactor.loginStep.challengeExpired);
      } else if (apiErr.status === 429 || code?.includes("rate_limited")) {
        setServerError(dict.twoFactor.loginStep.rateLimited);
      } else {
        setServerError(dict.twoFactor.loginStep.invalid);
      }
    } finally {
      setMfaPending(false);
    }
  }

  // Step 2 of login: 2FA code entry. Same card chrome, swapped contents.
  // `key` forces a remount when the form swaps steps — otherwise React
  // reconciles the password <input> (uncontrolled via register()) with
  // the code <input> (controlled by mfaCode state) and emits the
  // "uncontrolled to controlled" warning.
  if (challengeToken) {
    const tt = dict.twoFactor.loginStep;
    return (
      <div
        key="mfa-step"
        className="rounded-lg"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          padding: "var(--space-8)",
        }}
      >
        <form onSubmit={onSubmitMfa} className="flex flex-col gap-5">
          <header>
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-2xl)", color: "var(--white)" }}>
              {tt.heading}
            </h2>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", marginTop: "var(--space-2)", lineHeight: 1.6 }}>
              {tt.body}
            </p>
          </header>

          {serverError && (
            <p style={{ background: "rgba(198,40,40,0.08)", border: "1px solid rgba(198,40,40,0.2)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
              {serverError}
            </p>
          )}

          <div>
            <label style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", display: "block", marginBottom: "var(--space-2)" }}>
              {tt.label}
            </label>
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.trim().slice(0, 16))}
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              placeholder={tt.placeholder}
              required
              className="w-full text-center outline-none"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--bg-border)",
                color: "var(--white)",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: "var(--text-2xl)",
                letterSpacing: "0.4em",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
              }}
            />
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: "var(--space-2)" }}>
              {tt.backupHint}
            </p>
          </div>

          <button
            type="submit"
            disabled={mfaPending || mfaCode.length < 6}
            className="btn-gold w-full rounded-md py-3 disabled:opacity-50"
            style={{ fontFamily: "var(--font-montserrat)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase" }}
          >
            {mfaPending ? "…" : tt.submit}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      key="password-step"
      className="rounded-lg"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--bg-border)",
        padding: "var(--space-8)",
      }}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {serverError && (
          <p
            className="rounded-md text-center"
            style={{
              background: "rgba(198,40,40,0.08)",
              border: "1px solid rgba(198,40,40,0.2)",
              color: "var(--error)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              padding: "var(--space-3)",
            }}
          >
            {serverError}
          </p>
        )}

        <div>
          <label
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-medium)",
              color: "var(--white-dim)",
              letterSpacing: "var(--tracking-wide)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "var(--space-2)",
            }}
          >
            {dict.login.email}
          </label>
          <input
            {...register("email")}
            type="email"
            autoComplete="email"
            className="w-full outline-none"
            style={{
              background: "var(--bg-tertiary)",
              border: `1px solid ${errors.email ? "var(--error)" : "var(--bg-border)"}`,
              color: "var(--white)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
            }}
          />
          {errors.email && (
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--error)", marginTop: "var(--space-1)" }}>
              {errorMessages[errors.email.message ?? ""] ?? errors.email.message}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
            <label
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-medium)",
                color: "var(--white-dim)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              {dict.login.password}
            </label>
            <Link
              href="/account/forgot-password"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--gold-dark)",
              }}
            >
              {dict.login.forgotPassword}
            </Link>
          </div>
          <input
            {...register("password")}
            type="password"
            autoComplete="current-password"
            className="w-full outline-none"
            style={{
              background: "var(--bg-tertiary)",
              border: `1px solid ${errors.password ? "var(--error)" : "var(--bg-border)"}`,
              color: "var(--white)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
            }}
          />
          {errors.password && (
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--error)", marginTop: "var(--space-1)" }}>
              {errorMessages[errors.password.message ?? ""] ?? errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-gold w-full rounded-md py-3 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontWeight: "var(--weight-semibold)",
            fontSize: "var(--text-sm)",
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
          }}
        >
          {isSubmitting ? "..." : dict.login.submit}
        </button>
      </form>

      <p
        className="text-center"
        style={{
          marginTop: "var(--space-6)",
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          color: "var(--white-faint)",
        }}
      >
        {dict.login.noAccount}{" "}
        <Link href="/account/register" style={{ color: "var(--gold-dark)", fontWeight: "var(--weight-medium)" }}>
          {dict.login.register}
        </Link>
      </p>
    </div>
  );
}
