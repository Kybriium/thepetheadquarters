import Link from "next/link";
import Image from "next/image";
import type { Brand } from "@/types/brand";

interface BrandsSectionProps {
  dict: {
    label: string;
    title: string;
  };
  brands: Brand[];
}

export function BrandsSection({ dict, brands }: BrandsSectionProps) {
  if (brands.length === 0) return null;

  return (
    <section className="py-16 md:py-24" style={{ background: "var(--bg-secondary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 text-center md:mb-12" data-animate="fade-up">
          <span
            className="mb-4 block"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              letterSpacing: "var(--tracking-widest)",
              textTransform: "uppercase",
              color: "var(--gold-dark)",
            }}
          >
            {dict.label}
          </span>
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: "var(--weight-regular)",
              color: "var(--white)",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            {dict.title}
          </h2>
          <div
            className="mx-auto mt-4"
            data-animate="divider"
            style={{ width: 60, height: 1, background: "var(--gold)" }}
          />
        </div>

        <div className="grid grid-cols-2 items-center justify-items-center gap-6 sm:flex sm:flex-wrap sm:justify-center sm:gap-10" data-animate="stagger">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.slug}`}
              className="transition-opacity duration-300 hover:opacity-100"
              style={{ opacity: 0.6 }}
            >
              {brand.logo ? (
                <Image
                  src={brand.logo}
                  alt={brand.name}
                  width={200}
                  height={80}
                  sizes="(max-width: 640px) 32px, 48px"
                  className="h-8 w-auto object-contain sm:h-12"
                  style={{ filter: "brightness(0)" }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--weight-medium)",
                    color: "var(--white-dim)",
                    letterSpacing: "var(--tracking-wider)",
                    textTransform: "uppercase",
                  }}
                >
                  {brand.name}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
