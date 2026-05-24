"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
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

type SyncState = "loading" | "found" | "pending" | "noSession";

export function SuccessContent({ dict, sessionId }: SuccessContentProps) {
  const { clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<SyncState>(sessionId ? "loading" : "noSession");
  const [syncTriedExplicitly, setSyncTriedExplicitly] = useState(false);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!sessionId) return;

    // Poll the by-session endpoint while the Stripe webhook catches up.
    // 15 retries × 2s = 30s window — most webhooks land within 1-2s but
    // we leave headroom for retries / clock skew.
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
            setState("found");
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
      } else if (!cancelled) {
        // Webhook hasn't reached us — fall through to the explicit
        // sync-by-session endpoint as a last-resort: that endpoint
        // verifies payment with Stripe directly and creates the order
        // if Stripe confirms it's paid. If THAT also fails, we show the
        // amber "we'll email you" state with the session id.
        try {
          setSyncTriedExplicitly(true);
          const res = await fetch(endpoints.orders.syncBySession(sessionId), {
            method: "POST",
            credentials: "include",
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.data) {
              setOrder(data.data);
              setState("found");
              track("checkout_complete", {
                order_number: data.data.order_number,
                value_pence: data.data.total,
              });
              return;
            }
          }
        } catch {
          // Fall through to pending state
        }
        setState("pending");
      }
    }

    fetchOrder();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ---- Render --------------------------------------------------------

  // No session_id in URL — likely someone landed here directly. Neutral
  // copy, no celebration, no error theatre.
  if (state === "noSession") {
    return (
      <div className="text-center">
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-base)",
            color: "var(--white-dim)",
          }}
        >
          No checkout session found. If you've just paid, check your
          email for the order confirmation.
        </p>
      </div>
    );
  }

  // Still verifying — spinner only, NO green checkmark and NO "success"
  // headline. Don't promise anything until the backend confirms.
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: "var(--gold)" }}
        />
        <p
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-2xl)",
            color: "var(--white)",
          }}
        >
          Confirming your payment…
        </p>
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            color: "var(--white-faint)",
            maxWidth: 380,
          }}
        >
          This usually takes a few seconds. Please don't close this tab.
        </p>
      </div>
    );
  }

  // Payment received by Stripe but no order in our DB yet — this is the
  // case where the user previously saw a fake "success" page. Now they
  // see an honest amber state with the session id so support can find
  // their order if it never materialises.
  if (state === "pending") {
    return (
      <div className="text-center">
        <div
          className="print-hide mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: "rgba(214,158,46,0.10)",
            border: "1px solid rgba(214,158,46,0.30)",
          }}
        >
          <AlertCircle size={28} style={{ color: "#E0A82E" }} />
        </div>
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-3xl)",
            fontWeight: "var(--weight-regular)",
            color: "var(--white)",
            marginBottom: "var(--space-3)",
          }}
        >
          Payment received — order is syncing
        </h1>
        <p
          className="mx-auto"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            color: "var(--white-dim)",
            maxWidth: 520,
            lineHeight: 1.6,
          }}
        >
          Stripe has confirmed your payment, but the order hasn't fully
          landed in our system yet. You will receive a confirmation
          email within the next few minutes. If it doesn't arrive,
          please email <a href="mailto:contact@thepetheadquarters.co.uk" style={{ color: "var(--gold)" }}>contact@thepetheadquarters.co.uk</a> and quote the reference below.
        </p>
        <div
          className="mx-auto mt-6 inline-block rounded-md px-3 py-2"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--bg-border)",
            fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
            fontSize: "var(--text-xs)",
            color: "var(--white-dim)",
            wordBreak: "break-all",
          }}
        >
          {sessionId}
        </div>
        {syncTriedExplicitly && (
          <p
            className="mt-4 text-center"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              color: "var(--white-faint)",
            }}
          >
            We tried twice automatically. Your money is safe with Stripe.
          </p>
        )}
      </div>
    );
  }

  // state === "found" — the genuine success state. NOW we celebrate.
  return (
    <>
      <div
        className="print-hide mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(46,125,50,0.1)", border: "1px solid rgba(46,125,50,0.2)" }}
      >
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
      <p
        className="print-hide text-center"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-base)",
          color: "var(--white-dim)",
          marginBottom: "var(--space-8)",
        }}
      >
        {dict.success.subtitle}
      </p>

      <div className="mb-6">
        <TrackingCard order={order!} />
      </div>
      <Receipt order={order!} />
      <div className="print-hide mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <PrintReceiptButton />
        <Link
          href="/products"
          className="btn-gold inline-block rounded-md px-8 py-3 transition-all duration-300 hover:-translate-y-0.5"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontWeight: "var(--weight-semibold)",
            fontSize: "var(--text-sm)",
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
          }}
        >
          {dict.success.continueShopping}
        </Link>
        {isAuthenticated && (
          <Link
            href="/account/orders"
            className="transition-colors duration-200 hover:text-[var(--gold)]"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              color: "var(--gold-dark)",
            }}
          >
            {dict.success.viewOrders}
          </Link>
        )}
      </div>
    </>
  );
}
