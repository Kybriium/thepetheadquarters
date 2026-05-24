"use client";

import { useEffect, useState } from "react";

/**
 * Shared PWA-install state.
 *
 * Both the auto-popup (<PwaInstallPrompt />) and the always-on "Install app"
 * footer link need to know whether the browser has offered an install, and
 * to be able to trigger the native prompt or reopen the popup on demand.
 * Rather than two components both registering `beforeinstallprompt` listeners
 * and racing for the captured event, this module owns the single source of
 * truth and exposes a hook + actions to anyone who wants to read/use it.
 *
 * Module-level state is fine because `beforeinstallprompt` fires once per
 * page-load and the captured event must be reused; we don't want React tree
 * remounts (e.g. route change) to lose it.
 */

const INSTALL_DISMISSED_KEY = "tph-install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let cachedEvent: BeforeInstallPromptEvent | null = null;
let userRequestedOpen = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

// Register the install-event listeners exactly once when this module loads
// in the browser. SSR guards keep it inert on the server.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    cachedEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    cachedEvent = null;
    userRequestedOpen = false;
    notify();
  });
}

// ---------------------------------------------------------------------------
// Pure getters (used by the hook + actions)
// ---------------------------------------------------------------------------

function getCanInstall(): boolean {
  return cachedEvent !== null;
}

function getIsIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isApple = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isApple && isSafari;
}

function getIsInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Trigger the OS-native install dialog. Returns the user's choice.
 * Returns "unavailable" on browsers that don't fire `beforeinstallprompt`
 * (iOS Safari, Firefox desktop) or when the event has already been consumed.
 */
export async function triggerNativePrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!cachedEvent) return "unavailable";
  try {
    await cachedEvent.prompt();
    const { outcome } = await cachedEvent.userChoice;
    if (outcome === "accepted") {
      cachedEvent = null;
      notify();
    }
    return outcome;
  } catch {
    return "unavailable";
  }
}

/**
 * Open the install popup. Clears any previous "Maybe later" dismissal so
 * the popup actually appears, and flips a forceOpen flag the popup
 * component reacts to. Used by the footer link as the "install on demand"
 * entry point — also the only way iOS Safari users can re-see the
 * "Share → Add to Home Screen" instructions after their first dismissal.
 */
export function openInstallPrompt(): void {
  try {
    localStorage.removeItem(INSTALL_DISMISSED_KEY);
  } catch {
    // ignore — non-critical
  }
  userRequestedOpen = true;
  notify();
}

/** Called by the popup after it has been shown to reset the force flag. */
export function consumeForceOpen(): void {
  userRequestedOpen = false;
  notify();
}

// ---------------------------------------------------------------------------
// React hook — components subscribe to changes
// ---------------------------------------------------------------------------

export interface PwaInstallState {
  /** Browser has fired `beforeinstallprompt` and we've captured it. */
  canInstall: boolean;
  /** iOS Safari — no install event, but has "Add to Home Screen" via Share. */
  isIosSafari: boolean;
  /** App is already running standalone — install ineligible. */
  isInstalled: boolean;
  /** Footer link clicked → popup should open regardless of cookie/TTL gates. */
  forceOpen: boolean;
}

export function usePwaInstall(): PwaInstallState {
  // We use a bump counter to force re-render whenever module state changes,
  // since the actual state lives outside React.
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  return {
    canInstall: getCanInstall(),
    isIosSafari: getIsIosSafari(),
    isInstalled: getIsInstalled(),
    forceOpen: userRequestedOpen,
  };
}
