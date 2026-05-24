"use client";

/**
 * Click-to-open nav dropdown — marketplace shape.
 *
 * Two pieces:
 *   1. <NavMenuTab>    — the clickable nav label that toggles a menu
 *   2. <NavMenuPanel>  — the actual dropdown content, rendered ONCE in
 *                        the header below the row of tabs and spanning
 *                        the full viewport width. Mounted unconditionally
 *                        so the React Query cache survives between
 *                        opens; visibility is gated by `activeKey`.
 *
 * The parent (Header) owns `activeKey` so only one panel can ever be
 * open. Click outside / ESC closes; clicking a different tab swaps
 * the content in place without a visible flicker.
 *
 * No hover behaviour anywhere — it was causing two panels to appear at
 * once on quick mouse moves and felt fly-out-y, not marketplace-y.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { Category } from "@/types/category";
import type { Brand } from "@/types/brand";
import type { PaginatedResponse } from "@/types/api";

export type NavMenuKey = "categories" | "brands";

// ---------------------------------------------------------------------------
// Tab — what sits in the nav row
// ---------------------------------------------------------------------------

interface NavMenuTabProps {
  href: string;
  label: string;
  menuKey: NavMenuKey;
  isActive: boolean;
  /** True when this tab's panel is currently open. */
  isOpen: boolean;
  /** Called when the tab is clicked — toggle handled by parent. */
  onToggle: () => void;
}

export function NavMenuTab({ href, label, isActive, isOpen, onToggle }: NavMenuTabProps) {
  // Two ways to use the tab:
  //   - Single click on the label → toggle the menu
  //   - Double click / cmd+click / hitting "View all" inside the panel
  //     → navigate to the index page (handled by the Link below)
  //
  // We intentionally don't navigate on a single click. Marketplaces
  // (Amazon, eBay, Temu) all treat the top-row tabs as menu triggers
  // first, navigation second — the menu itself has a "View all" link.

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      className="relative flex items-center gap-1 px-4 py-2 transition-colors duration-200 hover:text-[var(--gold)]"
      style={{
        fontFamily: "var(--font-montserrat)",
        fontSize: "var(--text-sm)",
        fontWeight: "var(--weight-medium)",
        color: isOpen ? "var(--gold)" : isActive ? "var(--gold)" : "var(--white-dim)",
        letterSpacing: "var(--tracking-wide)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      {label}
      <ChevronDown
        size={12}
        className="transition-transform duration-200"
        style={{
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          color: "currentColor",
          opacity: 0.7,
        }}
      />
      {(isActive || isOpen) && (
        <span
          className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
          style={{ background: "var(--gold)" }}
        />
      )}
      {/* Keep the link target accessible to assistive tech / right-click
          "Open in new tab", without firing it on left-click. */}
      <Link
        href={href}
        aria-hidden="true"
        tabIndex={-1}
        onClick={(e) => e.preventDefault()}
        style={{ display: "none" }}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel — the dropdown strip rendered once below the header row
// ---------------------------------------------------------------------------

interface NavMenuPanelProps {
  activeKey: NavMenuKey | null;
  onClose: () => void;
}

export function NavMenuPanel({ activeKey, onClose }: NavMenuPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ESC anywhere closes the panel.
  useEffect(() => {
    if (!activeKey) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeKey, onClose]);

  // Click anywhere outside the panel closes it. The tab buttons live in
  // the same header so we use `data-nav-menu="tab"` markers on them to
  // distinguish a tab click (handled separately) from a true outside
  // click — without this, clicking the tab to close would close-then-
  // re-open immediately.
  useEffect(() => {
    if (!activeKey) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      if (target.closest('[data-nav-menu="tab"]')) return;
      onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [activeKey, onClose]);

  const open = activeKey !== null;

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Navigation menu"
      // Pinned below the header row; spans full viewport width like
      // Amazon's "All" dropdown so the panel never drifts sideways
      // relative to the tab that opened it.
      className="absolute left-0 right-0 top-full z-40"
      style={{
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-8px)",
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 180ms ease, transform 180ms ease",
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          borderTop: "1px solid var(--bg-border)",
          borderBottom: "1px solid var(--bg-border)",
          boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {activeKey === "categories" && <CategoriesPanel onPick={onClose} />}
          {activeKey === "brands" && <BrandsPanel onPick={onClose} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function CategoriesPanel({ onPick }: { onPick: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["nav", "categories"],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Category> | { data: Category[] }>(
        endpoints.categories.list,
      );
      const items =
        (res as PaginatedResponse<Category>).results
        ?? (res as { data: Category[] }).data
        ?? [];
      // Top-level only — the full nested tree is one click away on the
      // /categories index, which "View all" links to.
      return items.filter((c) => !c.parent);
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <PanelSkeleton />;
  const cats = data ?? [];
  if (cats.length === 0) {
    return (
      <Link href="/categories" onClick={onPick} style={panelLinkStyle}>
        Browse categories →
      </Link>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-lg)",
            fontWeight: "var(--weight-medium)",
            color: "var(--white)",
          }}
        >
          Shop by pet
        </h3>
        <Link
          href="/categories"
          onClick={onPick}
          className="hover:text-[var(--gold)]"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--gold-dark)",
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {cats.slice(0, 12).map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            onClick={onPick}
            className="group flex items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-[rgba(187,148,41,0.08)]"
          >
            <div
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {c.image && (
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              )}
            </div>
            <span
              className="line-clamp-2 group-hover:text-[var(--gold)]"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--white)",
                lineHeight: 1.3,
              }}
            >
              {c.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function BrandsPanel({ onPick }: { onPick: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["nav", "brands"],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Brand> | { data: Brand[] }>(
        endpoints.brands.list,
      );
      const items =
        (res as PaginatedResponse<Brand>).results
        ?? (res as { data: Brand[] }).data
        ?? [];
      return items;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <PanelSkeleton />;
  const brands = data ?? [];
  if (brands.length === 0) {
    return (
      <Link href="/brands" onClick={onPick} style={panelLinkStyle}>
        Browse brands →
      </Link>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-lg)",
            fontWeight: "var(--weight-medium)",
            color: "var(--white)",
          }}
        >
          Browse by brand
        </h3>
        <Link
          href="/brands"
          onClick={onPick}
          className="hover:text-[var(--gold)]"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--gold-dark)",
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {brands.slice(0, 12).map((b) => (
          <Link
            key={b.id}
            href={`/brands/${b.slug}`}
            onClick={onPick}
            className="group flex aspect-[5/3] flex-col items-center justify-center gap-1 rounded-md p-2 transition-all hover:-translate-y-0.5"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--bg-border)",
            }}
          >
            {b.logo ? (
              <Image
                src={b.logo}
                alt={b.name}
                width={80}
                height={32}
                className="h-7 w-auto object-contain"
              />
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: 18,
                  fontWeight: 500,
                  color: "#0F0F12",
                }}
              >
                {b.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span
              className="text-center"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 9,
                fontWeight: 600,
                color: "#3A3A40",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              {b.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-md"
          style={{ background: "var(--bg-tertiary)" }}
        />
      ))}
    </div>
  );
}

const panelLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-montserrat)",
  fontSize: 12,
  color: "var(--gold-dark)",
  letterSpacing: "var(--tracking-wide)",
};
