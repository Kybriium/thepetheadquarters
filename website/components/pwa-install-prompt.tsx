"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, X, Share, PlusSquare } from "lucide-react";
import {
  consumeForceOpen,
  triggerNativePrompt,
  usePwaInstall,
} from "@/lib/pwa-install";

/**
 * Custom PWA install banner.
 *
 * Browsers don't reliably show their built-in install prompt anymore —
 * Chrome only triggers it after engagement heuristics, Brave's Shields
 * suppress it most of the time, Safari never fires `beforeinstallprompt`
 * at all. This component:
 *
 *   1. Reads the shared install state from `lib/pwa-install` (which owns
 *      the `beforeinstallprompt` listener once for the whole app).
 *   2. Auto-shows after the cookie notice is dismissed, on first visit.
 *   3. Re-shows on demand when the footer "Install app" link is clicked
 *      (via the `forceOpen` flag).
 *   4. Hides for 30 days when dismissed; hides forever once installed.
 *   5. On iOS Safari shows static "Share → Add to Home Screen" instructions.
 *
 * Mounts at the root of the app from providers.tsx alongside CookieNotice.
 */

const COOKIE_DISMISSED_KEY = "tph-cookie-notice-dismissed";
const INSTALL_DISMISSED_KEY = "tph-install-prompt-dismissed";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function PwaInstallPrompt() {
  const { canInstall, isIosSafari, isInstalled, forceOpen } = usePwaInstall();
  const [visible, setVisible] = useState(false);

  // ---------------------------------------------------------------------
  // Decide when to show. Two trigger paths:
  //   (a) auto: cookie notice dismissed + canInstall (or iOS) + not
  //       previously dismissed within TTL + not already installed
  //   (b) forced: user clicked the footer "Install app" link, which
  //       clears the dismissal record and flips forceOpen — we honour it
  //       immediately, bypassing the cookie-notice and TTL gates.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalled) {
      setVisible(false);
      return;
    }
    // Forced re-open from the footer link — show now, no other checks.
    if (forceOpen) {
      setVisible(true);
      consumeForceOpen();
      return;
    }
    // Auto path: only show if we can actually install on this browser.
    if (!canInstall && !isIosSafari) return;

    // Respect TTL if user dismissed previously
    try {
      const dismissedAt = parseInt(localStorage.getItem(INSTALL_DISMISSED_KEY) || "0", 10);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;
    } catch {
      // localStorage unavailable — proceed without persistence
    }

    function tryReveal(): boolean {
      try {
        if (!localStorage.getItem(COOKIE_DISMISSED_KEY)) return false;
      } catch {
        // If we can't read localStorage, just show — degraded mode
      }
      setVisible(true);
      return true;
    }

    if (tryReveal()) return;

    const interval = setInterval(() => {
      if (tryReveal()) clearInterval(interval);
    }, 1000);
    const stop = setTimeout(() => clearInterval(interval), 60000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [canInstall, isIosSafari, isInstalled, forceOpen]);

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
    } catch {
      // Ignore — we just won't remember the dismissal
    }
    setVisible(false);
  }

  async function handleInstall() {
    const outcome = await triggerNativePrompt();
    setVisible(false);
    if (outcome === "dismissed") {
      // User saw the native prompt and declined → respect for 30 days
      dismiss();
    }
    // "accepted" → browser fires `appinstalled` and the hook reports installed
    // "unavailable" → shouldn't happen since we gate on canInstall
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install The Pet Headquarters app"
      className="fixed bottom-0 left-0 right-0 z-40 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--gold)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        padding: "var(--space-5)",
        margin: "var(--space-3)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg"
          style={{ background: "var(--bg-tertiary)" }}
        >
          {/* PWA icon — same logo used in the manifest */}
          <Image src="/img/logo.png" alt="" fill sizes="48px" />
        </div>
        <div className="flex-1">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "var(--text-lg)",
              color: "var(--white)",
              lineHeight: 1.2,
            }}
          >
            Install our app
          </h2>
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-dim)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            {isIosSafari
              ? "Add The Pet Headquarters to your home screen for quick access — no download required."
              : "Quick access from your home screen, works offline, no app-store download needed."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 transition-colors hover:bg-[rgba(187,148,41,0.08)]"
          style={{ color: "var(--white-faint)" }}
        >
          <X size={16} />
        </button>
      </div>

      {isIosSafari ? (
        <div
          className="mt-4 rounded-md p-3"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--bg-border)",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white-dim)",
            lineHeight: "var(--leading-relaxed)",
          }}
        >
          <p className="mb-2">To install on iPhone:</p>
          <p className="flex items-center gap-2">
            1. Tap <Share size={14} style={{ color: "var(--gold)" }} /> Share at the bottom of Safari.
          </p>
          <p className="mt-1 flex items-center gap-2">
            2. Tap <PlusSquare size={14} style={{ color: "var(--gold)" }} /> Add to Home Screen.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleInstall}
            className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-md py-2.5"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <Download size={14} />
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
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
            Maybe later
          </button>
        </div>
      )}
    </div>
  );
}
