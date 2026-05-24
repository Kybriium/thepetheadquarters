"use client";

/**
 * Dedicated "Recently viewed" page.
 *
 * Lists every product the customer's browser has remembered (up to the
 * MAX_ITEMS cap inside lib/recently-viewed.ts — currently 12). The
 * inline section on the landing page only shows the first 8 as a
 * horizontal rail; this page is for the customer who wants to see the
 * whole list as a grid.
 *
 * Pure client component — localStorage is browser-only state. The page
 * renders an empty hint when the list is empty (rather than 404ing) so
 * a customer who lands here from a bookmark or the footer doesn't hit
 * a dead end.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eraser } from "lucide-react";
import {
  clearRecentlyViewed,
  readRecentlyViewed,
  type RecentlyViewedItem,
} from "@/lib/recently-viewed";

export default function RecentlyViewedPage() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readRecentlyViewed());
    setHydrated(true);
  }, []);

  function handleClear() {
    if (!confirm("Clear your recently-viewed history? This won't affect your account or orders.")) {
      return;
    }
    clearRecentlyViewed();
    setItems([]);
  }

  // Don't paint anything until we've read localStorage — avoids a flash
  // of the empty state on initial render for returning visitors.
  if (!hydrated) {
    return (
      <main className="py-16 md:py-24" style={{ background: "var(--bg-primary)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex justify-center py-16">
            <div
              className="h-6 w-6 animate-spin rounded-full"
              style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-12 md:py-16" style={{ background: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3 md:mb-10">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                fontWeight: "var(--weight-regular)",
                color: "var(--white)",
                letterSpacing: "var(--tracking-tight)",
              }}
            >
              Recently viewed
            </h1>
            <p
              className="mt-1"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                color: "var(--white-faint)",
              }}
            >
              {items.length > 0
                ? `${items.length} ${items.length === 1 ? "product" : "products"} you've looked at on this device`
                : "Nothing here yet — products you view will show up automatically."}
            </p>
          </div>

          {items.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{
                background: "transparent",
                border: "1px solid var(--bg-border)",
                color: "var(--white-dim)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                letterSpacing: "var(--tracking-wider)",
                textTransform: "uppercase",
              }}
            >
              <Eraser size={13} />
              Clear history
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div
            className="rounded-lg p-10 text-center"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <p
              className="mx-auto max-w-md"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                color: "var(--white-dim)",
                lineHeight: 1.6,
              }}
            >
              Your recently-viewed list is empty. Browse the catalog and
              the products you open will appear here for easy access
              later.
            </p>
            <Link
              href="/products"
              className="btn-gold mt-6 inline-block rounded-md px-6 py-3"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                letterSpacing: "var(--tracking-wider)",
                textTransform: "uppercase",
              }}
            >
              Browse products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
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
        )}
      </div>
    </main>
  );
}
