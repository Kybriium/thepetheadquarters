"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { OptionValue, ProductOptionType, ProductVariant } from "@/types/product";

interface VariantSelectorProps {
  variants: ProductVariant[];
  optionTypes: ProductOptionType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectLabel: string;
}

interface AxisRow {
  type: ProductOptionType;
  values: OptionValue[];
}

/**
 * Storefront variant picker, grouped one row per axis (Color / Size / …).
 * Renders swatches when a value has `swatch_hex` or `swatch_image_url`,
 * pills otherwise. The selected variant is the unique one whose
 * option_values match every chosen axis value — i.e. the customer picks
 * Color=Red AND Size=M, we find the SKU at that intersection.
 *
 * For legacy products without explicit `optionTypes`, we derive axes from
 * the variants themselves so this still renders.
 */
export function VariantSelector({
  variants,
  optionTypes,
  selectedId,
  onSelect,
  selectLabel,
}: VariantSelectorProps) {
  const axes = useMemo<AxisRow[]>(() => {
    // Derive: for each axis, the unique option-values offered by ANY variant.
    const valueIndex = new Map<string, OptionValue>();
    const valuesPerType = new Map<string, OptionValue[]>();

    for (const v of variants) {
      for (const ov of v.option_values) {
        if (!valueIndex.has(ov.id)) {
          valueIndex.set(ov.id, ov);
          const arr = valuesPerType.get(ov.option_type_id) || [];
          arr.push(ov);
          valuesPerType.set(ov.option_type_id, arr);
        }
      }
    }

    const sortValues = (a: OptionValue, b: OptionValue) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.value.localeCompare(b.value);

    if (optionTypes.length > 0) {
      return optionTypes
        .filter((ot) => (valuesPerType.get(ot.id) || []).length > 0)
        .map((ot) => ({
          type: ot,
          values: (valuesPerType.get(ot.id) || []).sort(sortValues),
        }));
    }

    // Legacy fallback — derive axes from variants in first-seen order.
    const seen: string[] = [];
    for (const v of variants) {
      for (const ov of v.option_values) {
        if (!seen.includes(ov.option_type_id)) seen.push(ov.option_type_id);
      }
    }
    return seen.map((typeId) => ({
      type: { id: typeId, code: "", name: "", sort_order: 0 } as ProductOptionType,
      values: (valuesPerType.get(typeId) || []).sort(sortValues),
    }));
  }, [variants, optionTypes]);

  const selected = variants.find((v) => v.id === selectedId);

  /** Selected option-value-id per axis. Derived from the active variant. */
  const selectionsByAxis: Record<string, string> = {};
  if (selected) {
    for (const ov of selected.option_values) {
      selectionsByAxis[ov.option_type_id] = ov.id;
    }
  }

  function pickValue(axisTypeId: string, valueId: string) {
    // Build the target combination: keep current axis picks but flip the
    // clicked one. If no variant exists at that combination, prefer the
    // closest match (variants that include the just-clicked value).
    const target: Record<string, string> = { ...selectionsByAxis, [axisTypeId]: valueId };

    // Exact match first.
    const exact = variants.find((v) => {
      if (v.option_values.length !== Object.keys(target).filter((k) => target[k]).length) {
        // allow partial — only need every selected target to match this variant
      }
      return Object.entries(target).every(([typeId, valId]) =>
        v.option_values.some((ov) => ov.option_type_id === typeId && ov.id === valId),
      );
    });
    if (exact) {
      onSelect(exact.id);
      return;
    }

    // Fall back: first in-stock variant containing just the clicked value.
    const fallback =
      variants.find(
        (v) =>
          v.in_stock &&
          v.option_values.some((ov) => ov.id === valueId),
      ) ||
      variants.find((v) => v.option_values.some((ov) => ov.id === valueId));
    if (fallback) onSelect(fallback.id);
  }

  if (axes.length === 0 || variants.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {axes.map((axis) => {
        const selectedValueId = selectionsByAxis[axis.type.id];
        const selectedValue = axis.values.find((v) => v.id === selectedValueId);
        const axisName = axis.type.name || selectLabel;

        return (
          <div key={axis.type.id} className="flex flex-col gap-2">
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--weight-medium)",
                color: "var(--white-dim)",
              }}
            >
              {axisName}
              {selectedValue && (
                <span style={{ color: "var(--white)", marginLeft: 8, fontWeight: 600 }}>
                  {selectedValue.value}
                </span>
              )}
            </span>

            <div className="flex flex-wrap gap-2">
              {axis.values.map((value) => {
                const isSelected = value.id === selectedValueId;
                const hasSwatch = !!(value.swatch_hex || value.swatch_image_url);

                // Is at least one variant in stock at the (current selections + this value) intersection?
                const candidate: Record<string, string> = { ...selectionsByAxis, [axis.type.id]: value.id };
                const anyAvailable = variants.some(
                  (v) =>
                    v.in_stock &&
                    Object.entries(candidate).every(([typeId, valId]) =>
                      v.option_values.some((ov) => ov.option_type_id === typeId && ov.id === valId),
                    ),
                );

                if (hasSwatch) {
                  return (
                    <button
                      key={value.id}
                      onClick={() => pickValue(axis.type.id, value.id)}
                      disabled={!anyAvailable}
                      title={value.value}
                      aria-label={value.value}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                      style={{
                        backgroundImage: value.swatch_image_url
                          ? `url(${value.swatch_image_url})`
                          : undefined,
                        backgroundColor: value.swatch_hex || "var(--bg-tertiary)",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        border: `2px solid ${isSelected ? "var(--gold)" : "var(--bg-border)"}`,
                        boxShadow: isSelected ? "0 0 0 2px rgba(187,148,41,0.3)" : "none",
                      }}
                    >
                      {isSelected && (
                        <Check size={16} style={{ color: "#fff", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }} />
                      )}
                    </button>
                  );
                }

                return (
                  <button
                    key={value.id}
                    onClick={() => pickValue(axis.type.id, value.id)}
                    disabled={!anyAvailable}
                    className="rounded-md px-4 py-2 transition-all duration-200 disabled:opacity-40"
                    style={{
                      background: isSelected ? "var(--gold)" : "var(--bg-tertiary)",
                      color: isSelected ? "var(--black)" : "var(--white)",
                      border: `1px solid ${isSelected ? "var(--gold)" : "var(--bg-border)"}`,
                      fontFamily: "var(--font-montserrat)",
                      fontSize: "var(--text-sm)",
                      textDecoration: anyAvailable ? "none" : "line-through",
                    }}
                  >
                    {value.value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
