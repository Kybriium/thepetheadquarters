"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics";
import type { Order } from "@/types/order";
import { endpoints } from "@/config/endpoints";
import { PrintReceiptButton, Receipt } from "@/components/orders/receipt";
import { TrackingCard } from "@/components/orders/tracking-card";
import type enCheckout from "@/i18n/dictionaries/en/checkout.json";

interface SuccessContentProps {
  dict: typeof enCheckout;
  sessionId: string;
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
      <div className="print-hide mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(46,125,50,0.1)", border: "1px solid rgba(46,125,50,0.2)" }}>
        <CheckCircle size={28} style={{ color: "var(--success)" }} />
      </div>

      <h1
        className="print-hide text-center"
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
      <p className="print-hide text-center" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-base)", color: "var(--white-dim)", marginBottom: "var(--space-8)" }}>
        {dict.success.subtitle}
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
        </div>
      ) : order ? (
        <>
          {/* If the customer hits the success URL after the order has
              shipped (e.g. they bookmarked it), surface tracking above
              the receipt — same UX as the account order detail page. */}
          <div className="mb-6">
            <TrackingCard order={order} />
          </div>
          <Receipt order={order} />
          <div className="print-hide mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <PrintReceiptButton />
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
      ) : (
        <p className="text-center" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
          Your order is being processed. You will receive a confirmation email shortly.
        </p>
      )}
    </>
  );
}
