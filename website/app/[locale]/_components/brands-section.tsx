import Link from "next/link";
import Image from "next/image";
import type { Brand } from "@/types/brand";

interface BrandsSectionProps {
  dict: {
    title: string;
  };
  brands: Brand[];
}

export function BrandsSection({ dict, brands }: BrandsSectionProps) {
  if (brands.length === 0) return null;

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
            href="/brands"
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.slug}`}
              className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg p-3 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--bg-border)",
              }}
            >
              {brand.logo ? (
                <Image
                  src={brand.logo}
                  alt={brand.name}
                  width={200}
                  height={80}
                  sizes="(max-width: 640px) 40vw, 200px"
                  className="max-h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "var(--text-xl)",
                    fontWeight: "var(--weight-medium)",
                    color: "#0F0F12",
                    letterSpacing: "var(--tracking-wide)",
                  }}
                >
                  {brand.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span
                className="text-center"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#3A3A40",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                {brand.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
