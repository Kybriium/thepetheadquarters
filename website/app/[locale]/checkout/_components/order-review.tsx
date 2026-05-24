"use client";

import Image from "next/image";
import type { CartItem } from "@/types/cart";
import type enCheckout from "@/i18n/dictionaries/en/checkout.json";
import { PromoCodeBox, type PromoState } from "@/components/cart/promo-code-box";

interface OrderReviewProps {
  dict: typeof enCheckout;
  items: CartItem[];
  shippingAddress: {
    full_name: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    postcode: string;
  };
  email: string;
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  promoCode: string;
  total: number;
  isSubmitting: boolean;
  onPlaceOrder: () => void;
  onEditShipping: () => void;
  onPromoChange: (state: PromoState | null) => void;
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function OrderReview({
  dict, items, shippingAddress, email, subtotal, shippingCost, discountAmount, promoCode, total, isSubmitting, onPlaceOrder, onEditShipping, onPromoChange,
}: OrderReviewProps) {
  // Reference unused props so the future-proof signature stays intact
  void promoCode;
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      {/* Left — items + shipping */}
      <div className="flex flex-col gap-6">
        {/* Shipping address card */}
        <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-5)" }}>
          <div className="mb-3 flex items-center justify-between">
            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
              {dict.review.shippingTo}
            </span>
            <button
              onClick={onEditShipping}
              style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}
            >
              {dict.review.editShipping}
            </button>
          </div>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
            {shippingAddress.full_name}
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
            {shippingAddress.address_line_1}
            {shippingAddress.address_line_2 && `, ${shippingAddress.address_line_2}`}
            <br />
            {shippingAddress.city}{shippingAddress.county ? `, ${shippingAddress.county}` : ""} {shippingAddress.postcode}
          </p>
          <p className="mt-1" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
            {email}
          </p>
        </div>

        {/* Items */}
        <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-5)" }}>
          <span className="mb-4 block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
            {dict.review.items} ({items.length})
          </span>
          <div className="flex flex-col gap-4">
            {items.map((item) => (
              <div key={item.lineId} className="flex gap-4" style={{ paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--bg-border)" }}>
                {item.image && (
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md" style={{ background: "var(--bg-tertiary)" }}>
                    <Image src={item.image} alt={item.name} fill sizes="64px" className="object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
                    {item.name}
                  </p>
                  {item.optionLabel && (
                    <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                      {item.optionLabel}
                    </p>
                  )}
                  {item.customizationSummary.length > 0 && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {item.customizationSummary.map((c) => (
                        <p key={c.key} style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}>
                          <span style={{ fontWeight: 600 }}>{c.label}:</span> {c.label_value}
                          {c.surcharge_pence > 0 && (
                            <span style={{ color: "var(--white-faint)" }}> (+{formatPrice(c.surcharge_pence)})</span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                    Qty: {item.quantity}
                  </p>
                </div>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>
                  {formatPrice((item.price + item.customizationSurcharge) * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — summary */}
      <div>
        <div className="sticky top-24 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}>
          <div className="flex flex-col gap-3" style={{ paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--bg-border)" }}>
            <div className="flex justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
                {dict.review.subtotal}
              </span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>
                {formatPrice(subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
                {dict.review.shipping}
              </span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: shippingCost === 0 ? "var(--success)" : "var(--white)" }}>
                {shippingCost === 0 ? dict.review.shippingFree : formatPrice(shippingCost)}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between">
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)" }}>
                  Discount
                </span>
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)" }}>
                  −{formatPrice(discountAmount)}
                </span>
              </div>
            )}

            <div className="pt-1">
              <PromoCodeBox email={email} onChange={onPromoChange} />
            </div>
          </div>

          <div className="flex justify-between" style={{ paddingTop: "var(--space-4)" }}>
            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>
              {dict.review.total}
            </span>
            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--gold-dark)" }}>
              {formatPrice(total)}
            </span>
          </div>

          <button
            onClick={onPlaceOrder}
            disabled={isSubmitting}
            className="btn-gold mt-6 w-full rounded-md py-3.5 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
            style={{ fontFamily: "var(--font-montserrat)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase" }}
          >
            {isSubmitting ? dict.review.processing : dict.review.placeOrder}
          </button>

          {shippingCost > 0 && (
            <p className="mt-3 text-center" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
              {dict.review.freeShippingNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
