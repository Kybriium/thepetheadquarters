/**
 * First-party analytics tracker.
 *
 * Tiny client-side library that batches events and ships them to the
 * Django backend with `navigator.sendBeacon` (or `fetch keepalive` as a
 * fallback). Designed to never block rendering and never compete with
 * critical work — every public function is fire-and-forget.
 *
 * The backend deduplicates visitors via a daily-rotating server-side
 * hash, so this client doesn't store any persistent identifier.
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track("add_to_cart", { variant_id: "...", value_pence: 1299 });
 */

export type AnalyticsEventName =
  | "pageview"
  | "product_view"
  | "category_view"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "checkout_start"
  | "checkout_complete"
  | "signup"
  | "login"
  | "promo_applied"
  | "newsletter_subscribed";

interface QueuedEvent {
  name: AnalyticsEventName;
  properties?: Record<string, unknown>;
  path?: string;
  title?: string;
}

// Intentionally obscure path — `/analytics/track/` was blocked by Brave's
// Shields and most ad-block filter lists (URL-based pattern match against
// the words "analytics" / "track"). The backend exposes the same view at
// the short `_a/` path so privacy browsers see our first-party events.
const ENDPOINT =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1") +
  "/_a/";

const FLUSH_DELAY_MS = 2000;
const MAX_BATCH_SIZE = 20;
const OPT_OUT_KEY = "tph-analytics-opt-out";

/**
 * Public opt-out controls — used by the cookie notice banner.
 * When opted out, `track()` becomes a no-op.
 */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (optedOut) {
      localStorage.setItem(OPT_OUT_KEY, "1");
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch {
    // ignore quota / private mode failures
  }
}

export function isAnalyticsOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Suppression rules
// ---------------------------------------------------------------------------
function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;

  // Honour the explicit opt-out from the cookie notice banner
  if (isAnalyticsOptedOut()) return true;

  // Honour Do-Not-Track requests
  // (Some browsers expose `doNotTrack` on navigator, others on window)
  const dnt =
    (navigator as Navigator & { doNotTrack?: string }).doNotTrack ||
    (window as Window & { doNotTrack?: string }).doNotTrack;
  if (dnt === "1" || dnt === "yes") return true;

  // Don't track admin or auth pages — internal traffic skews everything
  const path = window.location.pathname;
  if (
    path.includes("/admin") ||
    path.includes("/account/login") ||
    path.includes("/account/register") ||
    path.includes("/account/reset")
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------
function readUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ["source", "medium", "campaign", "content"]) {
    const v = params.get(`utm_${key}`);
    if (v) utm[key] = v;
  }
  return utm;
}

function sendBatch(batch: QueuedEvent[]) {
  if (!batch.length) return;

  const payload = JSON.stringify({
    events: batch,
    referrer: typeof document !== "undefined" ? document.referrer : "",
    utm: readUtmParams(),
  });

  // Prefer sendBeacon — it's fire-and-forget and survives page unload
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    } catch {
      // fall through to fetch
    }
  }

  // Fallback: fetch with keepalive so it survives navigation
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Swallow — analytics never breaks the app
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  sendBatch(batch);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function track(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  if (shouldSkip()) return;

  queue.push({
    name,
    properties,
    path: typeof window !== "undefined" ? window.location.pathname : "",
    title: typeof document !== "undefined" ? document.title : "",
  });

  if (queue.length >= MAX_BATCH_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

export function trackPageview(): void {
  track("pageview");
}

// Auto-flush on page unload so we don't lose the last events
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  // visibilitychange covers tab-switch on mobile (most reliable)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
