"use client";

/**
 * "Suppliers" tab on the admin product edit page.
 *
 * Lets the admin answer the question "where do we actually buy this
 * variant from?" right next to the rest of the product data, instead
 * of jumping to Django admin to set up the SupplierProduct row.
 *
 * Layout:
 *   - One section per variant (collapsed by default if more than one)
 *   - Inside each section: list of existing supplier links + an
 *     inline "Add supplier" form
 *   - Each row can be edited in-place (URL, SKU, cost, preferred) or
 *     deleted
 *
 * The data ultimately powers the "Forward to supplier" modal on the
 * order detail page — once a supplier link is saved here, it appears
 * as a clickable suggestion there with one-click pre-fill.
 */

import { useState } from "react";
import {
  ExternalLink,
  Pencil,
  Plus,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@heroui/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import {
  SupplierPicker,
  type SupplierPickerOption,
} from "../../../_components/supplier-picker";

interface SuppliersManagerProps {
  variants: ProductVariant[];
}

interface ProductVariant {
  id: string;
  sku: string;
  // The variant payload from useAdminProduct exposes option_values as
  // a flat string array on at least one path; we render whichever is
  // available so the section header is always informative.
  option_label?: string;
}

interface SupplierProductRow {
  id: string;
  supplier: string;            // supplier UUID
  variant: string;             // variant UUID
  variant_sku: string;
  product_name: string;
  supplier_sku: string;
  supplier_url: string;
  last_cost: number;
  is_preferred: boolean;
  notes: string;
}

function formatPence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Outer manager — one section per variant
// ---------------------------------------------------------------------------

export function SuppliersManager({ variants }: SuppliersManagerProps) {
  // No pre-fetch of every supplier — the SupplierPicker queries the
  // backend with a server-side search instead, which scales to
  // hundreds or thousands of suppliers without dragging the page
  // load.

  if (variants.length === 0) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            color: "var(--white-faint)",
          }}
        >
          Add a variant first — supplier links are per-variant so the
          "Forward to supplier" modal on order lines can pick the
          correct one for what the customer bought.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-xs)",
          color: "var(--white-faint)",
          lineHeight: 1.5,
        }}
      >
        Where do you actually buy each variant? Adding a supplier link
        here makes it appear as a one-click suggestion when you forward
        an order item to a supplier.
      </p>

      {variants.map((v) => (
        <VariantSuppliersCard key={v.id} variant={v} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-variant card
// ---------------------------------------------------------------------------

function VariantSuppliersCard({
  variant,
}: {
  variant: ProductVariant;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const queryKey = ["admin", "variant", variant.id, "suppliers"];

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.getSuccess<SupplierProductRow[]>(
        endpoints.admin.variantSuppliers(variant.id),
      );
      return res;
    },
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<SupplierProductRow>) => {
      const res = await apiClient.post<{ status: string; data: SupplierProductRow }>(
        endpoints.admin.variantSuppliers(variant.id),
        data,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div
      className="rounded-lg"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--bg-border)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--bg-border)" }}
      >
        <div className="flex items-baseline gap-3">
          <h3
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "var(--text-lg)",
              color: "var(--white)",
            }}
          >
            {variant.sku}
          </h3>
          {variant.option_label && (
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
              }}
            >
              {variant.option_label}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-md px-3 py-1.5"
          style={{
            background: adding ? "var(--bg-tertiary)" : "var(--gold)",
            color: adding ? "var(--white-dim)" : "#0F0F12",
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          {adding ? <X size={12} /> : <Plus size={12} />}
          {adding ? "Cancel" : "Add supplier"}
        </button>
      </div>

      <div className="px-4 py-3">
        {adding && (
          <SupplierForm
            variantId={variant.id}
            existingSupplierIds={rows.map((r) => r.supplier)}
            onSubmit={async (data) => {
              try {
                await createMutation.mutateAsync(data);
                toast.success("Supplier linked");
                setAdding(false);
              } catch (err) {
                const code = err instanceof ApiError ? err.message : "";
                toast.danger(
                  code === "admin.supplier_product.duplicate"
                    ? "This supplier is already linked to this variant"
                    : `Save failed${code ? ` (${code})` : ""}`,
                );
              }
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {isLoading ? (
          <div
            className="py-4 text-center"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              color: "var(--white-faint)",
            }}
          >
            Loading…
          </div>
        ) : rows.length === 0 && !adding ? (
          <div
            className="py-4 text-center"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 12,
              color: "var(--white-faint)",
            }}
          >
            No suppliers linked yet — click "Add supplier" to record where
            this variant comes from.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <SupplierRow key={row.id} row={row} onChanged={invalidateAll} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single row — view + edit-in-place + delete
// ---------------------------------------------------------------------------

function SupplierRow({
  row,
  onChanged,
}: {
  row: SupplierProductRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  // We need the supplier name for display. The backend includes it
  // indirectly via the serializer's nested `supplier` UUID — fetch
  // the supplier in one cached query (shared across all rows that
  // reference it) so we never block on a list lookup.
  const { data: supplier } = useQuery<{ id: string; name: string }>({
    queryKey: ["admin", "supplier", row.supplier, "summary"],
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: { id: string; name: string } }>(
        endpoints.admin.suppliers.detail(row.supplier),
      );
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const supplierName = supplier?.name ?? "Loading…";

  async function patch(payload: Partial<SupplierProductRow>) {
    try {
      await apiClient.patch(endpoints.admin.supplierProducts.detail(row.id), payload);
      onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "";
      toast.danger(`Update failed${code ? ` (${code})` : ""}`);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove this supplier link?`)) return;
    try {
      await apiClient.del(endpoints.admin.supplierProducts.detail(row.id));
      toast.success("Supplier link removed");
      onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "";
      toast.danger(`Remove failed${code ? ` (${code})` : ""}`);
    }
  }

  if (editing) {
    return (
      <EditRow
        row={row}
        supplierName={supplierName}
        onSubmit={async (payload) => {
          await patch(payload);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-md p-3"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--bg-border)",
      }}
    >
      <button
        onClick={() => patch({ is_preferred: !row.is_preferred })}
        aria-label={row.is_preferred ? "Unset preferred" : "Set as preferred"}
        title={row.is_preferred ? "Preferred supplier — click to unset" : "Click to mark as preferred"}
        className="shrink-0 rounded-full p-1"
        style={{ color: row.is_preferred ? "var(--gold)" : "var(--white-faint)" }}
      >
        {row.is_preferred ? <Star size={14} fill="var(--gold)" /> : <StarOff size={14} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--white)",
          }}
        >
          {supplierName}
        </p>
        <div
          className="mt-0.5 flex flex-wrap gap-x-3"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-faint)",
          }}
        >
          {row.supplier_sku && <span>SKU: {row.supplier_sku}</span>}
          {row.last_cost > 0 && (
            <span>
              Last cost{" "}
              <strong style={{ color: "var(--gold-dark)" }}>
                {formatPence(row.last_cost)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {row.supplier_url && (
        <a
          href={row.supplier_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--bg-border)",
            color: "var(--gold-dark)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 10,
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
          }}
        >
          Open
          <ExternalLink size={10} />
        </a>
      )}

      <button
        onClick={() => setEditing(true)}
        aria-label="Edit supplier link"
        className="shrink-0 rounded p-1"
        style={{ color: "var(--white-faint)" }}
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={handleDelete}
        aria-label="Remove supplier link"
        className="shrink-0 rounded p-1"
        style={{ color: "var(--error)" }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms — used by both Add and Edit
// ---------------------------------------------------------------------------

function SupplierForm({
  variantId: _variantId,
  existingSupplierIds,
  onSubmit,
  onCancel,
}: {
  variantId: string;
  existingSupplierIds: string[];
  onSubmit: (data: Partial<SupplierProductRow>) => Promise<void>;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<SupplierPickerOption | null>(null);
  const [url, setUrl] = useState("");
  const [sku, setSku] = useState("");
  const [costStr, setCostStr] = useState("");
  const [isPreferred, setIsPreferred] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (busy) return;
    if (!picked) {
      toast.danger("Search and pick a supplier first");
      return;
    }
    setBusy(true);
    const cost = Math.round(parseFloat(costStr || "0") * 100);
    await onSubmit({
      supplier: picked.id,
      supplier_url: url.trim(),
      supplier_sku: sku.trim(),
      last_cost: cost,
      is_preferred: isPreferred,
    });
    setBusy(false);
  }

  return (
    <div
      className="mb-3 rounded-md p-3"
      style={{
        background: "rgba(187,148,41,0.05)",
        border: "1px solid rgba(187,148,41,0.25)",
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Supplier">
          {/* Search-as-you-type — scales to any number of suppliers
              because matches are pulled from the server, not pre-loaded. */}
          <SupplierPicker
            value={picked}
            onChange={setPicked}
            excludeIds={existingSupplierIds}
            placeholder="Search suppliers…"
          />
        </Field>
        <Field label="Last cost (£, per unit)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-md px-2 py-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Supplier listing URL">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.temu.com/product/..."
            className="w-full rounded-md px-2 py-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Supplier SKU">
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Their product code"
            className="w-full rounded-md px-2 py-2"
            style={inputStyle}
          />
        </Field>
      </div>

      <label
        className="mt-3 flex items-center gap-2"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: 12,
          color: "var(--white-dim)",
        }}
      >
        <input
          type="checkbox"
          checked={isPreferred}
          onChange={(e) => setIsPreferred(e.target.checked)}
        />
        Mark as preferred (appears first in the forward-to-supplier modal)
      </label>

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-3 py-1.5"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--white-dim)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-md px-3 py-1.5"
          style={{
            background: "var(--gold)",
            color: "#0F0F12",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {busy ? "Saving…" : "Save supplier link"}
        </button>
      </div>
    </div>
  );
}

function EditRow({
  row,
  supplierName,
  onSubmit,
  onCancel,
}: {
  row: SupplierProductRow;
  supplierName: string;
  onSubmit: (payload: Partial<SupplierProductRow>) => Promise<void>;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(row.supplier_url);
  const [sku, setSku] = useState(row.supplier_sku);
  const [costStr, setCostStr] = useState((row.last_cost / 100).toFixed(2));
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    const cost = Math.round(parseFloat(costStr || "0") * 100);
    await onSubmit({
      supplier_url: url.trim(),
      supplier_sku: sku.trim(),
      last_cost: cost,
    });
    setBusy(false);
  }

  return (
    <div
      className="rounded-md p-3"
      style={{
        background: "rgba(187,148,41,0.05)",
        border: "1px solid rgba(187,148,41,0.25)",
      }}
    >
      <p
        className="mb-2"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: 11,
          color: "var(--white-faint)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
        }}
      >
        Editing {supplierName}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Last cost (£, per unit)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            className="w-full rounded-md px-2 py-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Supplier SKU">
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full rounded-md px-2 py-2"
            style={inputStyle}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Supplier listing URL">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-3 py-1.5"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--white-dim)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-md px-3 py-1.5"
          style={{
            background: "var(--gold)",
            color: "#0F0F12",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared input styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: 10,
          color: "var(--white-faint)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
