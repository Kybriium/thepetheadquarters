/**
 * Microsoft Clarity consent helpers.
 *
 * Clarity records mouse movement, clicks, scrolls and form interactions
 * — under UK GDPR + PECR that's "personal data" + "cookies that aren't
 * strictly necessary", which means we MUST NOT load it until the user
 * has actively consented through the cookie notice. The component
 * `<ClarityScript />` reads `getClarityConsent()` on mount and only
 * injects the remote tag when it returns `"all"`.
 *
 * The consent key was bumped from the pre-Clarity name so existing
 * users see the notice again — what they previously agreed to (first
 * party anonymous analytics only) is materially different from what
 * we're adding now (third-party session replay).
 */

export const CONSENT_KEY = "tph-cookie-consent";
export const CONSENT_CHANGED_EVENT = "tph-consent-changed";

export type CookieConsent = "all" | "necessary";

export function getClarityConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "all" || v === "necessary") return v;
    return null;
  } catch {
    return null;
  }
}

export function setCookieConsent(value: CookieConsent): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // localStorage unavailable — best-effort, the banner will show again
  }
  // Notify any listener (Clarity loader, first-party analytics) so they
  // can react without a full page reload.
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: value }));
  } catch {
    // ignore — unsupported browser
  }
}

export function getClarityProjectId(): string {
  return process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || "";
}
