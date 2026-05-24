"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Sparkles } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useCreateVariant,
  useDeleteVariant,
  useUpdateVariant,
  type AdminProductDetail,
  type AdminVariant,
} from "@/hooks/use-admin-products";
import {
  useAttachOptionTypeToProduct,
  useBulkCreateVariants,
  useDetachOptionTypeFromProduct,
  useOptionTypes,
  useProductOptionTypes,
  type AdminProductOptionTypeLink,
} from "@/hooks/use-admin-option-types";
import { ConfirmModal } from "../../../_components/confirm-modal";
import { CurrencyInput } from "../../../_components/currency-input";

interface VariantsManagerProps {
  productId: string;
  variants: AdminVariant[];
  product?: AdminProductDetail;
}

interface VariantRow {
  id?: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  weight_grams: number | null;
  sort_order: number;
  is_active: boolean;
  /** Per-axis selection: option_type_id → option_value_id (or "") */
  axisValues: Record<string, string>;
}

function emptyRow(sortOrder: number, axisIds: string[]): VariantRow {
  return {
    sku: "",
    price: 0,
    compare_at_price: null,
    cost_price: null,
    stock_quantity: 0,
    weight_grams: null,
    sort_order: sortOrder,
    is_active: true,
    axisValues: Object.fromEntries(axisIds.map((id) => [id, ""])),
  };
}

export function VariantsManager({ productId, variants }: VariantsManagerProps) {
  const createMutation = useCreateVariant(productId);
  const deleteMutation = useDeleteVariant(productId);

  const [editing, setEditing] = useState<VariantRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminVariant | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const updateMutation = useUpdateVariant(productId, editingId || "");

  const { data: productAxes = [], isLoading: axesLoading } = useProductOptionTypes(productId);

  const axisIds = useMemo(() => productAxes.map((a) => a.option_type_id), [productAxes]);

  function startCreate() {
    setEditingId(null);
    setEditing(emptyRow(variants.length, axisIds));
  }

  function startEdit(v: AdminVariant) {
    setEditingId(v.id);
    setEditing({
      sku: v.sku,
      price: v.price,
      compare_at_price: v.compare_at_price,
      cost_price: v.cost_price,
      stock_quantity: v.stock_quantity,
      weight_grams: v.weight_grams,
      sort_order: v.sort_order,
      is_active: v.is_active,
      axisValues: Object.fromEntries(
        axisIds.map((axisId) => {
          const match = v.option_values.find((ov) => ov.option_type_id === axisId);
          return [axisId, match?.id || ""];
        }),
      ),
    });
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.sku.trim() || editing.price <= 0) {
      toast.danger("SKU and price required");
      return;
    }

    // Every attached axis must have a value chosen.
    const missing = axisIds.filter((id) => !editing.axisValues[id]);
    if (missing.length > 0) {
      const axis = productAxes.find((a) => a.option_type_id === missing[0]);
      toast.danger(`Pick a ${axis?.name ?? "value"} for this variant`);
      return;
    }

    const payload = {
      sku: editing.sku,
      price: editing.price,
      compare_at_price: editing.compare_at_price,
      cost_price: editing.cost_price,
      stock_quantity: editing.stock_quantity,
      weight_grams: editing.weight_grams,
      sort_order: editing.sort_order,
      is_active: editing.is_active,
      option_value_ids: Object.values(editing.axisValues).filter(Boolean),
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync(payload);
        toast.success("Variant updated");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Variant added");
      }
      setEditing(null);
      setEditingId(null);
    } catch {
      toast.danger("Failed to save variant");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Variant deactivated");
    } catch {
      toast.danger("Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      {/* Axes attached to this product */}
      <ProductAxesPanel productId={productId} axes={productAxes} loading={axesLoading} />

      {/* Variants list */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
            Variants ({variants.length})
          </h3>
          <div className="flex gap-2">
            {productAxes.length > 0 && (
              <button
                onClick={() => setShowMatrix(true)}
                className="flex items-center gap-2 rounded-md px-3 py-2"
                style={{ border: "1px solid var(--bg-border)", color: "var(--gold-dark)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 500 }}
              >
                <Sparkles size={12} /> Generate matrix
              </button>
            )}
            {!editing && (
              <button
                onClick={startCreate}
                className="flex items-center gap-2 rounded-md px-3 py-2"
                style={{ border: "1px solid var(--bg-border)", color: "var(--gold-dark)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 500 }}
              >
                <Plus size={12} /> Add variant
              </button>
            )}
          </div>
        </div>

        {variants.length === 0 ? (
          <p
            className="rounded-lg py-12 text-center"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}
          >
            No variants yet. {productAxes.length === 0 ? "Attach axes above first, then add or matrix-generate variants." : "Use 'Generate matrix' to bulk-create variants across all axes."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
            {variants.map((v, i) => (
              <div
                key={v.id}
                className="flex items-center justify-between"
                style={{ padding: "var(--space-4) var(--space-5)", borderBottom: i < variants.length - 1 ? "1px solid var(--bg-border)" : "none" }}
              >
                <div className="flex-1">
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
                    {v.sku} {!v.is_active && <span style={{ color: "var(--error)" }}>(inactive)</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {v.option_values.length === 0 ? (
                      <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
                        No axes
                      </span>
                    ) : (
                      v.option_values.map((ov) => (
                        <span
                          key={ov.id}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{ background: "var(--bg-tertiary)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: 10 }}
                        >
                          {ov.swatch_hex && (
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ov.swatch_hex }} />
                          )}
                          {ov.label}
                        </span>
                      ))
                    )}
                    <span style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)" }}>
                      · Stock: {v.stock_quantity}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--gold-dark)", minWidth: 70, textAlign: "right" }}>
                    £{(v.price / 100).toFixed(2)}
                  </span>
                  <button onClick={() => startEdit(v)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[rgba(187,148,41,0.1)]" style={{ color: "var(--white-faint)" }} aria-label="Edit variant">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleting(v)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[rgba(198,40,40,0.1)]" style={{ color: "var(--white-faint)" }} aria-label="Delete variant">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variant editor */}
      {editing && (
        <VariantEditorForm
          editing={editing}
          editingId={editingId}
          axes={productAxes}
          isPending={isPending}
          onChange={setEditing}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setEditingId(null);
          }}
        />
      )}

      {/* Matrix generator */}
      {showMatrix && (
        <MatrixGenerator
          productId={productId}
          axes={productAxes}
          existingVariants={variants}
          onClose={() => setShowMatrix(false)}
        />
      )}

      <ConfirmModal
        open={!!deleting}
        title="Deactivate Variant?"
        message={`This will hide ${deleting?.sku} from the storefront.`}
        confirmLabel="Deactivate"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Axis attachment panel
// ---------------------------------------------------------------------------

function ProductAxesPanel({
  productId,
  axes,
  loading,
}: {
  productId: string;
  axes: AdminProductOptionTypeLink[];
  loading: boolean;
}) {
  const { data: allTypes = [] } = useOptionTypes();
  const attachMutation = useAttachOptionTypeToProduct();
  const detachMutation = useDetachOptionTypeFromProduct();

  const attachedIds = new Set(axes.map((a) => a.option_type_id));
  const available = allTypes.filter((t) => !attachedIds.has(t.id));

  async function attach(optionTypeId: string) {
    try {
      await attachMutation.mutateAsync({ productId, optionTypeId });
      toast.success("Axis attached");
    } catch {
      toast.danger("Failed");
    }
  }

  async function detach(linkId: string) {
    if (!confirm("Detach this axis? Variants using its values will lose them.")) return;
    try {
      await detachMutation.mutateAsync({ productId, linkId });
      toast.success("Axis detached");
    } catch {
      toast.danger("Failed");
    }
  }

  return (
    <div className="rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
          Variant axes
        </h3>
        <Link href="/admin/option-types" className="underline" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}>
          Manage globally →
        </Link>
      </div>
      <p className="mb-3" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
        Pick which axes this product is variantable along. Once attached, every variant must pick one value per axis.
      </p>

      {loading ? (
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>Loading…</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {axes.map((axis) => (
            <span
              key={axis.id}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{ background: "rgba(187,148,41,0.12)", border: "1px solid var(--gold)" }}
            >
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--gold-dark)" }}>
                {axis.name}
              </span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)" }}>
                {axis.values.length} values
              </span>
              <button
                onClick={() => detach(axis.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[rgba(198,40,40,0.15)]"
                style={{ color: "var(--white-faint)" }}
                title="Detach"
              >
                <Trash2 size={10} />
              </button>
            </span>
          ))}
          {axes.length === 0 && (
            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
              No axes yet.
            </span>
          )}
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-4">
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", marginBottom: 6 }}>
            Add axis
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((t) => (
              <button
                key={t.id}
                onClick={() => attach(t.id)}
                disabled={attachMutation.isPending}
                className="rounded-full px-3 py-1.5 disabled:opacity-50"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
              >
                + {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant editor form
// ---------------------------------------------------------------------------

function VariantEditorForm({
  editing,
  editingId,
  axes,
  isPending,
  onChange,
  onSave,
  onCancel,
}: {
  editing: VariantRow;
  editingId: string | null;
  axes: AdminProductOptionTypeLink[];
  isPending: boolean;
  onChange: (v: VariantRow) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const labelStyle = {
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-xs)" as const,
    color: "var(--white-dim)",
    letterSpacing: "var(--tracking-wide)",
    textTransform: "uppercase" as const,
    display: "block" as const,
    marginBottom: "var(--space-2)",
  };
  const inputStyle = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--bg-border)",
    color: "var(--white)",
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-sm)" as const,
    borderRadius: "var(--radius-md)",
    padding: "var(--space-3) var(--space-4)",
    width: "100%",
  };
  const hintStyle = { fontFamily: "var(--font-montserrat)", fontSize: 11 as const, color: "var(--white-faint)", marginTop: "var(--space-1)" };

  return (
    <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}>
      <h3 className="mb-4" style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
        {editingId ? "Edit Variant" : "New Variant"}
      </h3>

      {axes.length > 0 && (
        <div className="mb-5">
          <p style={labelStyle}>This variant represents</p>
          <div className="grid gap-3 md:grid-cols-2">
            {axes.map((axis) => (
              <div key={axis.id}>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)", marginBottom: 4 }}>
                  {axis.name} *
                </p>
                <select
                  value={editing.axisValues[axis.option_type_id] || ""}
                  onChange={(e) =>
                    onChange({
                      ...editing,
                      axisValues: { ...editing.axisValues, [axis.option_type_id]: e.target.value },
                    })
                  }
                  style={inputStyle}
                >
                  <option value="">— Choose —</option>
                  {axis.values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label style={labelStyle}>SKU *</label>
          <input value={editing.sku} onChange={(e) => onChange({ ...editing, sku: e.target.value })} style={inputStyle} placeholder="TPH-XXXXX" />
          <p style={hintStyle}>Unique product code</p>
        </div>
        <div>
          <label style={labelStyle}>Stock</label>
          <input type="number" min={0} value={editing.stock_quantity} onChange={(e) => onChange({ ...editing, stock_quantity: parseInt(e.target.value) || 0 })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Price *</label>
          <CurrencyInput value={editing.price} onChange={(p) => onChange({ ...editing, price: p ?? 0 })} />
        </div>
        <div>
          <label style={labelStyle}>Compare-at price</label>
          <CurrencyInput value={editing.compare_at_price} allowNull onChange={(p) => onChange({ ...editing, compare_at_price: p })} />
          <p style={hintStyle}>Crossed-out &quot;was&quot; price when on sale. Empty if not.</p>
        </div>
        <div>
          <label style={labelStyle}>Cost price</label>
          <CurrencyInput value={editing.cost_price} allowNull onChange={(p) => onChange({ ...editing, cost_price: p })} />
        </div>
        <div>
          <label style={labelStyle}>Weight (g)</label>
          <input type="number" min={0} value={editing.weight_grams ?? ""} onChange={(e) => onChange({ ...editing, weight_grams: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle} />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            <input type="checkbox" checked={editing.is_active} onChange={(e) => onChange({ ...editing, is_active: e.target.checked })} style={{ accentColor: "var(--gold)" }} />
            Active (visible in store)
          </label>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={onSave} disabled={isPending} className="rounded-md px-5 py-2.5 disabled:opacity-50" style={{ background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
          {isPending ? "..." : editingId ? "Save Changes" : "Add Variant"}
        </button>
        <button onClick={onCancel} className="rounded-md px-5 py-2.5" style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix generator
// ---------------------------------------------------------------------------

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>((acc, list) => {
    if (acc.length === 0) return list.map((x) => [x]);
    return acc.flatMap((tuple) => list.map((x) => [...tuple, x]));
  }, []);
}

function MatrixGenerator({
  productId,
  axes,
  existingVariants,
  onClose,
}: {
  productId: string;
  axes: AdminProductOptionTypeLink[];
  existingVariants: AdminVariant[];
  onClose: () => void;
}) {
  const bulkMutation = useBulkCreateVariants();

  // Per-axis: which values to include (defaults to all)
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      axes.map((a) => [a.option_type_id, new Set(a.values.map((v) => v.id))]),
    ),
  );
  const [defaultPrice, setDefaultPrice] = useState<number>(0);
  const [defaultStock, setDefaultStock] = useState<number>(0);

  const combos = useMemo(() => {
    const lists = axes.map((a) =>
      a.values.filter((v) => selected[a.option_type_id]?.has(v.id)).map((v) => v.id),
    );
    if (lists.some((l) => l.length === 0)) return [];
    return cartesian(lists);
  }, [axes, selected]);

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const v of existingVariants) {
      const key = [...v.option_values.map((ov) => ov.id)].sort().join("|");
      if (key) set.add(key);
    }
    return set;
  }, [existingVariants]);

  const newCombos = combos.filter(
    (c) => !existingKeys.has([...c].sort().join("|")),
  );

  function toggle(axisId: string, valueId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      const s = new Set(next[axisId] || []);
      if (s.has(valueId)) s.delete(valueId);
      else s.add(valueId);
      next[axisId] = s;
      return next;
    });
  }

  async function generate() {
    if (defaultPrice <= 0) {
      toast.danger("Set a default price");
      return;
    }
    if (newCombos.length === 0) {
      toast.warning("Nothing new to create — all combinations exist.");
      return;
    }
    try {
      const res = await bulkMutation.mutateAsync({
        productId,
        data: {
          combinations: newCombos,
          default_price: defaultPrice,
          default_stock: defaultStock,
        },
      });
      toast.success(`Created ${res.data.created} variant${res.data.created === 1 ? "" : "s"}`);
      onClose();
    } catch {
      toast.danger("Failed");
    }
  }

  return (
    <div className="rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--gold)" }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
          Matrix generator
        </h3>
        <button onClick={onClose} style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
          Cancel
        </button>
      </div>
      <p className="mb-4" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
        Pick which values combine, set a default price + stock, and we&apos;ll auto-create the missing SKUs. You can still edit each variant individually after.
      </p>

      {axes.map((axis) => (
        <div key={axis.id} className="mb-4">
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, fontWeight: 600, color: "var(--white-dim)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", marginBottom: 6 }}>
            {axis.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((v) => {
              const checked = selected[axis.option_type_id]?.has(v.id) ?? false;
              return (
                <button
                  key={v.id}
                  onClick={() => toggle(axis.option_type_id, v.id)}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{
                    background: checked ? "rgba(187,148,41,0.12)" : "var(--bg-tertiary)",
                    border: `1px solid ${checked ? "var(--gold)" : "var(--bg-border)"}`,
                    color: checked ? "var(--gold-dark)" : "var(--white-dim)",
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  {v.swatch_hex && (
                    <span className="h-3 w-3 rounded-full" style={{ background: v.swatch_hex, border: "1px solid var(--bg-border)" }} />
                  )}
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)", marginBottom: 4 }}>
            Default price *
          </p>
          <CurrencyInput value={defaultPrice || null} allowNull onChange={(p) => setDefaultPrice(p ?? 0)} />
        </div>
        <div>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)", marginBottom: 4 }}>
            Default stock
          </p>
          <input
            type="number"
            min={0}
            value={defaultStock}
            onChange={(e) => setDefaultStock(parseInt(e.target.value) || 0)}
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", width: "100%" }}
          />
        </div>
      </div>

      <p className="mt-4" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)" }}>
        {combos.length} total combinations · <span style={{ color: "var(--gold-dark)", fontWeight: 600 }}>{newCombos.length} new</span> to create
        {combos.length - newCombos.length > 0 && (
          <span style={{ color: "var(--white-faint)" }}> ({combos.length - newCombos.length} already exist, skipped)</span>
        )}
      </p>

      <div className="mt-4 flex gap-3">
        <button
          onClick={generate}
          disabled={bulkMutation.isPending || newCombos.length === 0}
          className="rounded-md px-5 py-2.5 disabled:opacity-50"
          style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600 }}
        >
          {bulkMutation.isPending ? "Creating…" : `Create ${newCombos.length} variant${newCombos.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
