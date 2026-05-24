"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { readRecentlyViewed, type RecentlyViewedItem } from "@/lib/recently-viewed";

/**
 * Personal social-proof for returning visitors — "you were looking at
 * these earlier". Reads directly from localStorage, so first-time
 * visitors see nothing (returning visitors get a fast nudge back to
 * the products they'd already shown interest in, which is one of the
 * highest-converting touchpoints in e-commerce).
 *
 * Renders client-side only because localStorage is browser-state.
 */
export function RecentlyViewedSection() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    setItems(readRecentlyViewed());
  }, []);

  // Hide entirely for first-time visitors (nothing in localStorage).
  if (items.length === 0) return null;

  // Cap visible to 4 — fills one tidy desktop row (2 / 3 / 4 columns
  // across breakpoints) without crowding the next section. Anything
  // beyond that lives behind the "View all" link to /recently-viewed.
  const MAX_INLINE = 4;
  const visible = items.slice(0, MAX_INLINE);
  const hasOverflow = items.length > MAX_INLINE;

  return (
    <section className="py-12 md:py-16" style={{ background: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between" data-animate="fade-up">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: "var(--weight-regular)",
              color: "var(--white)",
              lineHeight: "var(--leading-tight)",
            }}
          >
            Recently viewed
          </h2>
          {/* "View all" goes to the dedicated /recently-viewed page,
              which shows every remembered item up to the localStorage
              cap. Always shown when there's overflow so the customer
              knows there's more behind it; suppressed when the grid
              already holds everything. */}
          {hasOverflow ? (
            <Link
              href="/recently-viewed"
              className="inline-flex items-center gap-1 hover:text-[var(--gold)]"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--gold-dark)",
                letterSpacing: "var(--tracking-wider)",
                textTransform: "uppercase",
              }}
            >
              View all ({items.length})
              <ChevronRight size={12} />
            </Link>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-faint)",
              }}
            >
              Pick up where you left off
            </span>
          )}
        </div>

        <div
          className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4"
          data-animate="stagger"
        >
          {visible.map((item) => (
            <Link
              key={item.slug}
              href={`/products/${item.slug}`}
              className="card-hover group flex flex-col overflow-hidden rounded-lg"
              style={{ background: "var(--bg-secondary)" }}
            >
              <div
                className="relative aspect-square overflow-hidden"
                style={{ background: "var(--bg-tertiary)" }}
              >
                {item.image && (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-3 sm:p-4">
                <h3
                  className="mb-2 line-clamp-2"
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "clamp(0.95rem, 2vw, 1.15rem)",
                    fontWeight: "var(--weight-medium)",
                    color: "var(--white)",
                    lineHeight: "var(--leading-tight)",
                  }}
                >
                  {item.name}
                </h3>
                {item.price !== null && (
                  <span
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 700,
                      color: "var(--gold-dark)",
                    }}
                  >
                    £{(item.price / 100).toFixed(2)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
