import Link from "next/link";
import { HeroBackground } from "./hero-background";

interface HeroSectionProps {
  dict: {
    title: string;
    subtitle: string;
    cta: string;
    ctaSecondary: string;
  };
}

export function HeroSection({ dict }: HeroSectionProps) {
  return (
    <section
      className="relative flex min-h-[80vh] items-center overflow-hidden py-20 md:min-h-screen md:py-0"
      style={{ background: "var(--bg-primary)" }}
    >
      <HeroBackground />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl" data-animate="slide-left">
          <h1
            className="mb-4 sm:mb-6"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(2rem, 6vw, 4.5rem)",
              fontWeight: "var(--weight-regular)",
              color: "var(--white)",
              lineHeight: "var(--leading-tight)",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            {dict.title}
          </h1>

          <p
            className="mb-8 max-w-lg sm:mb-10"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "clamp(0.875rem, 2vw, 1.125rem)",
              color: "var(--white-dim)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            {dict.subtitle}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/products"
              className="btn-gold inline-block text-center transition-all duration-300 hover:-translate-y-0.5"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontWeight: "var(--weight-semibold)",
                fontSize: "var(--text-sm)",
                letterSpacing: "var(--tracking-wider)",
                textTransform: "uppercase",
                padding: "var(--space-4) var(--space-8)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {dict.cta}
            </Link>

            <Link
              href="/categories"
              className="inline-block text-center transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--gold)] hover:text-white hover:shadow-[0_4px_20px_rgba(187,148,41,0.4)]"
              style={{
                background: "transparent",
                color: "var(--gold)",
                border: "1px solid var(--gold)",
                fontFamily: "var(--font-montserrat)",
                fontWeight: "var(--weight-semibold)",
                fontSize: "var(--text-sm)",
                letterSpacing: "var(--tracking-wider)",
                textTransform: "uppercase",
                padding: "var(--space-4) var(--space-8)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {dict.ctaSecondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
