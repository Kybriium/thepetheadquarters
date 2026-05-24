"use client";

/**
 * Searchable supplier combobox.
 *
 * A native <select> is fine for the 5-supplier case but falls over
 * the moment a real dropship operation has 50+ suppliers. This
 * component renders a search-style input that queries
 * `/admin/suppliers/?search=...&is_active=true&page_size=10` and
 * shows the matches in a dropdown panel. Selection happens on click;
 * the input then displays the picked supplier's name with a small
 * "×" to clear.
 *
 * Caller passes in `excludeIds` for suppliers that are already linked
 * to the current variant — those rows are still rendered so the admin
 * can see why the duplicate isn't pickable, but greyed out and not
 * clickable.
 *
 * The component is decoupled from the parent form via callback —
 * no shared state, so it can be reused on the order forward modal,
 * the inventory adjust dialogs, etc.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { PaginatedResponse } from "@/types/api";

export interface SupplierPickerOption {
  id: string;
  name: string;
  is_dropshipper: boolean;
  country: string;
}

interface SupplierPickerProps {
  value: SupplierPickerOption | null;
  onChange: (s: SupplierPickerOption | null) => void;
  /** Supplier IDs already linked elsewhere — rendered but disabled. */
  excludeIds?: string[];
  placeholder?: string;
}

const PAGE_SIZE = 10;

export function SupplierPicker({
  value,
  onChange,
  excludeIds = [],
  placeholder = "Search suppliers by name…",
}: SupplierPickerProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce the query so we don't slam the API every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(id);
  }, [query]);

  // Close on outside click — restricted to mousedown so clicks inside
  // the dropdown can fire the option `onClick` before the close runs.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Pull a small page of matches. When the input is empty we still
  // fetch (no search param) so the dropdown shows the first batch of
  // recently-edited suppliers as a default.
  const { data: matches, isFetching } = useQuery({
    queryKey: ["admin", "suppliers", "picker", debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        is_active: "true",
        page_size: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("search", debouncedQuery);
      const res = await apiClient.get<PaginatedResponse<SupplierPickerOption>>(
        `${endpoints.admin.suppliers.list}?${params.toString()}`,
      );
      return res;
    },
    enabled: open,
    staleTime: 20 * 1000,
  });

  const results = matches?.results ?? [];
  const totalCount = matches?.count ?? 0;
  const hasMore = totalCount > results.length;

  function handleSelect(option: SupplierPickerOption) {
    if (excludeIds.includes(option.id)) return;
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setOpen(true);
    // Focus on the next tick so the input is ready to receive typing.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger — looks like a search field whether or not a value is selected */}
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2"
        style={{
          background: "var(--bg-tertiary)",
          border: `1px solid ${open ? "rgba(187,148,41,0.45)" : "var(--bg-border)"}`,
          cursor: "text",
        }}
      >
        <Search size={13} style={{ color: "var(--white-faint)" }} />
        {value ? (
          <span
            className="flex flex-1 items-center justify-between gap-2"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 13,
              color: "var(--white)",
            }}
          >
            <span>
              {value.name}
              {value.is_dropshipper && (
                <span
                  className="ml-2 rounded-full px-1.5 py-0.5"
                  style={{
                    background: "rgba(187,148,41,0.12)",
                    color: "var(--gold-dark)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "var(--tracking-wide)",
                    textTransform: "uppercase",
                  }}
                >
                  Dropship
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              aria-label="Clear supplier"
              style={{ color: "var(--white-faint)" }}
            >
              <X size={13} />
            </button>
          </span>
        ) : (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 13,
              color: "var(--white)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        <ChevronDown
          size={13}
          style={{
            color: "var(--white-faint)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--bg-border)",
            boxShadow: "0 12px 24px rgba(0,0,0,0.25)",
          }}
        >
          {isFetching && results.length === 0 && (
            <div
              className="px-3 py-3 text-center"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
              }}
            >
              Searching…
            </div>
          )}

          {!isFetching && results.length === 0 && (
            <div
              className="px-3 py-4"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 12,
                color: "var(--white-dim)",
                lineHeight: 1.5,
              }}
            >
              <p>
                No supplier matches{debouncedQuery ? ` "${debouncedQuery}"` : ""}.
              </p>
              <a
                href="/admin/suppliers"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block"
                style={{
                  color: "var(--gold-dark)",
                  fontSize: 11,
                  textDecoration: "underline",
                }}
              >
                Create a new supplier →
              </a>
            </div>
          )}

          {results.map((s) => {
            const excluded = excludeIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                disabled={excluded}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[rgba(187,148,41,0.06)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="flex flex-col">
                  <span
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--white)",
                    }}
                  >
                    {s.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: 10,
                      color: "var(--white-faint)",
                    }}
                  >
                    {s.country || "—"}
                    {excluded && " · already linked"}
                  </span>
                </span>
                {s.is_dropshipper && (
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      background: "rgba(187,148,41,0.12)",
                      color: "var(--gold-dark)",
                      fontFamily: "var(--font-montserrat)",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "var(--tracking-wide)",
                      textTransform: "uppercase",
                    }}
                  >
                    Dropship
                  </span>
                )}
              </button>
            );
          })}

          {hasMore && (
            <div
              className="border-t px-3 py-2 text-center"
              style={{
                borderColor: "var(--bg-border)",
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--white-faint)",
              }}
            >
              Showing {results.length} of {totalCount} — refine your search
              to narrow further.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
