"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import type { ProductImage } from "@/types/product";

interface ImageGalleryProps {
  images: ProductImage[];
  productName: string;
  /**
   * When a variant is selected, images tagged to that variant are surfaced
   * first and the thumbnail strip shows them at the front. Variant-agnostic
   * images (no `variant`) always remain visible so the gallery never goes
   * empty — even if a brand-new variant has no photos of its own.
   */
  selectedVariantId?: string | null;
}

export function ImageGallery({ images, productName, selectedVariantId }: ImageGalleryProps) {
  /**
   * Ordering rule:
   *  1. Images tagged to the active variant come first (in their sort_order).
   *  2. Variant-agnostic images (`variant === null`) fill in next.
   *  3. Images tagged to OTHER variants are hidden — they belong to a
   *     different swatch and would confuse the customer.
   *
   * Falls back to the previous behavior (primary-first, then sort_order)
   * when no variant is selected, so list pages or no-variant products are
   * unchanged.
   */
  const sorted = useMemo(() => {
    const byPrimary = (a: ProductImage, b: ProductImage) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.sort_order - b.sort_order;
    };

    if (!selectedVariantId) {
      return [...images].sort(byPrimary);
    }

    const forVariant = images.filter((i) => i.variant === selectedVariantId);
    const agnostic = images.filter((i) => !i.variant);
    return [...forVariant.sort(byPrimary), ...agnostic.sort(byPrimary)];
  }, [images, selectedVariantId]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // Whenever the variant changes, snap to the first image (a variant-tagged
  // one if present, otherwise the first agnostic shot) so the customer
  // immediately sees their selection.
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedVariantId]);

  const activeImage = sorted[activeIndex];

  const goNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % sorted.length);
  }, [sorted.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + sorted.length) % sorted.length);
  }, [sorted.length]);

  // Keyboard navigation in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, goNext, goPrev]);

  if (sorted.length === 0) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-lg"
        style={{ background: "var(--bg-secondary)", color: "var(--white-faint)" }}
      >
        No Image
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Main image */}
        <button
          onClick={() => setFullscreen(true)}
          className="group relative aspect-square w-full overflow-hidden rounded-lg"
          style={{ background: "var(--bg-secondary)" }}
        >
          <Image
            src={activeImage.url}
            alt={activeImage.alt_text || productName}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority
          />
          {/* Zoom hint */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: "rgba(0,0,0,0.3)" }}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "#FFFFFF" }}
            >
              <ZoomIn size={20} />
            </div>
          </div>
        </button>

        {/* Thumbnails */}
        {sorted.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {sorted.map((img, i) => (
              <button
                key={img.id}
                onClick={() => setActiveIndex(i)}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md transition-opacity duration-200 hover:opacity-100 sm:h-20 sm:w-20"
                style={{
                  background: "var(--bg-secondary)",
                  border: i === activeIndex ? "2px solid var(--gold)" : "1px solid var(--bg-border)",
                  opacity: i === activeIndex ? 1 : 0.6,
                }}
              >
                <Image
                  src={img.url}
                  alt={img.alt_text || `${productName} ${i + 1}`}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen viewer */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.95)" }}
        >
          {/* Close */}
          <button
            onClick={() => setFullscreen(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 hover:bg-[rgba(255,255,255,0.2)]"
            style={{ color: "#FFFFFF" }}
          >
            <X size={24} />
          </button>

          {/* Counter */}
          <div
            className="absolute left-4 top-4 z-10 rounded-full px-3 py-1"
            style={{
              background: "rgba(0,0,0,0.6)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {activeIndex + 1} / {sorted.length}
          </div>

          {/* Previous */}
          {sorted.length > 1 && (
            <button
              onClick={goPrev}
              className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 hover:bg-[rgba(255,255,255,0.2)]"
              style={{ color: "#FFFFFF" }}
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {/* Image */}
          <div className="relative h-[85vh] w-[90vw] sm:h-[90vh] sm:w-[85vw]">
            <Image
              src={sorted[activeIndex].url}
              alt={sorted[activeIndex].alt_text || productName}
              fill
              sizes="90vw"
              className="object-contain"
              priority
            />
          </div>

          {/* Next */}
          {sorted.length > 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 hover:bg-[rgba(255,255,255,0.2)]"
              style={{ color: "#FFFFFF" }}
            >
              <ChevronRight size={28} />
            </button>
          )}

          {/* Thumbnails strip */}
          {sorted.length > 1 && (
            <div className="absolute bottom-4 z-10 flex gap-2">
              {sorted.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveIndex(i)}
                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded transition-opacity duration-200 hover:opacity-100 sm:h-16 sm:w-16"
                  style={{
                    border: i === activeIndex ? "2px solid var(--gold)" : "1px solid rgba(255,255,255,0.2)",
                    opacity: i === activeIndex ? 1 : 0.5,
                  }}
                >
                  <Image
                    src={img.url}
                    alt={img.alt_text || `${productName} ${i + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Click backdrop to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setFullscreen(false)} />
        </div>
      )}
    </>
  );
}
