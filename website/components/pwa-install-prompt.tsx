"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, X, Share, PlusSquare } from "lucide-react";

/**
 * Custom PWA install banner.
 *
 * Browsers don't reliably show their built-in install prompt anymore —
 * Chrome only triggers it after specific engagement heuristics, Brave's
 * Shields suppress it most of the time, Safari never fires
 * `beforeinstallprompt` at all. This component:
 *
 *   1. Captures the `beforeinstallprompt` event when the browser fires it
 *      (Chrome / Edge / Brave when Shields permit) and shows a custom
 *      install button — clicking it triggers the OS install dialog.
 *   2. On iOS Safari (no install event), shows static "Share → Add to
 *      Home Screen" instructions instead of an install button.
 *   3. Never appears until the cookie notice has been dismissed — so we
 *      don't pile two popups on a first-time visitor.
 *   4. Hides for 30 days when dismissed; hides forever once installed.
 *
 * Mounts at the root of the app from providers.tsx alongside CookieNotice.
 */

const COOKIE_DISMISSED_KEY = "tph-cookie-notice-dismissed";
const INSTALL_DISMISSED_KEY = "tph-install-prompt-dismissed";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [visible, setVisible] = useState(false);

  // ---------------------------------------------------------------------
  // Capture the install event when the browser fires it. Calling
  // preventDefault() stops the browser's built-in mini-info-bar so we
  // can show our own UI instead.
  // ---------------------------------------------------------------------
  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
  }, []);

  // ---------------------------------------------------------------------
  // Detect iOS Safari — no install event, but PWA add-to-homescreen
  // is supported via Share menu so we can render instructions.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const isApple = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
    setIsIosSafari(isApple && isSafari);
  }, []);

  // ---------------------------------------------------------------------
  // Decide when to actually show the popup.
  // Polls localStorage every second waiting for the cookie notice to be
  // dismissed, then unblocks. Stops polling after 60s either way to
  // avoid running forever in the background.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed (running standalone) → never show
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;
    // iOS standalone detection
    if (typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean"
        && (navigator as Navigator & { standalone?: boolean }).standalone) {
      return;
    }

    // Previously dismissed and still within TTL → respect that
    try {
      const dismissedAt = parseInt(localStorage.getItem(INSTALL_DISMISSED_KEY) || "0", 10);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;
    } catch {
      // localStorage unavailable — proceed without persistence
    }

    function tryReveal(): boolean {
      // Must have either a captured install event OR be on iOS Safari
      // (we never show on browsers that can't install at all, e.g. Firefox desktop)
      if (!deferredPrompt && !isIosSafari) return false;
      // Cookie notice must be dismissed first
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
  }, [deferredPrompt, isIosSafari]);

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
    } catch {
      // Ignore — we just won't remember the dismissal
    }
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    setVisible(false);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome !== "accepted") {
        // User saw the native prompt and declined → respect for 30 days
        dismiss();
      }
      // If accepted, browser fires `appinstalled` and the standalone-mode
      // check above will skip the banner from now on.
    } catch {
      // prompt() can only be called once — if it fails just hide
    } finally {
      setDeferredPrompt(null);
    }
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
