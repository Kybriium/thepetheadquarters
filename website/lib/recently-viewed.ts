"use client";

/**
 * Recently-viewed products — client-only, localStorage-backed.
 *
 * On PDP we call `rememberProduct()` which prepends the product to a
 * capped list. On the landing page (and inside the cart, optionally) we
 * call `readRecentlyViewed()` to render a horizontal row of cards.
 *
 * Intentionally NOT synced to the backend: keeps the feature working for
 * guests, doesn't leak browsing history to staff, and skips an extra DB
 * write on every product view (we already have analytics for aggregate
 * insight; this is personal-only).
 */

const STORAGE_KEY = "tph-recently-viewed";
const MAX_ITEMS = 12;

export interface RecentlyViewedItem {
  slug: string;
  name: string;
  image: string | null;
  price: number | null;
  /** When the product was last viewed — used for ordering newest-first. */
  viewedAt: number;
}

export function rememberProduct(item: Omit<RecentlyViewedItem, "viewedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readRecentlyViewed();
    // Dedup by slug — viewing the same product twice doesn't pile up.
    const next: RecentlyViewedItem[] = [
      { ...item, viewedAt: Date.now() },
      ...existing.filter((p) => p.slug !== item.slug),
    ].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private-mode failures — just don't remember.
  }
}

export function readRecentlyViewed(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p: unknown): p is RecentlyViewedItem =>
        !!p && typeof p === "object"
        && typeof (p as RecentlyViewedItem).slug === "string"
        && typeof (p as RecentlyViewedItem).name === "string",
    );
  } catch {
    return [];
  }
}

export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
