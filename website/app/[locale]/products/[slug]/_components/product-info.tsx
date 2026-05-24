"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { ShoppingCart, Minus, Plus, Flame, TrendingUp } from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/lib/cart-context";
import { track } from "@/lib/analytics";
import { rememberProduct } from "@/lib/recently-viewed";
import { useProductSocialProof } from "@/lib/product-social-proof";
import { FreeDeliveryProgress } from "@/components/storefront/free-delivery-progress";
import { TrustBadgesCluster } from "@/components/storefront/trust-badges-cluster";
import { PaymentMethodsStrip } from "@/components/storefront/payment-methods-strip";
import { VariantSelector } from "./variant-selector";
import { CustomizationPanel } from "./customization-panel";
import type { ProductDetail } from "@/types/product";
import type {
  CustomizationAnswer,
  CustomizationField,
  CustomizationSummary,
} from "@/types/customization";

interface ProductInfoProps {
  product: ProductDetail;
  dict: {
    sku: string;
    addToCart: string;
    outOfStock: string;
    inStock: string;
    lowStock: string;
    onSale: string;
    quantity: string;
    selectVariant: string;
  };
  customizationFields: CustomizationField[];
  /** Lifted up so the ImageGallery on the PDP can react to the same state. */
  onVariantChange?: (variantId: string | null) => void;
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function ProductInfo({ product, dict, customizationFields, onVariantChange }: ProductInfoProps) {
  const variants = product.variants ?? [];
  const [selectedVariantId, setSelectedVariantIdState] = useState<string | null>(
    variants.length === 1 ? variants[0].id : null,
  );
  function setSelectedVariantId(id: string | null) {
    setSelectedVariantIdState(id);
    onVariantChange?.(id);
  }
  // Notify parent on first render too, so the gallery reflects the initial state.
  useEffect(() => {
    onVariantChange?.(selectedVariantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  const hasCustomizations = customizationFields.length > 0;
  const requiredCount = customizationFields.filter((f) => f.is_required).length;
  // Start as valid only when there are no required fields. If there are
  // required fields, the customer has to fill them before add-to-cart unlocks.
  const [customization, setCustomization] = useState<{
    isValid: boolean;
    answers: CustomizationAnswer[];
    summary: CustomizationSummary[];
    surcharge: number;
  }>({ isValid: requiredCount === 0, answers: [], summary: [], surcharge: 0 });

  // Fire a product_view event once per product per mount, and also
  // remember the product in localStorage so the "Recently viewed" rows
  // on the landing page (and elsewhere) can surface it to this visitor.
  useEffect(() => {
    track("product_view", {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
    });
    rememberProduct({
      slug: product.slug,
      name: product.name,
      image: product.primary_image,
      price: product.min_price,
    });
    // We intentionally do NOT depend on the product object identity to
    // avoid double-firing on re-renders; the slug change re-mounts the
    // page (Next.js route change) so this fires exactly once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const displayPrice = selectedVariant
    ? selectedVariant.price + customization.surcharge
    : null;
  // Sale economics — guard against the "compare_at is set but lower
  // than price" case so we never render a fake markdown.
  const onSale = !!(
    selectedVariant?.compare_at_price &&
    selectedVariant.compare_at_price > selectedVariant.price
  );
  const saveAmount = onSale
    ? (selectedVariant!.compare_at_price as number) - selectedVariant!.price
    : 0;
  const savePercent = onSale
    ? Math.round((saveAmount / (selectedVariant!.compare_at_price as number)) * 100)
    : 0;

  // Honest social proof — pulls live order counts and only renders the
  // line when the figure is meaningful (≥3) so a new shop doesn't say
  // "Bought 1 time".
  const socialProof = useProductSocialProof(product.slug);
  const showBoughtCount =
    socialProof !== undefined &&
    socialProof !== null &&
    socialProof.bought_last_30d >= 3;

  // Sticky mobile add-to-cart — pinned to the bottom of the viewport
  // once the regular Add to Cart scrolls off-screen. Watching a
  // sentinel ref via IntersectionObserver avoids attaching a scroll
  // listener (cheaper, and the API is exact about the threshold).
  const addToCartRef = useRef<HTMLDivElement | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  useEffect(() => {
    const el = addToCartRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => setStickyVisible(!e.isIntersecting));
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function handleAddToCart() {
    if (!selectedVariant) {
      toast.warning(dict.selectVariant);
      return;
    }
    if (hasCustomizations && !customization.isValid) {
      toast.warning("Please fill in the required customization fields");
      return;
    }
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      name: product.name,
      image: product.primary_image,
      price: selectedVariant.price,
      customizationSurcharge: customization.surcharge,
      sku: selectedVariant.sku,
      optionLabel: selectedVariant.option_values.map((ov) => ov.value).join(" / "),
      slug: product.slug,
      quantity,
      customizations: customization.answers,
      customizationSummary: customization.summary,
    });
    toast.success(`${product.name} added to cart`);
    setQuantity(1);
  }

  const stockStatus = selectedVariant
    ? selectedVariant.stock_quantity === 0
      ? "out"
      : selectedVariant.stock_quantity <= 5
        ? "low"
        : "in"
    : null;

  const addToCartDisabled =
    stockStatus === "out" || (hasCustomizations && !customization.isValid);

  return (
    <div className="flex flex-col gap-5">
      {/* Name */}
      <h1
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: "var(--weight-regular)",
          color: "var(--white)",
          lineHeight: "var(--leading-tight)",
        }}
      >
        {product.name}
      </h1>

      {/* Rating */}
      {Number(product.average_rating) > 0 && (
        <StarRating
          rating={Number(product.average_rating)}
          size={18}
          reviewCount={product.review_count}
        />
      )}

      {/* Big red SAVE ribbon — only renders when there's a real discount.
          Sits above the price block so it's the first thing a customer
          sees about the cost. */}
      {onSale && (
        <div
          className="inline-flex items-center gap-2 self-start rounded-md px-3 py-1.5"
          style={{
            background: "#B91C1C",
            color: "#FFFFFF",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            fontWeight: 800,
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          SAVE {formatPrice(saveAmount)} · −{savePercent}%
        </div>
      )}

      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-3">
        {selectedVariant && displayPrice !== null ? (
          <>
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "clamp(1.75rem, 5vw, 2.25rem)",
                fontWeight: "var(--weight-bold)",
                color: onSale ? "#FF6B6B" : "var(--white)",
                lineHeight: 1,
              }}
            >
              {formatPrice(displayPrice)}
            </span>
            {customization.surcharge > 0 && (
              <span
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  color: "var(--gold-dark)",
                }}
              >
                (incl. +{formatPrice(customization.surcharge)} personalization)
              </span>
            )}
            {onSale && (
              <span
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-lg)",
                  color: "var(--white-faint)",
                  textDecoration: "line-through",
                }}
              >
                {formatPrice(selectedVariant!.compare_at_price as number)}
              </span>
            )}
          </>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "clamp(1.75rem, 5vw, 2.25rem)",
              fontWeight: "var(--weight-bold)",
              color: "var(--white)",
            }}
          >
            {product.min_price !== null && product.max_price !== null
              ? product.min_price === product.max_price
                ? formatPrice(product.min_price)
                : `${formatPrice(product.min_price)} – ${formatPrice(product.max_price)}`
              : ""}
          </span>
        )}
      </div>

      {/* Honest social-proof line — hidden when count is too low to be
          persuasive. Real OrderItem aggregate from the backend. */}
      {showBoughtCount && (
        <p
          className="flex items-center gap-1.5"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--gold-dark)",
            fontWeight: 600,
          }}
        >
          <TrendingUp size={13} />
          Bought {socialProof!.bought_last_30d} times in the last 30 days
        </p>
      )}

      {/* Short description */}
      {product.short_description && (
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-base)",
            color: "var(--white-dim)",
            lineHeight: "var(--leading-relaxed)",
          }}
        >
          {product.short_description}
        </p>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "var(--bg-border)" }} />

      {/* Variant selector */}
      <VariantSelector
        variants={variants}
        optionTypes={product.option_types || []}
        selectedId={selectedVariantId}
        onSelect={setSelectedVariantId}
        selectLabel={dict.selectVariant}
      />

      {/* Customization panel — dynamically rendered from server-defined fields. */}
      {hasCustomizations && (
        <CustomizationPanel
          fields={customizationFields}
          onChange={setCustomization}
        />
      )}

      {/* Stock status — low/out-of-stock get a prominent red banner so
          they're unmissable above the add-to-cart button. The "in stock"
          state stays a quiet green line because shouting about it on
          every product would dilute the urgency of the low-stock case. */}
      {stockStatus === "low" && selectedVariant && (
        <div
          className="flex items-center gap-2 rounded-md p-3"
          style={{
            background: "rgba(214,40,40,0.10)",
            border: "1px solid rgba(214,40,40,0.35)",
          }}
        >
          <Flame size={16} style={{ color: "#FF6B6B" }} />
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "#FF6B6B",
              lineHeight: 1.3,
            }}
          >
            Only <strong>{selectedVariant.stock_quantity}</strong> left in stock — order today
          </p>
        </div>
      )}
      {stockStatus === "out" && (
        <div
          className="rounded-md p-3"
          style={{
            background: "rgba(214,40,40,0.10)",
            border: "1px solid rgba(214,40,40,0.35)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "#FF6B6B",
            }}
          >
            {dict.outOfStock}
          </p>
        </div>
      )}
      {stockStatus === "in" && (
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--success)",
          }}
        >
          {dict.inStock}
        </span>
      )}

      {/* SKU */}
      {selectedVariant && (
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white-faint)",
          }}
        >
          {dict.sku}: {selectedVariant.sku}
        </span>
      )}

      {/* Quantity + Add to Cart */}
      <div
        ref={addToCartRef}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        {/* Quantity */}
        <div
          className="flex items-center overflow-hidden rounded-md"
          style={{ border: "1px solid var(--bg-border)" }}
        >
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-11 w-11 items-center justify-center"
            style={{ background: "var(--bg-tertiary)", color: "var(--white-dim)" }}
          >
            <Minus size={16} />
          </button>
          <span
            className="flex h-11 w-14 items-center justify-center"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--white)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
            }}
          >
            {quantity}
          </span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="flex h-11 w-11 items-center justify-center"
            style={{ background: "var(--bg-tertiary)", color: "var(--white-dim)" }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Add to Cart */}
        <button
          onClick={handleAddToCart}
          disabled={addToCartDisabled}
          className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-md py-3 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontWeight: "var(--weight-semibold)",
            fontSize: "var(--text-sm)",
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
          }}
        >
          <ShoppingCart size={18} />
          {stockStatus === "out"
            ? dict.outOfStock
            : hasCustomizations && !customization.isValid
              ? "Fill in required fields"
              : dict.addToCart}
        </button>
      </div>

      {/* Conversion-page trust block — shown after the customer is ready
          to commit. unitPrice projects what adding this item would do to
          their progress toward free delivery, which is more persuasive
          than the current cart total alone. */}
      <FreeDeliveryProgress unitPrice={selectedVariant?.price} />
      <TrustBadgesCluster compact />
      <div className="pt-1">
        <PaymentMethodsStrip compact centered={false} />
      </div>

      {/* Sticky mobile add-to-cart — pinned to the bottom of the
          viewport on small screens once the inline button scrolls
          out of view. Massive conversion win on mobile where customers
          read description / reviews and forget the price is up top. */}
      {stickyVisible && selectedVariant && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 border-t px-3 py-2 sm:hidden"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--bg-border)",
            boxShadow: "0 -6px 18px rgba(0,0,0,0.35)",
          }}
        >
          <div className="flex flex-col">
            {onSale && (
              <span
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 10,
                  color: "var(--white-faint)",
                  textDecoration: "line-through",
                  lineHeight: 1.1,
                }}
              >
                {formatPrice(selectedVariant!.compare_at_price as number)}
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-base)",
                fontWeight: 700,
                color: onSale ? "#FF6B6B" : "var(--white)",
                lineHeight: 1.1,
              }}
            >
              {displayPrice !== null ? formatPrice(displayPrice) : ""}
            </span>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={addToCartDisabled}
            className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-md py-3 transition-all duration-300 disabled:opacity-40"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontWeight: "var(--weight-semibold)",
              fontSize: "var(--text-sm)",
              letterSpacing: "var(--tracking-wider)",
              textTransform: "uppercase",
            }}
          >
            <ShoppingCart size={16} />
            {stockStatus === "out" ? dict.outOfStock : dict.addToCart}
          </button>
        </div>
      )}
    </div>
  );
}
