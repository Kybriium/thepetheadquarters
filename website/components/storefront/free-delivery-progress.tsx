"use client";

import { Truck, Check } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import {
  FREE_DELIVERY_THRESHOLD_PENCE,
} from "@/lib/shipping";

/**
 * "Spend £X more for free delivery" progress bar.
 *
 * Reads the live cart subtotal so the message updates instantly as items
 * are added. Used in two places:
 *   - PDP under "Add to cart" so customers see the goal as they shop
 *   - Cart page above the summary so they're nudged at the last moment
 *
 * `unitPrice` is an optional preview hint: on PDP we can show how the bar
 * WOULD look after the customer adds this product, which is much more
 * persuasive than the current cart's progress alone. Set when used on a
 * product detail page; leave undefined on cart/summary contexts.
 */
interface FreeDeliveryProgressProps {
  /** Optional pence value showing how a click on "Add to cart" would shift the bar. */
  unitPrice?: number;
  /** Hide the icon for compact contexts (e.g. inline in a card). */
  compact?: boolean;
}

function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function FreeDeliveryProgress({ unitPrice, compact = false }: FreeDeliveryProgressProps) {
  const { subtotal } = useCart();
  const projected = subtotal + (unitPrice ?? 0);
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD_PENCE - projected);
  const pct = Math.min(100, (projected / FREE_DELIVERY_THRESHOLD_PENCE) * 100);
  const qualified = remaining === 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-md p-3"
      style={{
        background: qualified ? "rgba(46,125,50,0.08)" : "var(--bg-tertiary)",
        border: `1px solid ${qualified ? "rgba(46,125,50,0.3)" : "var(--bg-border)"}`,
      }}
    >
      <div className="flex items-center gap-2">
        {!compact && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: qualified ? "rgba(46,125,50,0.15)" : "rgba(187,148,41,0.12)",
              color: qualified ? "var(--success)" : "var(--gold)",
            }}
          >
            {qualified ? <Check size={14} /> : <Truck size={14} />}
          </span>
        )}
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white)",
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {qualified ? (
            <>You've unlocked <span style={{ color: "var(--success)" }}>FREE delivery</span></>
          ) : unitPrice ? (
            <>Add this and you'll be <strong>{formatPounds(remaining)}</strong> from free delivery</>
          ) : (
            <>Spend <strong>{formatPounds(remaining)}</strong> more for free delivery</>
          )}
        </p>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: qualified ? "var(--success)" : "var(--gold)",
          }}
        />
      </div>
    </div>
  );
}
