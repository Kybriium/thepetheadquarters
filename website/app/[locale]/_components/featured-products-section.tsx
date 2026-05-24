import type { Product } from "@/types/product";
import { ProductCard } from "./product-card";

import Link from "next/link";

interface FeaturedProductsSectionProps {
  dict: {
    title: string;
  };
  products: Product[];
}

export function FeaturedProductsSection({ dict, products }: FeaturedProductsSectionProps) {
  if (products.length === 0) return null;

  return (
    <section className="py-10 md:py-14" style={{ background: "var(--bg-secondary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
              fontWeight: "var(--weight-medium)",
              color: "var(--white)",
            }}
          >
            {dict.title}
          </h2>
          <Link
            href="/products"
            className="hover:text-[var(--gold)]"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--gold-dark)",
              letterSpacing: "var(--tracking-wider)",
              textTransform: "uppercase",
            }}
          >
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4" data-animate="stagger">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
