"use client";

import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { Gift, X } from "lucide-react";

/**
 * Sticky promo bar pinned to the top of the landing page.
 *
 * Single concrete offer: "First order? WELCOME10 — 10% off". Clicking
 * the code copies it to the clipboard so the customer can paste at
 * checkout. Dismissible per-session via X.
 *
 * Important: the code itself is currently hard-coded here — it has to
 * exist in the admin promotions table for checkout to honour it. If
 * we change the code, also create/rename the Promotion in the admin.
 */

const PROMO_CODE = "WELCOME10";
const DISMISS_KEY = "tph-first-order-banner-dismissed";

export function FirstOrderBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      toast.success(`Code ${PROMO_CODE} copied — paste at checkout`);
    } catch {
      toast.info(`Code: ${PROMO_CODE}`);
    }
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label="First-order discount"
      style={{
        // High-contrast solid red — deliberately different from the gold
        // USP ribbon below it so the eye reads them as two separate
        // strips, not duplicated trust theatre. Promo first, then USPs.
        background: "#B91C1C",
        borderBottom: "1px solid rgba(0,0,0,0.25)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <button
          onClick={handleCopy}
          className="flex flex-1 items-center gap-2 text-left"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            color: "#FFFFFF",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          <Gift size={14} style={{ color: "#FFFFFF" }} />
          <span>
            <strong>First order?</strong> Tap to copy code{" "}
            <span
              className="rounded px-1.5 py-0.5"
              style={{
                background: "#FFFFFF",
                color: "#B91C1C",
                fontWeight: 800,
                letterSpacing: "var(--tracking-wider)",
              }}
            >
              {PROMO_CODE}
            </span>{" "}
            <span style={{ color: "rgba(255,255,255,0.85)" }}>— 10% off</span>
          </span>
        </button>

        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
