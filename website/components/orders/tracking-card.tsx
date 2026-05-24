"use client";

import { Truck, ExternalLink } from "lucide-react";
import type { Order } from "@/types/order";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Shows the courier + tracking number + a "Track parcel" button once the
 * order has shipped. Renders nothing for orders that don't have tracking
 * yet — safe to drop in any order view without conditional callsites.
 */
export function TrackingCard({ order }: { order: Order }) {
  // No tracking → render nothing; we don't want a "pending tracking" placeholder
  // that competes for attention before the order has actually shipped.
  if (!order.tracking_carrier && !order.tracking_number) return null;

  const isDelivered = order.status === "delivered";
  const accentColor = isDelivered ? "var(--success)" : "var(--info)";
  const accentBg = isDelivered ? "rgba(46,125,50,0.08)" : "rgba(21,101,192,0.06)";

  return (
    <div
      className="print-hide flex flex-col gap-3 rounded-lg p-5 sm:flex-row sm:items-center sm:justify-between"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${accentColor}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: accentBg, color: accentColor }}
        >
          <Truck size={18} />
        </div>
        <div>
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 10,
              fontWeight: 600,
              color: accentColor,
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            {isDelivered ? "Delivered" : "On the way"}
          </p>
          <p
            className="mt-0.5"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--white)",
            }}
          >
            {order.tracking_carrier_display || "Courier"}
            {order.tracking_number && (
              <span style={{ color: "var(--white-faint)", fontWeight: 400 }}>
                {" · "}
                {order.tracking_number}
              </span>
            )}
          </p>
          {isDelivered && order.delivered_at ? (
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)" }}>
              Delivered {formatDate(order.delivered_at)}
            </p>
          ) : order.shipped_at ? (
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)" }}>
              Dispatched {formatDate(order.shipped_at)}
            </p>
          ) : null}
        </div>
      </div>

      {order.tracking_link && (
        <a
          href={order.tracking_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 transition-all duration-200"
          style={{
            background: accentColor,
            color: "#fff",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
          }}
        >
          Track parcel
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
