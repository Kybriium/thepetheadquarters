import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/types/product";
import { StarRating } from "@/components/ui/star-rating";

interface ProductCardProps {
  product: Product;
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function ProductCard({ product }: ProductCardProps) {
  // Sale calc — guard against null and equal/lower compare-at values so
  // we never render a fake discount. Backend already nulls these out
  // when they don't represent a real saving, but we double-check here
  // to keep this component honest in isolation.
  const onSale =
    product.min_price !== null &&
    product.min_compare_at_price !== null &&
    product.min_compare_at_price > product.min_price;
  const saveAmount = onSale
    ? (product.min_compare_at_price as number) - (product.min_price as number)
    : 0;
  const savePercent = onSale
    ? Math.round((saveAmount / (product.min_compare_at_price as number)) * 100)
    : 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="card-hover group block overflow-hidden rounded-lg"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div
        className="relative aspect-square overflow-hidden"
        style={{ borderRadius: "var(--radius-lg) var(--radius-lg) 0 0" }}
      >
        {product.primary_image ? (
          <Image
            src={product.primary_image}
            alt={product.primary_image_alt || product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--white-faint)",
              fontSize: "var(--text-sm)",
            }}
          >
            No Image
          </div>
        )}

        {/* Aggressive sale badge — top-left, red, with savings amount.
            Outranks the out-of-stock badge intentionally: if the item is
            on sale AND out of stock we'd rather highlight the price drop
            so the customer reaches the PDP and sees full context. */}
        {onSale && (
          <span
            className="absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 shadow-sm sm:left-3 sm:top-3"
            style={{
              background: "#D62828",
              color: "#FFFFFF",
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            SAVE {formatPrice(saveAmount)}
          </span>
        )}

        {!product.in_stock && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 sm:right-3 sm:top-3 sm:px-3 sm:py-1"
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "#FFFFFF",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-medium)",
            }}
          >
            Out of Stock
          </span>
        )}
      </div>

      <div className="p-3 sm:p-4">
        <h3
          className="mb-1 line-clamp-2 sm:mb-2"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(0.875rem, 2vw, 1.25rem)",
            fontWeight: "var(--weight-medium)",
            color: "var(--white)",
            lineHeight: "var(--leading-tight)",
          }}
        >
          {product.name}
        </h3>

        {product.average_rating > 0 && (
          <div className="mb-1 sm:mb-2">
            <StarRating
              rating={Number(product.average_rating)}
              size={12}
              reviewCount={product.review_count}
            />
          </div>
        )}

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {product.min_price !== null && (
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "clamp(0.875rem, 2vw, 1.125rem)",
                fontWeight: "var(--weight-bold)",
                color: onSale ? "#FF6B6B" : "var(--white)",
              }}
            >
              {product.min_price === product.max_price
                ? formatPrice(product.min_price)
                : `${formatPrice(product.min_price)} – ${formatPrice(product.max_price!)}`}
            </span>
          )}

          {onSale && (
            <>
              <span
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "clamp(0.75rem, 1.6vw, 0.9rem)",
                  color: "var(--white-faint)",
                  textDecoration: "line-through",
                }}
              >
                {formatPrice(product.min_compare_at_price as number)}
              </span>
              <span
                className="rounded-sm px-1 py-0.5"
                style={{
                  background: "#D62828",
                  color: "#FFFFFF",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                −{savePercent}%
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
