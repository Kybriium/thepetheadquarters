"use client";

/**
 * Size & Fit editor — new tab on the product edit page.
 *
 * Two persistent pieces of product data live here:
 *   1. `size_chart` — a structured table the admin builds visually
 *      (columns + rows of strings), serialised as JSON in the DB.
 *   2. `fit_notes` — a short callout shown below the table on the PDP
 *      (e.g. "Runs small — size up for thick-furred dogs").
 *
 * The "How to measure" guide is NOT edited here — it's category-level
 * because every collar / harness / coat in the same category shares
 * the same measuring approach. We surface a read-only preview so the
 * admin can see what the customer will see, plus a deep link to the
 * Django admin Category form to edit it (one place, many products
 * inherit).
 *
 * Validation client-side mirrors the backend serializer: every row
 * must have exactly `columns.length` cells. We pad / trim
 * automatically when adding or removing columns so the data is always
 * in valid shape before the user even clicks Save.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@heroui/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import {
  adminProductKeys,
  type AdminProductDetail,
} from "@/hooks/use-admin-products";

interface SizeChart {
  columns: string[];
  rows: string[][];
}

interface MeasureGuide {
  category_id: string;
  category_slug: string;
  text: string;
  image_url: string;
}

interface ProductWithSizeFit extends AdminProductDetail {
  size_chart?: SizeChart | Record<string, never>;
  fit_notes?: string;
  measure_guide?: MeasureGuide | null;
}

interface SizeFitManagerProps {
  productId: string;
  product: ProductWithSizeFit;
}

const DEFAULT_CHART: SizeChart = {
  columns: ["Size", "Neck (cm)", "Chest (cm)", "Weight (kg)"],
  rows: [
    ["S", "", "", ""],
    ["M", "", "", ""],
    ["L", "", "", ""],
  ],
};

function normalize(value: unknown): SizeChart {
  // Backend can send `{}` (empty dict) when nothing is set. Coerce to
  // a shape the editor can render without special-casing every row.
  if (value && typeof value === "object" && Array.isArray((value as SizeChart).columns)) {
    const v = value as SizeChart;
    return { columns: v.columns, rows: v.rows ?? [] };
  }
  return { columns: [], rows: [] };
}

export function SizeFitManager({ productId, product }: SizeFitManagerProps) {
  const qc = useQueryClient();
  const initial = normalize(product.size_chart);
  const [chart, setChart] = useState<SizeChart>(initial);
  const [fitNotes, setFitNotes] = useState<string>(product.fit_notes ?? "");
  const guide = product.measure_guide ?? null;

  // Re-sync if the product is refetched (e.g. saved elsewhere).
  useEffect(() => {
    setChart(normalize(product.size_chart));
    setFitNotes(product.fit_notes ?? "");
  }, [product.size_chart, product.fit_notes]);

  const dirty =
    JSON.stringify(chart) !== JSON.stringify(initial) || fitNotes !== (product.fit_notes ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Send empty chart as {} so the backend treats it as "no chart"
      // and the PDP hides the Size & Fit block cleanly.
      const payload: Record<string, unknown> = {
        size_chart: chart.columns.length === 0 || chart.rows.length === 0 ? {} : chart,
        fit_notes: fitNotes.trim(),
      };
      return apiClient.patch(endpoints.admin.products.detail(productId), payload);
    },
    onSuccess: () => {
      toast.success("Size & fit saved");
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Save failed";
      toast.danger(msg);
    },
  });

  // -----------------------------------------------------------------
  // Mutation helpers — keep the matrix shape consistent at all times
  // -----------------------------------------------------------------

  function setColumnHeader(index: number, value: string) {
    setChart((c) => {
      const next = { ...c, columns: [...c.columns] };
      next.columns[index] = value;
      return next;
    });
  }

  function addColumn() {
    setChart((c) => ({
      columns: [...c.columns, "New column"],
      // Pad every existing row with an empty string so widths stay equal.
      rows: c.rows.map((r) => [...r, ""]),
    }));
  }

  function removeColumn(index: number) {
    setChart((c) => ({
      columns: c.columns.filter((_, i) => i !== index),
      rows: c.rows.map((r) => r.filter((_, i) => i !== index)),
    }));
  }

  function setCell(rowIdx: number, colIdx: number, value: string) {
    setChart((c) => {
      const rows = c.rows.map((r, i) => (i === rowIdx ? [...r] : r));
      rows[rowIdx][colIdx] = value;
      return { ...c, rows };
    });
  }

  function addRow() {
    setChart((c) => ({
      ...c,
      rows: [...c.rows, c.columns.map(() => "")],
    }));
  }

  function removeRow(index: number) {
    setChart((c) => ({ ...c, rows: c.rows.filter((_, i) => i !== index) }));
  }

  function startFromTemplate() {
    setChart(DEFAULT_CHART);
  }

  function clearChart() {
    if (!confirm("Clear the whole table?")) return;
    setChart({ columns: [], rows: [] });
  }

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  const empty = chart.columns.length === 0 && chart.rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Intro + measure-guide preview */}
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
      >
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
          How to measure (from category)
        </p>
        {guide ? (
          <>
            <p
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-dim)",
                whiteSpace: "pre-line",
                lineHeight: 1.5,
              }}
            >
              {guide.text || <em style={{ color: "var(--white-faint)" }}>No guide text set</em>}
            </p>
            <a
              href={`/admin/categories/${guide.category_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--gold-dark)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              Edit the "{guide.category_slug}" measure guide →
            </a>
          </>
        ) : (
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-faint)",
              lineHeight: 1.5,
            }}
          >
            No measuring guide set on this product's category. Add one in
            Django admin under Categories → choose the category → "Measure
            guide text" + "Measure guide image url". One guide can power
            every product in that category.
          </p>
        )}
      </div>

      {/* Size chart editor */}
      <div
        className="rounded-lg"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          padding: "var(--space-5)",
        }}
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-medium)",
              color: "var(--white)",
            }}
          >
            Size chart
          </h3>
          <div className="flex gap-2">
            {empty && (
              <button
                onClick={startFromTemplate}
                className="rounded-md px-3 py-1.5"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--bg-border)",
                  color: "var(--white-dim)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                Use harness/collar template
              </button>
            )}
            {!empty && (
              <button
                onClick={clearChart}
                className="rounded-md px-3 py-1.5"
                style={{
                  background: "transparent",
                  border: "1px solid var(--bg-border)",
                  color: "var(--error)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                Clear table
              </button>
            )}
          </div>
        </div>

        {empty ? (
          <p
            className="rounded-md p-3"
            style={{
              background: "var(--bg-tertiary)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-faint)",
              lineHeight: 1.5,
            }}
          >
            No size chart yet. Click "Use harness/collar template" to start
            from a standard 4-column grid (Size / Neck / Chest / Weight),
            or build one from scratch with the buttons below.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {chart.columns.map((col, ci) => (
                    <th
                      key={ci}
                      style={{
                        background: "rgba(187,148,41,0.08)",
                        borderBottom: "1px solid var(--bg-border)",
                        padding: "var(--space-2)",
                        minWidth: 110,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <input
                          value={col}
                          onChange={(e) => setColumnHeader(ci, e.target.value)}
                          className="w-full rounded-sm px-2 py-1"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--bg-border)",
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--gold-dark)",
                            letterSpacing: "var(--tracking-wide)",
                            textTransform: "uppercase",
                          }}
                        />
                        <button
                          onClick={() => removeColumn(ci)}
                          aria-label="Remove column"
                          className="rounded p-1"
                          style={{ color: "var(--error)" }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th
                    style={{
                      background: "rgba(187,148,41,0.08)",
                      borderBottom: "1px solid var(--bg-border)",
                      padding: "var(--space-2)",
                      width: 40,
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          borderBottom: ri === chart.rows.length - 1 ? "none" : "1px solid var(--bg-border)",
                          padding: "var(--space-1) var(--space-2)",
                        }}
                      >
                        <input
                          value={cell}
                          onChange={(e) => setCell(ri, ci, e.target.value)}
                          placeholder={ci === 0 ? "Size label" : "Value"}
                          className="w-full rounded-sm px-2 py-1.5"
                          style={{
                            background: "var(--bg-tertiary)",
                            border: "1px solid var(--bg-border)",
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 12,
                            color: ci === 0 ? "var(--white)" : "var(--white-dim)",
                            fontWeight: ci === 0 ? 600 : 400,
                          }}
                        />
                      </td>
                    ))}
                    <td
                      style={{
                        borderBottom: ri === chart.rows.length - 1 ? "none" : "1px solid var(--bg-border)",
                        padding: "var(--space-1) var(--space-2)",
                        textAlign: "right",
                      }}
                    >
                      <button
                        onClick={() => removeRow(ri)}
                        aria-label="Remove row"
                        className="rounded p-1"
                        style={{ color: "var(--error)" }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={addRow}
            disabled={chart.columns.length === 0}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 disabled:opacity-40"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--bg-border)",
              color: "var(--white-dim)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <Plus size={12} /> Add row
          </button>
          <button
            onClick={addColumn}
            className="flex items-center gap-1 rounded-md px-3 py-1.5"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--bg-border)",
              color: "var(--white-dim)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <Plus size={12} /> Add column
          </button>
        </div>
      </div>

      {/* Fit notes */}
      <div
        className="rounded-lg"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          padding: "var(--space-5)",
        }}
      >
        <label
          className="mb-2 block"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-faint)",
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
          }}
        >
          Fit notes (shown under the table on the PDP)
        </label>
        <textarea
          value={fitNotes}
          onChange={(e) => setFitNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder='e.g. "Runs slightly large — if between sizes, size down."'
          className="w-full rounded-md px-3 py-2"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--bg-border)",
            color: "var(--white)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <p
          className="mt-1 text-right"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 10,
            color: "var(--white-faint)",
          }}
        >
          {fitNotes.length}/500
        </p>
      </div>

      {/* Save bar */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => {
            setChart(normalize(product.size_chart));
            setFitNotes(product.fit_notes ?? "");
          }}
          disabled={!dirty || saveMutation.isPending}
          className="rounded-md px-4 py-2 disabled:opacity-40"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--white-dim)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
          }}
        >
          Revert
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="rounded-md px-4 py-2 disabled:opacity-40"
          style={{
            background: "var(--gold)",
            color: "#0F0F12",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
