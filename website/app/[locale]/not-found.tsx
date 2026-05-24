import Link from "next/link";
import type { Metadata } from "next";
import { Home, Search, Mail, PawPrint } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for doesn't exist on The Pet Headquarters.",
  // Tell crawlers not to index 404 responses — they're not real content.
  robots: { index: false, follow: false },
};

/**
 * Global 404 for any route under /[locale] that doesn't match a real page.
 * Renders inside the site's locale layout, so header + footer stay intact —
 * customers can navigate away without hitting Back twice.
 */
export default function NotFoundPage() {
  const labelStyle = {
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-sm)" as const,
    fontWeight: "var(--weight-semibold)" as const,
    color: "var(--white)",
  };

  const subStyle = {
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-xs)" as const,
    color: "var(--white-faint)",
    marginTop: 2,
  };

  return (
    <main
      className="flex min-h-[70vh] items-center justify-center py-16 md:py-24"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="mx-auto w-full max-w-2xl px-4 text-center sm:px-6">
        {/* Big gold 404 with a paw underline — branded, friendly, not corporate */}
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background: "rgba(187,148,41,0.08)",
            border: "1px solid rgba(187,148,41,0.2)",
          }}
        >
          <PawPrint size={36} style={{ color: "var(--gold)" }} />
        </div>

        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-semibold)",
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            marginBottom: "var(--space-3)",
          }}
        >
          404 — Page not found
        </p>

        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2rem, 6vw, 3.5rem)",
            fontWeight: "var(--weight-regular)",
            color: "var(--white)",
            lineHeight: "var(--leading-tight)",
            marginBottom: "var(--space-4)",
          }}
        >
          Hmm, this page wandered off
        </h1>

        <p
          className="mx-auto max-w-md"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-base)",
            color: "var(--white-dim)",
            lineHeight: "var(--leading-relaxed)",
            marginBottom: "var(--space-8)",
          }}
        >
          The link might be broken, or the page may have moved. Try one of these
          instead — or get in touch if you think something's wrong.
        </p>

        {/* Quick-access cards: home, browse products, contact us */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/"
            className="group flex flex-col items-center gap-2 rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <Home size={20} style={{ color: "var(--gold)" }} />
            <span style={labelStyle}>Home</span>
            <span style={subStyle}>Start over</span>
          </Link>
          <Link
            href="/products"
            className="group flex flex-col items-center gap-2 rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <Search size={20} style={{ color: "var(--gold)" }} />
            <span style={labelStyle}>Browse</span>
            <span style={subStyle}>All products</span>
          </Link>
          <Link
            href="/contact"
            className="group flex flex-col items-center gap-2 rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <Mail size={20} style={{ color: "var(--gold)" }} />
            <span style={labelStyle}>Contact</span>
            <span style={subStyle}>Get in touch</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
