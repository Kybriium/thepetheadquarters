"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRecentActivity } from "@/lib/recent-activity";

/**
 * Temu/SHEIN-style live activity toaster.
 *
 * Slides in from the bottom-left every ~10 seconds with a real recent
 * order: "S. from Manchester ordered 'Premium Dog Treats' · 4 min ago".
 *
 * Important constraints:
 *   - Real data only. Activity comes from the anonymised backend feed
 *     (/orders/recent-activity/). No fabricated events — fake social
 *     proof falls foul of the DMCC Act 2024 / Consumer Protection from
 *     Unfair Trading Regulations 2008.
 *   - Hides entirely when the feed is empty so a brand-new shop doesn't
 *     render a broken toaster.
 *   - Hides on checkout / account / admin paths — sales nudges during
 *     a payment flow erode trust rather than building it.
 *   - Dismissible per session — clicking X stops it for the rest of
 *     the visit (sessionStorage flag).
 *   - Respects prefers-reduced-motion (no slide animation if user
 *     opted out).
 */

const DISMISS_KEY = "tph-activity-toaster-dismissed";
const CYCLE_MS = 9000; // ~9s per item
const ENTRANCE_DELAY_MS = 4000; // first toast shows 4s after page load
const HIDDEN_PATH_PREFIXES = ["/checkout", "/account", "/admin", "/order-success"];

export function LiveActivityToaster() {
  const pathname = usePathname() || "";
  const items = useRecentActivity();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start true so SSR is conservative

  // Read dismissal on mount only. We deliberately don't honor this
  // across browser tabs — sessionStorage is per-tab which is the
  // desired UX.
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // Strip the leading locale segment (e.g. /en/checkout → /checkout) so
  // the prefix check works regardless of the active locale.
  const localelessPath = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 1 && /^[a-z]{2}$/.test(parts[0])) {
      return "/" + parts.slice(1).join("/");
    }
    return pathname;
  }, [pathname]);

  const isHiddenPath = HIDDEN_PATH_PREFIXES.some(
    (p) => localelessPath === p || localelessPath.startsWith(`${p}/`),
  );

  // Schedule the first show + then cycle through items at CYCLE_MS.
  useEffect(() => {
    if (dismissed || isHiddenPath || items.length === 0) {
      setVisible(false);
      return;
    }
    const entranceTimer = setTimeout(() => setVisible(true), ENTRANCE_DELAY_MS);
    return () => clearTimeout(entranceTimer);
  }, [dismissed, isHiddenPath, items.length]);

  useEffect(() => {
    if (!visible || items.length <= 1) return;
    const cycle = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, CYCLE_MS);
    return () => clearInterval(cycle);
  }, [visible, items.length]);

  if (dismissed || isHiddenPath || items.length === 0 || !visible) {
    return null;
  }

  const item = items[index % items.length];

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <Link
      href={`/products/${item.product_slug}`}
      className="fixed bottom-4 left-4 z-40 flex max-w-[320px] items-center gap-3 rounded-lg p-3 shadow-lg transition-all duration-300"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--bg-border)",
        animation: "tph-activity-in 0.4s ease-out",
      }}
    >
      <div
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md"
        style={{ background: "var(--bg-tertiary)" }}
      >
        {item.product_image ? (
          <Image
            src={item.product_image}
            alt={item.product_name}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingBag size={16} style={{ color: "var(--white-faint)" }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            color: "var(--white-dim)",
            lineHeight: 1.35,
          }}
        >
          <span style={{ color: "var(--white)", fontWeight: 600 }}>
            {item.buyer_initial} from {item.city}
          </span>{" "}
          ordered <em style={{ color: "var(--gold-dark)", fontStyle: "normal" }}>
            {item.product_name}
          </em>
        </p>
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 10,
            color: "var(--white-faint)",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          {timeAgo(item.paid_at)}
        </span>
      </div>

      <button
        onClick={handleDismiss}
        aria-label="Dismiss notifications"
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: "var(--white-faint)" }}
      >
        <X size={14} />
      </button>

      <style>{`
        @keyframes tph-activity-in {
          0% { transform: translateY(120%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tph-activity-in {
            0%, 100% { transform: translateY(0); opacity: 1; }
          }
        }
      `}</style>
    </Link>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}
