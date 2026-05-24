"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { PromoCodeBox, type PromoState } from "@/components/cart/promo-code-box";
import { FreeDeliveryProgress } from "@/components/storefront/free-delivery-progress";
import { TrustBadgesCluster } from "@/components/storefront/trust-badges-cluster";
import { PaymentMethodsStrip } from "@/components/storefront/payment-methods-strip";
import {
  SHIPPING_RATE_PENCE,
  FREE_DELIVERY_THRESHOLD_PENCE,
} from "@/lib/shipping";

interface CartSummaryProps {
  dict: {
    title: string;
    subtotal: string;
    delivery: string;
    deliveryNote: string;
    total: string;
    checkout: string;
    continueShopping: string;
  };
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function CartSummary({ dict }: CartSummaryProps) {
  const { subtotal, totalItems } = useCart();
  const [promo, setPromo] = useState<PromoState | null>(null);

  const baseShipping = subtotal >= FREE_DELIVERY_THRESHOLD_PENCE ? 0 : SHIPPING_RATE_PENCE;
  const freeShippingFromPromo = promo?.appliesToShipping ?? false;
  const shipping = freeShippingFromPromo ? 0 : baseShipping;
  const itemDiscount = freeShippingFromPromo ? 0 : Math.min(promo?.discountAmount ?? 0, subtotal);
  const shippingDiscount = freeShippingFromPromo ? baseShipping : 0;
  const totalDiscount = itemDiscount + shippingDiscount;
  const total = subtotal + shipping - itemDiscount;

  return (
    <div
      className="rounded-lg p-6"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
    >
      <h2
        className="mb-6"
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-medium)",
          color: "var(--white)",
        }}
      >
        {dict.title}
      </h2>

      {/* Last-chance nudge — bar fills as customer adds items, flips to
          "FREE delivery unlocked" once over £30. Sits above the totals
          so it can still influence behaviour (add one more item) before
          they read the bottom line. */}
      <div className="mb-4">
        <FreeDeliveryProgress />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between">
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            {dict.subtotal} ({totalItems} items)
          </span>
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
            {formatPrice(subtotal)}
          </span>
        </div>

        <div className="flex justify-between">
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            {dict.delivery}
          </span>
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: shipping === 0 ? "var(--success)" : "var(--white)", fontWeight: 600 }}>
            {shipping === 0 ? "FREE" : "£3.99"}
          </span>
        </div>

        {totalDiscount > 0 && (
          <div className="flex justify-between">
            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)" }}>
              Discount
            </span>
            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)", fontWeight: 600 }}>
              −{formatPrice(totalDiscount)}
            </span>
          </div>
        )}

        <div className="pt-1">
          <PromoCodeBox onChange={setPromo} />
        </div>

        <div style={{ height: 1, background: "var(--bg-border)", margin: "var(--space-2) 0" }} />

        <div className="flex justify-between">
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-base)", fontWeight: 600, color: "var(--white)" }}>
            {dict.total}
          </span>
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--gold-dark)" }}>
            {formatPrice(total)}
          </span>
        </div>
      </div>

      <Link
        href="/checkout"
        className="btn-gold mt-6 block w-full rounded-md py-3 text-center transition-all duration-300 hover:-translate-y-0.5"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontWeight: "var(--weight-semibold)",
          fontSize: "var(--text-sm)",
          letterSpacing: "var(--tracking-wider)",
          textTransform: "uppercase",
        }}
      >
        {dict.checkout}
      </Link>

      <Link
        href="/products"
        className="mt-3 block text-center transition-colors duration-200 hover:text-[var(--gold)]"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          color: "var(--white-faint)",
        }}
      >
        {dict.continueShopping}
      </Link>

      {/* Trust block at the bottom — last-second reassurance immediately
          before the customer clicks Checkout. Compact variants so they
          don't dwarf the totals. */}
      <div className="mt-6 flex flex-col gap-3">
        <TrustBadgesCluster compact />
        <PaymentMethodsStrip compact />
      </div>
    </div>
  );
}
