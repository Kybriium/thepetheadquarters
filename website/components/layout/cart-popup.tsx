"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart-context";

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function CartPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, updateQuantity, removeItem, totalItems, subtotal } = useCart();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 transition-opacity duration-300 sm:hidden"
        style={{
          background: "rgba(0,0,0,0.5)",
          zIndex: 99,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
        }}
        onClick={onClose}
      />

      <div
        className="fixed inset-x-3 top-16 z-[100] overflow-hidden rounded-lg shadow-2xl transition-all duration-300 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          maxHeight: "calc(100vh - 80px)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.95)",
          pointerEvents: open ? "all" : "none",
          transformOrigin: "top right",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--bg-border)" }}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: "var(--gold)" }} />
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--weight-semibold)",
                color: "var(--white)",
              }}
            >
              Cart
            </span>
            {totalItems > 0 && (
              <span
                className="flex h-5 items-center rounded-full px-2"
                style={{
                  background: "rgba(187,148,41,0.15)",
                  color: "var(--gold)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
              >
                {totalItems}
              </span>
            )}
          </div>
          <Link
            href="/cart"
            onClick={onClose}
            className="flex items-center gap-1 transition-colors duration-200 hover:text-[var(--gold)]"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--gold)",
              letterSpacing: "var(--tracking-wider)",
              textTransform: "uppercase",
            }}
          >
            View Cart
            <ArrowRight size={12} />
          </Link>
        </div>

        {/* Empty */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "rgba(187,148,41,0.1)" }}
            >
              <ShoppingCart size={22} style={{ color: "var(--gold)" }} />
            </div>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
              Your cart is empty
            </p>
          </div>
        ) : (
          <>
            {/* Items */}
            <div className="max-h-72 overflow-y-auto overscroll-contain px-3 py-3 sm:max-h-64">
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <div
                    key={item.lineId}
                    className="flex gap-3 rounded-md p-2.5 transition-all duration-200 hover:bg-[var(--bg-border)]"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    <Link
                      href={`/products/${item.slug}`}
                      onClick={onClose}
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded"
                      style={{ background: "var(--bg-border)" }}
                    >
                      {item.image && (
                        <Image src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <Link
                          href={`/products/${item.slug}`}
                          onClick={onClose}
                          className="line-clamp-1 transition-colors duration-200 hover:text-[var(--gold)]"
                          style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--white)" }}
                        >
                          {item.name}
                        </Link>
                        {item.optionLabel && (
                          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
                            {item.optionLabel}
                          </span>
                        )}
                        {item.customizationSummary.length > 0 && (
                          <span className="mt-0.5 block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--gold)" }}>
                            ✦ {item.customizationSummary.map((c) => c.label_value).join(" · ")}
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between">
                        <div className="flex items-center overflow-hidden rounded" style={{ border: "1px solid var(--bg-border)" }}>
                          <button
                            onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                            className="flex h-6 w-6 items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-border)]"
                            style={{ background: "var(--bg-secondary)", color: "var(--white-dim)" }}
                          >
                            <Minus size={10} />
                          </button>
                          <span
                            className="flex h-6 w-7 items-center justify-center"
                            style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", fontWeight: 600, color: "var(--white)" }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                            className="flex h-6 w-6 items-center justify-center transition-colors duration-150 hover:bg-[var(--bg-border)]"
                            style={{ background: "var(--bg-secondary)", color: "var(--white-dim)" }}
                          >
                            <Plus size={10} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--white)" }}>
                            {formatPrice((item.price + item.customizationSurcharge) * item.quantity)}
                          </span>
                          <button
                            onClick={() => removeItem(item.lineId)}
                            className="flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 hover:bg-[rgba(244,67,54,0.15)]"
                            style={{ color: "var(--error)" }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
              <div className="mb-3 flex justify-between">
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
                  Subtotal
                </span>
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--gold)" }}>
                  {formatPrice(subtotal)}
                </span>
              </div>
              <Link
                href="/cart"
                onClick={onClose}
                className="btn-gold block w-full rounded-md py-2.5 text-center transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontWeight: "var(--weight-semibold)",
                  fontSize: "var(--text-xs)",
                  letterSpacing: "var(--tracking-wider)",
                  textTransform: "uppercase",
                }}
              >
                View Cart
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
