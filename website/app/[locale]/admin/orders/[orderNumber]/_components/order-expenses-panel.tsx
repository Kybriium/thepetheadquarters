"use client";

/**
 * Inline finances panel for the admin order detail page.
 *
 * Surfaces every Expense row linked to this order (auto-recorded
 * Stripe fees, dropship COGS rows from "Forward to supplier", and any
 * manually-added rows) so the admin doesn't have to bounce between
 * /admin/orders/<n> and /admin/finances to keep the books straight
 * while fulfilling.
 *
 * Three actions per row:
 *   - "Upload receipt"      — multipart POST to /admin/expenses/<id>/receipt/
 *   - "Replace receipt"     — same endpoint, removes the previous file
 *   - "Open"                — signed URL / authenticated stream
 *
 * Plus a "Log expense for this order" button that opens a modal with
 * supplier + order_id + category pre-filled (defaults to cogs_dropship)
 * so the admin only types amount + description and uploads the receipt.
 */

import { useCallback, useState } from "react";
import { Paperclip, Plus, ReceiptText, X } from "lucide-react";
import { toast } from "@heroui/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { AdminOrder, AdminOrderExpense } from "@/types/admin";

interface OrderExpensesPanelProps {
  order: AdminOrder;
  /** Called when an expense is created / receipt uploaded so the parent can refetch the order. */
  onChanged: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "cogs_dropship", label: "Cost of goods (dropship)" },
  { value: "shipping_paid", label: "Outbound shipping paid by us" },
  { value: "refund_given", label: "Refund given to customer" },
  { value: "other", label: "Other" },
];

function formatPrice(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

export function OrderExpensesPanel({ order, onChanged }: OrderExpensesPanelProps) {
  const expenses = order.expenses ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Total margin computed for this order = revenue minus every linked
  // expense. Helps the admin see at a glance whether the dropship
  // order is actually profitable before they spend their evening
  // forwarding to Temu.
  const totalExpensesPence = expenses.reduce((sum, e) => sum + e.amount_pence, 0);
  const netPence = order.total - totalExpensesPence;

  const handleUpload = useCallback(
    async (expenseId: string, file: File) => {
      setUploadingId(expenseId);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(endpoints.admin.expenses.receipt(expenseId), {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status})`);
        }
        toast.success("Receipt uploaded");
        onChanged();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.danger(msg);
      } finally {
        setUploadingId(null);
      }
    },
    [onChanged],
  );

  return (
    <div
      className="rounded-lg"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--bg-border)",
        padding: "var(--space-6)",
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color: "var(--white-faint)",
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
          }}
        >
          Finances on this order
        </h2>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--bg-border)",
            color: "var(--white-dim)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          <Plus size={12} />
          Log expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <div
          className="rounded-md p-4 text-center"
          style={{
            background: "var(--bg-tertiary)",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            color: "var(--white-faint)",
            lineHeight: 1.5,
          }}
        >
          No expenses recorded yet. Stripe fees auto-appear once the
          webhook lands; dropship costs auto-appear when you click
          "Forward to supplier" on a line item.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {expenses.map((e) => (
            <ExpenseRow
              key={e.id}
              expense={e}
              uploading={uploadingId === e.id}
              onUpload={(file) => void handleUpload(e.id, file)}
            />
          ))}

          <div
            className="mt-1 flex flex-wrap items-center justify-between gap-3 pt-3"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-faint)",
              }}
            >
              Revenue {formatPrice(order.total)} · expenses −{formatPrice(totalExpensesPence)}
            </span>
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                color: netPence >= 0 ? "var(--gold-dark)" : "#FF6B6B",
              }}
            >
              Net {formatPrice(netPence)}
            </span>
          </div>
        </div>
      )}

      {addOpen && (
        <LogExpenseModal
          order={order}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ExpenseRow({
  expense,
  uploading,
  onUpload,
}: {
  expense: AdminOrderExpense;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md p-3"
      style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}
    >
      <div className="min-w-0 flex-1">
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--white)",
            lineHeight: 1.3,
          }}
        >
          {expense.category_label}
          {expense.auto_created && (
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
              Auto
            </span>
          )}
        </p>
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-faint)",
            lineHeight: 1.35,
          }}
        >
          {expense.description}
          {expense.supplier_name && ` · ${expense.supplier_name}`}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            fontWeight: 700,
            color: "#FF6B6B",
          }}
        >
          −{formatPrice(expense.amount_pence)}
        </span>

        {expense.has_receipt && expense.receipt_url ? (
          <a
            href={expense.receipt_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 10,
              color: "var(--gold-dark)",
            }}
          >
            <Paperclip size={11} />
            View
          </a>
        ) : (
          <label
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1"
            style={{
              border: "1px solid var(--bg-border)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 10,
              color: "var(--gold-dark)",
              opacity: uploading ? 0.5 : 1,
            }}
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
            <ReceiptText size={11} />
            {uploading ? "Uploading…" : "Attach receipt"}
          </label>
        )}
      </div>
    </div>
  );
}

function LogExpenseModal({
  order,
  onClose,
  onSaved,
}: {
  order: AdminOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Pre-fill what we can: category is the most likely thing the admin
  // is logging (dropship cost), the order id is implicit. Supplier
  // comes from the first dropship item if we have it — saves a click.
  const dropshipItem = order.items.find((i) => i.fulfillment_type === "dropship");
  const initialCategory = "cogs_dropship";
  const initialDescription = dropshipItem
    ? `Dropship cost — ${dropshipItem.product_name} on ${order.order_number}`
    : `Expense on ${order.order_number}`;

  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(initialCategory);
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState(initialDescription);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      const amount_pence = Math.round(parseFloat(amountStr || "0") * 100);
      if (!amount_pence) throw new Error("Amount must be positive.");
      if (!description.trim()) throw new Error("Description is required.");

      // Step 1 — create the expense linked to this order. We don't set
      // `supplier` here because the admin would expect to pick that
      // separately; the auto-recorded cogs_dropship row already carries
      // the supplier when one is set on the item. Manual rows are for
      // ad-hoc costs (e.g. paid express upgrade) that may not have a
      // supplier row in the DB anyway.
      const res = await apiClient.post<{ status: string; data: { id: string } }>(
        endpoints.admin.expenses.list,
        {
          paid_at: paidAt,
          category,
          amount_pence,
          description,
          order: order.id,
        },
      );
      const newId = res.data.id;

      // Step 2 — upload the receipt if attached.
      if (file && newId) {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch(endpoints.admin.expenses.receipt(newId), {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!resp.ok) throw new Error("Receipt upload failed");
      }

      toast.success("Expense logged");
      onSaved();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message : "Save failed";
      toast.danger(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg p-6"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "var(--text-xl)",
              color: "var(--white)",
            }}
          >
            Log expense for {order.order_number}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--white-faint)" }}>
            <X size={16} />
          </button>
        </div>

        <p
          className="mb-4 rounded p-2"
          style={{
            background: "rgba(187,148,41,0.08)",
            border: "1px solid rgba(187,148,41,0.25)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-dim)",
            lineHeight: 1.4,
          }}
        >
          This expense will be linked to <strong>{order.order_number}</strong> so
          it shows here and in /admin/finances. Pre-filled for the typical
          dropship-cost case — adjust as needed.
        </p>

        <div className="flex flex-col gap-3">
          <Field label="Date paid">
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (£)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>
          <Field label="Description">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>
          <Field label="Receipt (optional, PDF / image, max 15MB)">
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
              style={{ fontFamily: "var(--font-montserrat)", color: "var(--white-dim)" }}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
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
            onClick={handleSave}
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
            {busy ? "Saving…" : "Log expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
          fontSize: 11,
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
