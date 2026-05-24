"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart-context";

interface CartItemsProps {
  dict: {
    remove: string;
    quantity: string;
  };
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function CartItems({ dict }: CartItemsProps) {
  const { items, updateQuantity, removeItem } = useCart();

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        const unitPrice = item.price + item.customizationSurcharge;
        const customizationImage = item.customizationSummary.find(
          (c) => c.field_type === "image",
        );
        const customizationImageUrl =
          customizationImage && typeof customizationImage.value === "string"
            ? customizationImage.value
            : undefined;
        return (
          <div
            key={item.lineId}
            className="flex gap-4 rounded-lg p-4 sm:gap-6"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
          >
            {/* Image */}
            <Link
              href={`/products/${item.slug}`}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md sm:h-28 sm:w-28"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {item.image ? (
                <Image src={item.image} alt={item.name} fill sizes="112px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ color: "var(--white-faint)", fontSize: "var(--text-xs)" }}>
                  No Image
                </div>
              )}
            </Link>

            {/* Details */}
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <Link
                  href={`/products/${item.slug}`}
                  className="transition-colors duration-200 hover:text-[var(--gold)]"
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "clamp(1rem, 2vw, 1.25rem)",
                    fontWeight: "var(--weight-medium)",
                    color: "var(--white)",
                    lineHeight: "var(--leading-tight)",
                  }}
                >
                  {item.name}
                </Link>
                {item.optionLabel && (
                  <p
                    className="mt-1"
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: "var(--text-xs)",
                      color: "var(--white-faint)",
                    }}
                  >
                    {item.optionLabel}
                  </p>
                )}
                {item.customizationSummary.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {item.customizationSummary.map((c) => (
                      <div
                        key={c.key}
                        className="flex items-center gap-2"
                        style={{
                          fontFamily: "var(--font-montserrat)",
                          fontSize: "var(--text-xs)",
                          color: "var(--white-dim)",
                        }}
                      >
                        <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                          {c.label}:
                        </span>
                        {c.field_type === "image" && customizationImageUrl ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="relative inline-block h-6 w-6 overflow-hidden rounded"
                              style={{ background: "var(--bg-tertiary)" }}
                            >
                              <Image src={customizationImageUrl} alt={c.label} fill sizes="24px" className="object-cover" unoptimized />
                            </span>
                            <span style={{ color: "var(--white-faint)" }}>Uploaded</span>
                          </span>
                        ) : (
                          <span>{c.label_value}</span>
                        )}
                        {c.surcharge_pence > 0 && (
                          <span style={{ color: "var(--white-faint)" }}>
                            (+£{(c.surcharge_pence / 100).toFixed(2)})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                {/* Quantity */}
                <div
                  className="flex items-center overflow-hidden rounded-md"
                  style={{ border: "1px solid var(--bg-border)" }}
                >
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center transition-colors duration-200 hover:bg-[var(--bg-border)]"
                    style={{ background: "var(--bg-tertiary)", color: "var(--white-dim)" }}
                  >
                    <Minus size={14} />
                  </button>
                  <span
                    className="flex h-8 w-10 items-center justify-center"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--white)",
                      fontFamily: "var(--font-montserrat)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                    }}
                  >
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center transition-colors duration-200 hover:bg-[var(--bg-border)]"
                    style={{ background: "var(--bg-tertiary)", color: "var(--white-dim)" }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Price + Remove */}
                <div className="flex items-center gap-4">
                  <span
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: "var(--text-base)",
                      fontWeight: "var(--weight-semibold)",
                      color: "var(--white)",
                    }}
                  >
                    {formatPrice(unitPrice * item.quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(item.lineId)}
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 hover:bg-[rgba(244,67,54,0.1)]"
                    style={{ color: "var(--error)" }}
                    title={dict.remove}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
