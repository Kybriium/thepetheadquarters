import Link from "next/link";
import type { Metadata } from "next";

/**
 * Root-level 404 fallback.
 *
 * Used when a request can't be matched by the proxy (paths with dots,
 * static-file misses, or edge cases that escape the [locale] segment).
 * Pure server component, no dictionary lookup, no client-side hooks —
 * has to render even when nothing else on the page does.
 *
 * The branded version with header / footer / locale chrome lives at
 * /[locale]/not-found.tsx and handles 99% of in-app 404s.
 */
export const metadata: Metadata = {
  title: "Page not found — The Pet Headquarters",
  robots: { index: false, follow: false },
};

export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          background: "#0F0F12",
          color: "#F4F1EA",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <main
          style={{
            maxWidth: 420,
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#C6A030",
              marginBottom: "0.75rem",
            }}
          >
            404 — Page not found
          </p>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 400,
              lineHeight: 1.2,
              marginBottom: "1rem",
              color: "#FFFFFF",
            }}
          >
            This page wandered off
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "rgba(244,241,234,0.7)",
              marginBottom: "2rem",
            }}
          >
            The link might be broken, or the page may have moved.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "#C6A030",
              color: "#FFFFFF",
              padding: "0.75rem 2rem",
              borderRadius: 4,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Go home
          </Link>
        </main>
      </body>
    </html>
  );
}
