"use client";

/**
 * Full-screen focused search overlay.
 *
 * Triggered from the header search icon. Dark backdrop fades in over
 * the page, search input gets autofocus, results appear live below as
 * the customer types (debounced 250ms so we don't spam the API on
 * every keystroke). Up to 10 products shown inline; "See all results"
 * button takes the customer to the full catalogue with the query
 * carried over.
 *
 * Behavior:
 *   - ESC, click on backdrop, or click X all close the overlay
 *   - Enter on the input commits to /products?search=...
 *   - Body scroll locked while open
 *   - Empty-query state shows a few popular searches as one-click chips
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Search, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { Product } from "@/types/product";
import type { PaginatedResponse } from "@/types/api";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

const POPULAR_QUERIES = [
  "Dog food",
  "Cat toys",
  "Treats",
  "Bed",
  "Collar",
  "Harness",
];

const MAX_RESULTS = 10;

function formatPrice(p: number | null): string {
  if (p == null) return "";
  return `£${(p / 100).toFixed(2)}`;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state and focus the input when the overlay opens. Clearing
  // results too means re-opening the search starts fresh — feels less
  // stale than recalling the previous query's hits.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setTotalCount(0);
    // Focus on the next tick so the autoFocus prop doesn't fight with
    // our explicit call (which we need because the input re-mounts).
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  // Lock body scroll while the overlay is up — otherwise the page
  // behind it scrolls under the backdrop on touch devices.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC closes — captured here rather than on the input so the
  // shortcut works even after the user clicks a result link (since
  // closing fires after navigation anyway).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounce the input — wait 250ms of inactivity before firing a
  // request so the API isn't hit on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  // Fire the search when the debounced query changes. Cancellation
  // via a stale-marker flag — concurrent requests when the user types
  // fast otherwise resolve out-of-order and clobber the latest results.
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<PaginatedResponse<Product>>(
        `${endpoints.products.list}?search=${encodeURIComponent(debouncedQuery)}&page_size=${MAX_RESULTS}`,
      )
      .then((res) => {
        if (cancelled) return;
        setResults(res.results || []);
        setTotalCount(res.count || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setTotalCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/products?search=${encodeURIComponent(trimmed)}`);
    onClose();
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(query);
  }

  // hasMore: tell the customer there are extra hits hiding behind the
  // "See all results" CTA so they don't think they're seeing the full
  // catalogue match.
  const hasMore = totalCount > results.length;

  return (
    <div
      aria-hidden={!open}
      className="fixed inset-0 z-[60] flex items-start justify-center"
      style={{
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(6px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 200ms ease",
      }}
      onClick={onClose}
    >
      <div
        className="mt-4 w-full max-w-2xl rounded-xl shadow-2xl sm:mt-16 mx-4"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          transform: open ? "translateY(0)" : "translateY(-12px)",
          transition: "transform 220ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <form
          onSubmit={handleFormSubmit}
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: "var(--bg-border)" }}
        >
          <Search size={18} style={{ color: "var(--gold)" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for food, toys, collars, brands…"
            className="flex-1 bg-transparent outline-none"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-base)",
              color: "var(--white)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear"
              className="rounded-full p-1 transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: "var(--white-faint)" }}
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-full p-1 transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: "var(--white-faint)" }}
          >
            <X size={16} />
          </button>
        </form>

        {/* Body — three states: empty / loading / results */}
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {!debouncedQuery ? (
            <EmptyState
              onPick={(q) => {
                setQuery(q);
              }}
            />
          ) : loading ? (
            <div className="flex justify-center py-10">
              <div
                className="h-5 w-5 animate-spin rounded-full"
                style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }}
              />
            </div>
          ) : results.length === 0 ? (
            <NoResults query={debouncedQuery} />
          ) : (
            <>
              <div className="flex flex-col">
                {results.map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-[rgba(187,148,41,0.06)]"
                  >
                    <div
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md"
                      style={{ background: "var(--bg-tertiary)" }}
                    >
                      {p.primary_image && (
                        <Image
                          src={p.primary_image}
                          alt={p.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="line-clamp-1"
                        style={{
                          fontFamily: "var(--font-montserrat)",
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--white)",
                        }}
                      >
                        {p.name}
                      </p>
                      {p.short_description && (
                        <p
                          className="line-clamp-1"
                          style={{
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 11,
                            color: "var(--white-faint)",
                          }}
                        >
                          {p.short_description}
                        </p>
                      )}
                    </div>
                    {p.min_price !== null && (
                      <span
                        style={{
                          fontFamily: "var(--font-montserrat)",
                          fontSize: "var(--text-sm)",
                          fontWeight: 700,
                          color: "var(--gold-dark)",
                        }}
                      >
                        {formatPrice(p.min_price)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              <button
                onClick={() => submit(debouncedQuery)}
                className="mx-2 my-2 flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-md py-2.5"
                style={{
                  background: "rgba(187,148,41,0.10)",
                  border: "1px solid rgba(187,148,41,0.35)",
                  color: "var(--gold)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  letterSpacing: "var(--tracking-wider)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {hasMore
                  ? `See all ${totalCount} results for "${debouncedQuery}"`
                  : `See "${debouncedQuery}" in the catalogue`}
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="px-3 py-4">
      <p
        className="mb-3"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: 11,
          color: "var(--white-faint)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
        }}
      >
        Popular searches
      </p>
      <div className="flex flex-wrap gap-2">
        {POPULAR_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="rounded-full px-3 py-1.5"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--bg-border)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 12,
              color: "var(--white-dim)",
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-4 py-10 text-center"
      style={{
        fontFamily: "var(--font-montserrat)",
        fontSize: "var(--text-sm)",
        color: "var(--white-dim)",
      }}
    >
      <p>No products match <strong style={{ color: "var(--white)" }}>"{query}"</strong>.</p>
      <p style={{ fontSize: 11, color: "var(--white-faint)" }}>
        Try a shorter term, or browse the full catalogue.
      </p>
    </div>
  );
}
