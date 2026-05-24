import Link from "next/link";
import { Star, Verified } from "lucide-react";
import type { RecentReview } from "@/hooks/recent-reviews.server";

interface RecentReviewsSectionProps {
  reviews: RecentReview[];
}

/**
 * Social-proof block on the landing page.
 *
 * Server-rendered from `/api/v1/reviews/recent/` — 4★+ reviews only, last
 * 6 chronologically. Hides itself entirely if there are no reviews yet
 * (avoids a "Reviews coming soon..." placeholder that screams "new shop,
 * no customers"). Cards link straight to the product so a curious
 * customer reads one review and can immediately click through to buy.
 */
export function RecentReviewsSection({ reviews }: RecentReviewsSectionProps) {
  if (reviews.length === 0) return null;

  // Show 3 prominently — 6 is the max the API returns but more than 3
  // visually competes with the actual product rows above and below.
  const featured = reviews.slice(0, 3);

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
            Recent reviews
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {featured.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: RecentReview }) {
  // Truncate body to ~180 chars so the card height is predictable —
  // the full review lives on the product page if customer wants more.
  const excerpt =
    review.body.length > 180
      ? `${review.body.slice(0, 180).trimEnd()}…`
      : review.body;

  return (
    <Link
      href={`/products/${review.product_slug}`}
      className="group flex flex-col gap-3 rounded-lg p-6 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--bg-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={14}
              fill={i < review.rating ? "var(--gold)" : "transparent"}
              stroke={i < review.rating ? "var(--gold)" : "var(--bg-border)"}
            />
          ))}
        </div>
        {review.is_verified_buyer && (
          <span
            className="flex items-center gap-1"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--success)",
              letterSpacing: "var(--tracking-wide)",
              textTransform: "uppercase",
            }}
          >
            <Verified size={11} />
            Verified buyer
          </span>
        )}
      </div>

      {review.title && (
        <p
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-lg)",
            fontWeight: "var(--weight-medium)",
            color: "var(--white)",
            lineHeight: "var(--leading-tight)",
          }}
        >
          {review.title}
        </p>
      )}

      <p
        className="flex-1"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          color: "var(--white-dim)",
          lineHeight: "var(--leading-relaxed)",
        }}
      >
        {excerpt}
      </p>

      <div
        className="flex items-center justify-between border-t pt-3"
        style={{ borderColor: "var(--bg-border)" }}
      >
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white-faint)",
          }}
        >
          {review.display_name}
        </span>
        <span
          className="group-hover:text-[var(--gold)]"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--gold-dark)",
            fontWeight: 500,
          }}
        >
          {review.product_name} →
        </span>
      </div>
    </Link>
  );
}
