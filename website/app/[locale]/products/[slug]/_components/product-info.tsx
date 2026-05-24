"use client";

import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { ShoppingCart, Minus, Plus } from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import { useCart } from "@/lib/cart-context";
import { track } from "@/lib/analytics";
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

  // Fire a product_view event once per product per mount.
  useEffect(() => {
    track("product_view", {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
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

      {/* Price */}
      <div className="flex items-baseline gap-3">
        {selectedVariant && displayPrice !== null ? (
          <>
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-2xl)",
                fontWeight: "var(--weight-bold)",
                color: "var(--white)",
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
            {selectedVariant.compare_at_price && selectedVariant.compare_at_price > selectedVariant.price && (
              <>
                <span
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-lg)",
                    color: "var(--white-faint)",
                    textDecoration: "line-through",
                  }}
                >
                  {formatPrice(selectedVariant.compare_at_price)}
                </span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    background: "rgba(187,148,41,0.15)",
                    color: "var(--gold)",
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                  }}
                >
                  {dict.onSale}
                </span>
              </>
            )}
          </>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-2xl)",
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

      {/* Stock status */}
      {stockStatus && (
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color:
              stockStatus === "out"
                ? "var(--error)"
                : stockStatus === "low"
                  ? "var(--warning)"
                  : "var(--success)",
          }}
        >
          {stockStatus === "out"
            ? dict.outOfStock
            : stockStatus === "low"
              ? dict.lowStock.replace("{count}", String(selectedVariant!.stock_quantity))
              : dict.inStock}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
    </div>
  );
}
