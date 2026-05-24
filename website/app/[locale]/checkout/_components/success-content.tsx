"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics";
import type { Order } from "@/types/order";
import { endpoints } from "@/config/endpoints";
import type enCheckout from "@/i18n/dictionaries/en/checkout.json";

interface SuccessContentProps {
  dict: typeof enCheckout;
  sessionId: string;
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function SuccessContent({ dict, sessionId }: SuccessContentProps) {
  const { clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    // Poll for order — webhook might not have fired yet
    let attempts = 0;
    const maxAttempts = 15;
    let cancelled = false;

    async function fetchOrder() {
      if (cancelled) return;

      try {
        const res = await fetch(endpoints.orders.bySession(sessionId), {
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          if (data.status === "success" && data.data) {
            setOrder(data.data);
            setLoading(false);
            // Fire conversion event exactly once when the order resolves
            track("checkout_complete", {
              order_number: data.data.order_number,
              value_pence: data.data.total,
            });
            return;
          }
        }
      } catch {
        // Will retry
      }

      attempts++;
      if (attempts < maxAttempts && !cancelled) {
        setTimeout(fetchOrder, 2000);
      } else {
        setLoading(false);
      }
    }

    fetchOrder();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <>
      <div
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(46,125,50,0.1)", border: "1px solid rgba(46,125,50,0.2)" }}
      >
        <CheckCircle size={28} style={{ color: "var(--success)" }} />
      </div>

      <h1
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-4xl)",
          fontWeight: "var(--weight-regular)",
          color: "var(--white)",
          marginBottom: "var(--space-3)",
        }}
      >
        {dict.success.title}
      </h1>
      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-base)", color: "var(--white-dim)", marginBottom: "var(--space-6)" }}>
        {dict.success.subtitle}
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
        </div>
      ) : order ? (
        <div
          className="mb-8 rounded-lg text-left"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}
        >
          <p className="mb-4" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
            {dict.success.orderNumber}
          </p>
          <p className="mb-4" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", color: "var(--white)" }}>
            {order.order_number}
          </p>
          {order.items.length > 0 && (
            <div className="mb-4 flex flex-col gap-3" style={{ borderTop: "1px solid var(--bg-border)", paddingTop: "var(--space-4)" }}>
              {order.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1">
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
                    {item.product_name} <span style={{ color: "var(--white-faint)", fontWeight: 400 }}>× {item.quantity}</span>
                  </p>
                  {item.variant_option_label && (
                    <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                      {item.variant_option_label}
                    </p>
                  )}
                  {item.customizations.length > 0 && (
                    <ul className="ml-3 mt-0.5 flex flex-col gap-0.5" style={{ borderLeft: "2px solid var(--gold)", paddingLeft: "var(--space-2)" }}>
                      {item.customizations.map((c) => (
                        <li key={c.key} style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}>
                          <span style={{ fontWeight: 600 }}>{c.label}:</span> {c.label_value}
                          {c.image_url && (
                            <a
                              href={c.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 underline"
                              style={{ color: "var(--gold)" }}
                            >
                              view
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--bg-border)", paddingTop: "var(--space-4)" }}>
            <div className="flex justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>Total</span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--gold-dark)" }}>
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
          <p className="mt-4" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
            {dict.success.confirmationSent} {order.email}
          </p>
        </div>
      ) : (
        <p className="mb-8" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
          Your order is being processed. You will receive a confirmation email shortly.
        </p>
      )}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Link
          href="/products"
          className="btn-gold inline-block rounded-md px-8 py-3 transition-all duration-300 hover:-translate-y-0.5"
          style={{ fontFamily: "var(--font-montserrat)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase" }}
        >
          {dict.success.continueShopping}
        </Link>
        {isAuthenticated && (
          <Link
            href="/account/orders"
            className="transition-colors duration-200 hover:text-[var(--gold)]"
            style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)" }}
          >
            {dict.success.viewOrders}
          </Link>
        )}
      </div>
    </>
  );
}
