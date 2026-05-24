"use client";

import { Shield, RefreshCw, Truck, Lock } from "lucide-react";

/**
 * Compact 2x2 (or 4x1) cluster of trust badges for conversion-heavy pages.
 *
 * Used on PDP under "Add to cart" and on the cart page above checkout.
 * Each badge is one short reassurance — the customer skims them in <1s
 * before committing to the purchase. Don't load this up with marketing
 * fluff; only put things the customer actually wants to hear at the
 * moment of decision (security, returns, delivery speed, transparency).
 */

const badges = [
  {
    Icon: Lock,
    title: "Secure checkout",
    sub: "Card details handled by Stripe",
  },
  {
    Icon: RefreshCw,
    title: "14-day returns",
    sub: "UK consumer rights honoured",
  },
  {
    Icon: Truck,
    title: "Free over £30",
    sub: "UK shipping included",
  },
  {
    Icon: Shield,
    title: "Trusted UK shop",
    sub: "Registered in England & Wales",
  },
];

interface TrustBadgesClusterProps {
  /** Compact 2x2 grid (mobile-friendly); when false renders 4 across. */
  compact?: boolean;
}

export function TrustBadgesCluster({ compact = false }: TrustBadgesClusterProps) {
  return (
    <div
      className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--bg-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
      }}
    >
      {badges.map(({ Icon, title, sub }) => (
        <div key={title} className="flex items-start gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(187,148,41,0.12)", color: "var(--gold)" }}
          >
            <Icon size={13} />
          </span>
          <div className="min-w-0">
            <p
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--white)",
                lineHeight: 1.3,
              }}
            >
              {title}
            </p>
            <p
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--white-faint)",
                lineHeight: 1.3,
                marginTop: 2,
              }}
            >
              {sub}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
