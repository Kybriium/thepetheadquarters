"use client";

/**
 * Expandable "Size & fit" block on the PDP.
 *
 * Three optional pieces of content:
 *   - measure_guide  (per-category, text + diagram)
 *   - size_chart     (per-product, columns + rows)
 *   - fit_notes      (per-product, short note under the chart)
 *
 * Hides itself entirely if none are populated. Otherwise renders as a
 * collapsed accordion with a "How does this fit?" toggle — opens to
 * show, in order:
 *   1. Section title + small icon
 *   2. Diagram on the right (when present), measuring tips on the left
 *   3. The size chart as a clean striped table
 *   4. Fit-notes callout
 *
 * Designed to be expandable later — we can add per-variant numeric
 * measurements + a "size finder" form without rewriting the section,
 * because the data sources are independent.
 */

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, Ruler } from "lucide-react";
import type { ProductMeasureGuide, ProductSizeChart } from "@/types/product";

interface SizeFitSectionProps {
  sizeChart?: ProductSizeChart;
  fitNotes?: string;
  measureGuide?: ProductMeasureGuide | null;
}

function hasChart(c: ProductSizeChart | undefined): boolean {
  return !!(c && Array.isArray(c.columns) && c.columns.length > 0
    && Array.isArray(c.rows) && c.rows.length > 0);
}

export function SizeFitSection({ sizeChart, fitNotes, measureGuide }: SizeFitSectionProps) {
  const showChart = hasChart(sizeChart);
  const showGuide = !!measureGuide && (!!measureGuide.text || !!measureGuide.image_url);
  const showNotes = !!fitNotes;

  // Bail early when there's nothing to render — keeps the PDP clean
  // on products where sizing isn't a thing (food, toys, etc.).
  if (!showChart && !showGuide && !showNotes) return null;

  // Default-open when the product actually has a chart, because that's
  // the highest-value content for the customer. Pure guide-only blocks
  // start collapsed.
  const [open, setOpen] = useState<boolean>(showChart);

  return (
    <div
      className="rounded-lg"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--bg-border)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-[rgba(187,148,41,0.05)]"
      >
        <span className="flex items-center gap-2">
          <Ruler size={15} style={{ color: "var(--gold)" }} />
          <span
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--white)",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            Size &amp; fit
          </span>
        </span>
        <ChevronDown
          size={14}
          className="transition-transform duration-200"
          style={{
            color: "var(--white-faint)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-5 px-4 pb-5">
          {showGuide && <MeasureGuide guide={measureGuide!} />}
          {showChart && <SizeChart chart={sizeChart!} />}
          {showNotes && <FitNotes notes={fitNotes!} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-blocks
// ---------------------------------------------------------------------------

function MeasureGuide({ guide }: { guide: ProductMeasureGuide }) {
  const lines = guide.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {guide.image_url && (
        <div
          className="relative h-32 w-full shrink-0 overflow-hidden rounded-md sm:h-36 sm:w-44"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Image
            src={guide.image_url}
            alt="How to measure your pet"
            fill
            sizes="(max-width: 640px) 100vw, 176px"
            className="object-cover"
          />
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex flex-1 flex-col gap-1.5">
          <p
            className="mb-1"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--gold-dark)",
              letterSpacing: "var(--tracking-wider)",
              textTransform: "uppercase",
            }}
          >
            How to measure
          </p>
          {lines.map((line, i) => (
            <p
              key={i}
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-dim)",
                lineHeight: 1.55,
              }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function SizeChart({ chart }: { chart: ProductSizeChart }) {
  const columns = chart.columns ?? [];
  const rows = chart.rows ?? [];

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-left"
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          background: "var(--bg-tertiary)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          border: "1px solid var(--bg-border)",
        }}
      >
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                className="px-3 py-2"
                style={{
                  background: "rgba(187,148,41,0.08)",
                  borderBottom: "1px solid var(--bg-border)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--gold-dark)",
                  letterSpacing: "var(--tracking-wide)",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr
              key={rIdx}
              style={{
                background: rIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}
            >
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="px-3 py-2"
                  style={{
                    borderBottom:
                      rIdx === rows.length - 1 ? "none" : "1px solid var(--bg-border)",
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-xs)",
                    color: cIdx === 0 ? "var(--white)" : "var(--white-dim)",
                    fontWeight: cIdx === 0 ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FitNotes({ notes }: { notes: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md p-3"
      style={{
        background: "rgba(187,148,41,0.06)",
        border: "1px solid rgba(187,148,41,0.18)",
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "rgba(187,148,41,0.2)",
          color: "var(--gold)",
          fontFamily: "var(--font-montserrat)",
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        i
      </span>
      <p
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-xs)",
          color: "var(--white-dim)",
          lineHeight: 1.5,
        }}
      >
        {notes}
      </p>
    </div>
  );
}
