"use client";

import { Lock } from "lucide-react";

/**
 * Trust-boosting payment-method badges.
 *
 * Inline SVG icons (no external requests, no flash-of-broken-image, no
 * dependency on a third-party CDN that ad blockers might mangle). Each
 * card brand is rendered in its actual brand colour at small size, then
 * a "Secure payment by Stripe" caption under the row.
 *
 * Used on the landing page (between trust signals and brands) and on the
 * PDP (above add-to-cart) — both contexts where customers are deciding
 * whether to part with money.
 */

interface PaymentMethodsStripProps {
  /** Compact layout = no caption, smaller logos. Use inline on cards. */
  compact?: boolean;
  /** Wrap everything in centered container with padding. */
  centered?: boolean;
}

export function PaymentMethodsStrip({ compact = false, centered = true }: PaymentMethodsStripProps) {
  const logoHeight = compact ? 18 : 24;

  return (
    <div
      className={centered ? "flex flex-col items-center gap-3" : "flex flex-col gap-3"}
      aria-label="Payment methods we accept"
    >
      <div className={`flex flex-wrap items-center gap-3 ${centered ? "justify-center" : ""}`}>
        <VisaLogo height={logoHeight} />
        <MastercardLogo height={logoHeight} />
        <AmexLogo height={logoHeight} />
        <ApplePayLogo height={logoHeight} />
        <GooglePayLogo height={logoHeight} />
      </div>
      {!compact && (
        <p
          className="flex items-center gap-1.5"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white-faint)",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          <Lock size={12} style={{ color: "var(--success)" }} />
          Secure payment by Stripe
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline brand SVGs — official brand marks at small print-safe sizes.
// All ship inside the bundle, no remote loads, no consent-management
// implications. Rendered against a white background tile so each logo
// has the contrast it needs regardless of page theme.
// ---------------------------------------------------------------------------

interface LogoProps {
  height: number;
}

function LogoTile({ children, ariaLabel, height }: { children: React.ReactNode; ariaLabel: string; height: number }) {
  return (
    <div
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        height,
        minWidth: height * 1.7,
        background: "#FFFFFF",
        borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.1)",
        padding: "0 6px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

function VisaLogo({ height }: LogoProps) {
  return (
    <LogoTile ariaLabel="Visa" height={height}>
      <svg height={height * 0.55} viewBox="0 0 64 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#1A1F71" d="M26.7 0.4 17.6 20.6h-5.9L7.3 4.8c-.3-1-.5-1.4-1.4-1.8-1.4-.7-3.6-1.4-5.6-1.8l.1-.8h9.4c1.2 0 2.3.8 2.6 2.2l2.4 12.6L20.8.4h5.9zm22.9 13.4c0-5.7-7.8-6-7.8-8.6 0-.8.8-1.6 2.4-1.8.8-.1 3-.2 5.5 1L51 0c-1.3-.5-3.1-1-5.3-1-5.6 0-9.6 3-9.6 7.2 0 3.1 2.8 4.9 4.9 5.9 2.2 1.1 2.9 1.8 2.9 2.8 0 1.5-1.8 2.2-3.5 2.2-2.9 0-4.6-.8-6-1.4l-1.1 4.9c1.4.6 4 1.2 6.7 1.2 5.9 0 9.8-3 9.8-7.6zM63.5 20.6 58.7.4h-4.5c-1 0-1.9.6-2.3 1.5l-8.4 18.7H50l1.2-3.3h7.3l.7 3.3h5.3zM52.6 13l3-8.4 1.7 8.4h-4.7zM34.9.4l-4.7 20.2h-5.6L29.3.4h5.6z"/>
      </svg>
    </LogoTile>
  );
}

function MastercardLogo({ height }: LogoProps) {
  return (
    <LogoTile ariaLabel="Mastercard" height={height}>
      <svg height={height * 0.75} viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="14" cy="12" r="10" fill="#EB001B" />
        <circle cx="24" cy="12" r="10" fill="#F79E1B" />
        <path d="M19 4.2a9.97 9.97 0 0 1 0 15.6 9.97 9.97 0 0 1 0-15.6z" fill="#FF5F00" />
      </svg>
    </LogoTile>
  );
}

function AmexLogo({ height }: LogoProps) {
  return (
    <LogoTile ariaLabel="American Express" height={height}>
      <svg height={height * 0.55} viewBox="0 0 60 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="60" height="14" fill="#1976D2" rx="1" />
        <text x="30" y="10" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" letterSpacing="0.5">AMEX</text>
      </svg>
    </LogoTile>
  );
}

function ApplePayLogo({ height }: LogoProps) {
  return (
    <LogoTile ariaLabel="Apple Pay" height={height}>
      <svg height={height * 0.6} viewBox="0 0 44 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="#000">
        <path d="M5.6 2.7c.4-.4 1-.7 1.6-.7 0 .6-.3 1.2-.7 1.6-.4.4-1 .7-1.6.7 0-.6.3-1.2.7-1.6zm1.5 2.4c.9 0 1.5.5 1.9.5.4 0 1.2-.5 2-.5.7 0 1.8.3 2.5 1.5-.1.1-1.5 1-1.5 2.8 0 2.1 1.8 2.9 1.9 2.9 0 .1-.3.9-1 1.8-.6.7-1.2 1.5-2.1 1.5-.9 0-1.2-.5-2.2-.5s-1.3.5-2.2.5c-.9 0-1.6-.8-2.2-1.5C.7 12.3 0 9.6 1.3 7.8 1.9 6.9 3.1 6.3 4.2 6.3c.9 0 1.7.6 2 .6.3 0 1-.6.9-.5zM18.9 3.1h3.9c2.1 0 3.6 1.4 3.6 3.5s-1.5 3.5-3.7 3.5h-2.1V14h-1.8V3.1zm1.8 1.5v4h1.8c1.4 0 2.2-.7 2.2-2s-.8-2-2.2-2h-1.8zm6.6 8c0-1.4 1-2.3 3-2.4l2.3-.1v-.7c0-.9-.6-1.4-1.7-1.4-.9 0-1.6.5-1.7 1.2h-1.6c0-1.4 1.4-2.5 3.4-2.5 2 0 3.3 1 3.3 2.7v5.5h-1.7v-1.3h-.1c-.5.9-1.5 1.4-2.6 1.4-1.6 0-2.6-1-2.6-2.4zm5.3-.7v-.7l-2 .1c-1 .1-1.6.5-1.6 1.2 0 .7.6 1.2 1.5 1.2 1.2 0 2.1-.8 2.1-1.8zm3.6 5v-1.4c.1 0 .4.1.6.1.8 0 1.3-.4 1.6-1.3l.2-.5L34.6 6h2l2.3 7h.1l2.3-7h1.9l-3.4 9.5c-.8 2.2-1.7 2.9-3.5 2.9-.2 0-.5 0-.7-.1z"/>
      </svg>
    </LogoTile>
  );
}

function GooglePayLogo({ height }: LogoProps) {
  return (
    <LogoTile ariaLabel="Google Pay" height={height}>
      <svg height={height * 0.6} viewBox="0 0 44 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#5F6368" d="M20.5 8.7v2.5h-.8V5.1h2.1c.5 0 1 .2 1.4.5.4.3.5.8.5 1.3s-.2.9-.5 1.3c-.4.3-.8.5-1.4.5h-1.3zm0-2.9v2.1h1.4c.3 0 .6-.1.8-.3.2-.2.3-.5.3-.7 0-.3-.1-.5-.3-.7-.2-.2-.5-.3-.8-.3h-1.4zM25.7 6.8c.6 0 1.1.2 1.4.5.3.3.5.7.5 1.3v2.6h-.7v-.6h-.1c-.3.5-.8.7-1.4.7-.5 0-.9-.1-1.2-.4-.3-.3-.5-.6-.5-1 0-.5.2-.8.5-1.1.4-.3.8-.4 1.4-.4.5 0 1 .1 1.3.3v-.2c0-.3-.1-.6-.4-.8-.2-.2-.5-.3-.9-.3-.5 0-.9.2-1.2.6l-.6-.4c.4-.6 1-.8 1.9-.8zm-1 3c0 .2.1.4.3.5.2.1.4.2.7.2.4 0 .7-.1 1-.4.3-.3.5-.6.5-1-.3-.2-.6-.3-1.1-.3-.4 0-.7.1-.9.3-.3.2-.5.4-.5.7zM31.4 6.9 28.5 13.6h-.8L28.8 11l-1.9-4.1h.9L29 9.9h.1l1.3-3h.9z"/>
        <path fill="#4285F4" d="M13.7 6.8c0-.3 0-.5-.1-.7h-3.4v1.4h2c-.1.5-.3.9-.7 1.2v1h1.2c.7-.6 1-1.5 1-2.9z"/>
        <path fill="#34A853" d="M10.2 10.3c1 0 1.8-.3 2.4-.9l-1.2-1c-.3.2-.7.4-1.2.4-1 0-1.8-.6-2-1.5h-1.2v1c.6 1.2 1.7 2 3.2 2z"/>
        <path fill="#FBBC04" d="M8.2 7.3c-.1-.2-.1-.5-.1-.7s0-.5.1-.7v-1H7c-.3.5-.4 1.1-.4 1.7s.1 1.2.4 1.7l1.2-1z"/>
        <path fill="#EA4335" d="M10.2 5.1c.6 0 1 .2 1.4.5l1-1c-.6-.6-1.4-.9-2.4-.9-1.4 0-2.6.8-3.2 2l1.2 1c.2-.9 1-1.6 2-1.6z"/>
      </svg>
    </LogoTile>
  );
}
