"use client";

import { useState } from "react";
import { ImageGallery } from "./image-gallery";
import { ProductInfo } from "./product-info";
import { ShareButtons } from "./share-buttons";
import { SizeFitSection } from "./size-fit-section";
import type { ProductDetail } from "@/types/product";
import type { CustomizationField } from "@/types/customization";

interface ProductMainProps {
  product: ProductDetail;
  productUrl: string;
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
}

/**
 * Owns the `selectedVariantId` so the gallery and the info column stay in
 * sync — picking a variant in the selector swaps the gallery to that
 * variant's tagged images.
 */
export function ProductMain({ product, productUrl, dict, customizationFields }: ProductMainProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants.length === 1 ? product.variants[0].id : null,
  );

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      {/* Left — Images */}
      <div data-animate="fade-up">
        <ImageGallery
          images={product.images}
          productName={product.name}
          selectedVariantId={selectedVariantId}
        />
      </div>

      {/* Right — Info + Share */}
      <div data-animate="fade-up">
        <ProductInfo
          product={product}
          dict={dict}
          customizationFields={customizationFields}
          onVariantChange={setSelectedVariantId}
        />
        {/* Size & fit — auto-hides when product has no chart / guide /
            fit notes (e.g. food, treats, toys). For collars / harnesses /
            beds it's the highest-value addition to the PDP, and it
            cuts the "will this fit my dog?" support emails. */}
        <div className="mt-6">
          <SizeFitSection
            sizeChart={product.size_chart}
            fitNotes={product.fit_notes}
            measureGuide={product.measure_guide}
          />
        </div>
        <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--bg-border)" }}>
          <ShareButtons url={productUrl} title={product.name} />
        </div>
      </div>
    </div>
  );
}
