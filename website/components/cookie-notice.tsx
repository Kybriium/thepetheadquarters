"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { setAnalyticsOptOut } from "@/lib/analytics";
import { getClarityConsent, setCookieConsent } from "@/lib/clarity";

/**
 * Cookie consent gate.
 *
 * Two reasons we make a real choice rather than passive transparency:
 *   1. Microsoft Clarity (session replay) is a third-party tracker
 *      that sets cookies — under PECR + UK GDPR it CANNOT load until
 *      the user has actively consented.
 *   2. The first-party analytics is technically PECR-exempt, but
 *      bundling it under the same "all / necessary" choice gives
 *      users a single, honest control surface.
 *
 * Choices:
 *   • "Accept all"     → load Clarity, run first-party analytics
 *   • "Necessary only" → no Clarity, opt out of first-party analytics
 *   • X (close)        → same as "Necessary only" (no implicit consent)
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getClarityConsent() === null) {
      // Defer the appearance slightly so it doesn't compete with the
      // first paint of the page.
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function choose(value: "all" | "necessary") {
    setCookieConsent(value);
    // First-party analytics opts out alongside Clarity for the
    // "necessary only" path — keeping the two controls in lockstep
    // means there's only one decision for the user to revisit later.
    setAnalyticsOptOut(value === "necessary");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookies and privacy notice"
      className="fixed bottom-0 left-0 right-0 z-50 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--gold)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        padding: "var(--space-5)",
        margin: "var(--space-3)",
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cookie size={16} style={{ color: "var(--gold)" }} />
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "var(--text-lg)",
              color: "var(--white)",
              lineHeight: 1.2,
            }}
          >
            Privacy &amp; cookies
          </h2>
        </div>
        <button
          type="button"
          onClick={() => choose("necessary")}
          aria-label="Decline analytics"
          className="shrink-0 rounded-md p-1 transition-colors hover:bg-[rgba(187,148,41,0.08)]"
          style={{ color: "var(--white-faint)" }}
        >
          <X size={16} />
        </button>
      </div>

      <p
        className="mb-4"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-xs)",
          color: "var(--white-dim)",
          lineHeight: "var(--leading-relaxed)",
        }}
      >
        We use a small login cookie so you can sign in and check out. With
        your permission, we&apos;d also like to run privacy-friendly analytics
        and Microsoft Clarity — which records anonymous session replays
        (mouse movement, clicks, scrolls — never card details or
        personal text) so we can see where the site is confusing and fix
        it. You can change your mind anytime.{" "}
        <Link
          href="/legal/cookies"
          style={{ color: "var(--gold-dark)", textDecoration: "underline" }}
        >
          Learn more
        </Link>
        .
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => choose("all")}
          className="btn-gold flex-1 rounded-md py-2.5"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-semibold)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={() => choose("necessary")}
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
          Necessary only
        </button>
      </div>
    </div>
  );
}
