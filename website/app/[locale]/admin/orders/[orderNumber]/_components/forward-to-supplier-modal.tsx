"use client";

/**
 * Modal for marking a dropship order item as forwarded to a supplier.
 *
 * Surfaces the SupplierProduct rows that already exist for this
 * variant (admin set them up in /admin/suppliers/supplierproduct/),
 * so picking the supplier becomes one click: click a card → form
 * auto-fills with that supplier + their last_cost + URL + SKU. No
 * typing required when the supplier link is on file.
 *
 * Below the suggestions is a manual override row in case the admin
 * needs to use a different supplier or fudge the cost — types
 * supplier_id + a custom cost manually.
 *
 * On submit, POSTs to /admin/orders/<n>/items/<id>/forward/, which:
 *   1. saves supplier_id + supplier_cost on the OrderItem
 *   2. flips fulfillment_status to processing
 *   3. auto-records a cogs_dropship Expense (already wired earlier)
 *   4. returns the updated item shape
 *
 * Importantly the modal does NOT redirect the admin away to the
 * supplier site — it shows the URL as a clickable "Open in new tab"
 * link so the admin can buy from the supplier with the customer's
 * shipping address open in another tab.
 */

import { useState } from "react";
import { Check, ExternalLink, Star, X } from "lucide-react";
import { toast } from "@heroui/react";
import { ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type {
  AdminOrder,
  AdminOrderItem,
  AdminOrderItemSupplierSuggestion,
} from "@/types/admin";

interface ForwardToSupplierModalProps {
  open: boolean;
  order: AdminOrder;
  item: AdminOrderItem | null;
  onClose: () => void;
  onForwarded: () => void;
}

function formatPence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

export function ForwardToSupplierModal({
  open,
  order,
  item,
  onClose,
  onForwarded,
}: ForwardToSupplierModalProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [costStr, setCostStr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  if (!open || !item) return null;

  const suggestions = item.available_suppliers ?? [];

  function pickSuggestion(s: AdminOrderItemSupplierSuggestion) {
    setSelectedSupplierId(s.supplier_id);
    // Pre-fill the cost field with the supplier's last known cost so
    // the admin can submit immediately if prices haven't moved.
    if (s.last_cost_pence > 0) {
      setCostStr((s.last_cost_pence / 100).toFixed(2));
    }
  }

  async function handleSubmit() {
    if (busy || !item) return;
    if (!selectedSupplierId) {
      toast.danger("Pick a supplier first");
      return;
    }
    const costPence = Math.round(parseFloat(costStr || "0") * 100);
    if (!costPence) {
      toast.danger("Cost must be positive");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        endpoints.admin.orders.forwardItem(order.order_number, item.id),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_id: selectedSupplierId,
            supplier_cost: costPence,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.code || `Forward failed (${res.status})`);
      }
      toast.success(`Marked as forwarded · ${formatPence(costPence)} recorded`);
      // Reset for next time
      setSelectedSupplierId("");
      setCostStr("");
      onForwarded();
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message :
        "Forward failed";
      toast.danger(msg);
    } finally {
      setBusy(false);
    }
  }

  const selectedSuggestion = suggestions.find(
    (s) => s.supplier_id === selectedSupplierId,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg p-6"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "var(--text-xl)",
                color: "var(--white)",
              }}
            >
              Forward to supplier
            </h3>
            <p
              className="mt-1"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "var(--white-dim)" }}>
                {item.product_name}
              </strong>
              {item.variant_option_label && ` · ${item.variant_option_label}`}
              {" · "}qty {item.quantity}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--white-faint)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Saved suppliers */}
        {suggestions.length > 0 ? (
          <>
            <p
              className="mb-2"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--white-faint)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              Saved suppliers for this variant
            </p>
            <div className="mb-4 flex flex-col gap-2">
              {suggestions.map((s) => {
                const selected = selectedSupplierId === s.supplier_id;
                return (
                  <div
                    key={s.supplier_id}
                    className="rounded-md p-3"
                    style={{
                      background: selected ? "rgba(187,148,41,0.10)" : "var(--bg-tertiary)",
                      border: `1px solid ${selected ? "rgba(187,148,41,0.4)" : "var(--bg-border)"}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p
                            style={{
                              fontFamily: "var(--font-montserrat)",
                              fontSize: "var(--text-sm)",
                              fontWeight: 600,
                              color: "var(--white)",
                            }}
                          >
                            {s.supplier_name}
                          </p>
                          {s.is_preferred && (
                            <Star size={11} fill="var(--gold)" stroke="var(--gold)" />
                          )}
                          {selected && (
                            <span
                              className="flex h-4 w-4 items-center justify-center rounded-full"
                              style={{ background: "var(--gold)" }}
                            >
                              <Check size={10} color="#0F0F12" />
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-1 flex flex-wrap gap-x-3"
                          style={{
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 11,
                            color: "var(--white-faint)",
                          }}
                        >
                          {s.supplier_sku && <span>SKU: {s.supplier_sku}</span>}
                          {s.last_cost_pence > 0 && (
                            <span>
                              Last cost{" "}
                              <strong style={{ color: "var(--gold-dark)" }}>
                                {formatPence(s.last_cost_pence)}
                              </strong>
                            </span>
                          )}
                        </div>
                      </button>
                      {s.supplier_url && (
                        <a
                          href={s.supplier_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1"
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--bg-border)",
                            color: "var(--gold)",
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 10,
                            letterSpacing: "var(--tracking-wide)",
                            textTransform: "uppercase",
                          }}
                        >
                          Buy
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div
            className="mb-4 rounded-md p-3"
            style={{
              background: "rgba(187,148,41,0.08)",
              border: "1px solid rgba(187,148,41,0.25)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              color: "var(--white-dim)",
              lineHeight: 1.5,
            }}
          >
            No saved suppliers for this variant yet. Add one at{" "}
            <a
              href="/admin/suppliers/supplierproduct/add/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--gold-dark)", textDecoration: "underline" }}
            >
              Django admin → Supplier products
            </a>{" "}
            with the URL of the listing on Temu / AliExpress / etc., then come
            back here.
          </div>
        )}

        {/* Cost input */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              Your cost for this item (£, per unit)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              placeholder="0.00"
              className="rounded-md px-2 py-2"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--bg-border)",
                color: "var(--white)",
                fontFamily: "var(--font-montserrat)",
                fontSize: 13,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--white-faint)",
              }}
            >
              {selectedSuggestion?.last_cost_pence
                ? `Pre-filled from last purchase (${formatPence(selectedSuggestion.last_cost_pence)}). Override if the price has moved.`
                : "Enter the actual cost per unit you'll pay the supplier — used to record COGS in Finances."}
            </span>
          </label>
        </div>

        <p
          className="mt-4 rounded p-2"
          style={{
            background: "rgba(187,148,41,0.06)",
            border: "1px solid rgba(187,148,41,0.18)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-dim)",
            lineHeight: 1.5,
          }}
        >
          Marking as forwarded does <strong>not</strong> place the order on the
          supplier's site automatically — that's still a manual step. Once
          you've placed the supplier order, save the receipt by clicking
          "Attach receipt" on the auto-recorded expense below.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 disabled:opacity-40"
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
            className="rounded-md px-4 py-2 disabled:opacity-40"
            style={{
              background: "var(--gold)",
              color: "#0F0F12",
              fontFamily: "var(--font-montserrat)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {busy ? "Saving…" : "Mark as forwarded"}
          </button>
        </div>
      </div>
    </div>
  );
}
