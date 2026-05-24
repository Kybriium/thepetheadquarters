"use client";

/**
 * Admin Finances — the screen used to drive HMRC year-end filings.
 *
 * Shows revenue / COGS / expenses / gross profit / net profit for the
 * selected date range (defaults to current UK tax year). Below the
 * numbers is the live Expense ledger (paginated) with an "Add expense"
 * action that opens a modal with receipt upload. CSV export covers
 * income + expense rows in one combined file for the accountant.
 *
 * All numbers are recomputed by the backend on each refresh — no client-
 * side aggregation, so the year-end CSV and the dashboard always agree.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "@heroui/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

// ---------------------------------------------------------------------------
// Types matching the backend serialisers
// ---------------------------------------------------------------------------

interface OverviewResponse {
  period: { from: string; to: string };
  revenue: {
    gross_pence: number;
    order_count: number;
    avg_order_value_pence: number;
  };
  expenses: {
    total_pence: number;
    cogs_pence: number;
    stripe_fees_pence: number;
    refunds_pence: number;
    shipping_paid_pence: number;
    operating_pence: number;
    by_category: Record<string, number>;
  };
  profit: {
    gross_pence: number;
    gross_margin_pct: number;
    net_pence: number;
    net_margin_pct: number;
  };
}

interface ExpenseRow {
  id: string;
  paid_at: string;
  category: string;
  category_label: string;
  amount_pence: number;
  amount_pounds: number;
  vat_amount_pence: number;
  currency: string;
  description: string;
  supplier: string | null;
  supplier_name: string | null;
  order: string | null;
  order_number: string | null;
  receipt_filename: string;
  receipt_url: string | null;
  has_receipt: boolean;
  notes: string;
  auto_created: boolean;
  external_ref: string;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "cogs_dropship", label: "Cost of goods (dropship)" },
  { value: "cogs_inventory", label: "Cost of goods (inventory)" },
  { value: "stripe_fee", label: "Stripe fee" },
  { value: "shipping_paid", label: "Outbound shipping paid by us" },
  { value: "refund_given", label: "Refund given to customer" },
  { value: "ads", label: "Advertising / marketing" },
  { value: "software", label: "Software subscriptions" },
  { value: "postage", label: "Postage / packaging materials" },
  { value: "accounting", label: "Accounting / legal fees" },
  { value: "office", label: "Office supplies / utilities" },
  { value: "other", label: "Other" },
];

function formatPrice(p: number | undefined | null): string {
  if (p == null) return "£0.00";
  return `£${(p / 100).toFixed(2)}`;
}

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function taxYearStartISO(): string {
  // UK personal tax year: Apr 6 → Apr 5
  const now = new Date();
  const year = now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6)
    ? now.getFullYear() - 1
    : now.getFullYear();
  return `${year}-04-06`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminFinancesPage() {
  const [from, setFrom] = useState<string>(taxYearStartISO());
  const [to, setTo] = useState<string>(todayISO());
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  const params = useMemo(
    () => `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    [from, to],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, ex] = await Promise.all([
        apiClient.getSuccess<OverviewResponse>(
          `${endpoints.admin.finances.overview}${params}`,
        ),
        apiClient.get<{ status: string; data: ExpenseRow[]; count: number }>(
          `${endpoints.admin.expenses.list}${params}&page_size=50`,
        ),
      ]);
      setOverview(ov);
      // Paginated response may return as `{results, count}` or `{data, count}` depending on shape
      const rows = (ex as unknown as { results?: ExpenseRow[] }).results
        ?? (ex as unknown as { data?: ExpenseRow[] }).data
        ?? [];
      setExpenses(rows);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.danger(`Failed to load finances (${err.message})`);
      }
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-3xl)",
            fontWeight: "var(--weight-regular)",
            color: "var(--white)",
          }}
        >
          Finances
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
          <a
            href={`${endpoints.admin.finances.export}${params}`}
            className="flex items-center gap-2 rounded-md px-3 py-2"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--bg-border)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-dim)",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <Download size={14} />
            Export CSV
          </a>
          <button
            onClick={() => {
              setEditing(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2"
            style={{
              background: "var(--gold)",
              color: "#0F0F12",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            <Plus size={14} />
            Add expense
          </button>
        </div>
      </div>

      {loading && !overview ? (
        <div className="flex justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full"
            style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }}
          />
        </div>
      ) : (
        <>
          {overview && (
            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card
                Icon={TrendingUp}
                label="Revenue"
                value={formatPrice(overview.revenue.gross_pence)}
                sub={`${overview.revenue.order_count} orders · avg ${formatPrice(
                  overview.revenue.avg_order_value_pence,
                )}`}
              />
              <Card
                Icon={Wallet}
                label="Cost of goods"
                value={formatPrice(overview.expenses.cogs_pence)}
                sub="Dropship + inventory"
              />
              <Card
                Icon={Receipt}
                label="Other expenses"
                value={formatPrice(
                  overview.expenses.total_pence - overview.expenses.cogs_pence,
                )}
                sub={`Stripe ${formatPrice(overview.expenses.stripe_fees_pence)} · ops ${formatPrice(
                  overview.expenses.operating_pence,
                )}`}
              />
              <Card
                Icon={TrendingUp}
                label="Net profit"
                value={formatPrice(overview.profit.net_pence)}
                sub={`Gross ${formatPrice(overview.profit.gross_pence)} (${overview.profit.gross_margin_pct}%) · Net ${overview.profit.net_margin_pct}%`}
                highlight
              />
            </div>
          )}

          {/* Expense ledger */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--bg-border)" }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "var(--text-xl)",
                  fontWeight: "var(--weight-medium)",
                  color: "var(--white)",
                }}
              >
                Expense ledger
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  color: "var(--white-faint)",
                }}
              >
                {expenses.length} rows in window
              </span>
            </div>

            {expenses.length === 0 ? (
              <div
                className="px-4 py-12 text-center"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-sm)",
                  color: "var(--white-faint)",
                }}
              >
                No expenses in this window. Add one with the button above
                or wait for the first paid order — Stripe fees and dropship
                COGS will appear automatically.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--bg-border)" }}>
                      {["Date", "Category", "Description", "Amount", "Source", "Receipt", ""].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left"
                          style={{
                            fontFamily: "var(--font-montserrat)",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--white-faint)",
                            letterSpacing: "var(--tracking-widest)",
                            textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr
                        key={e.id}
                        style={{ borderBottom: "1px solid var(--bg-border)" }}
                      >
                        <td className="px-3 py-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)" }}>
                          {e.paid_at}
                        </td>
                        <td className="px-3 py-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)" }}>
                          {e.category_label}
                        </td>
                        <td className="px-3 py-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white)" }}>
                          {e.description}
                          {e.order_number && (
                            <span style={{ color: "var(--gold-dark)", marginLeft: 6 }}>
                              · {e.order_number}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 700, color: "#FF6B6B" }}>
                          −{formatPrice(e.amount_pence)}
                        </td>
                        <td className="px-3 py-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)" }}>
                          {e.auto_created ? "Auto" : "Manual"}
                          {e.supplier_name && ` · ${e.supplier_name}`}
                        </td>
                        <td className="px-3 py-2">
                          {e.has_receipt && e.receipt_url ? (
                            <a
                              href={e.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1"
                              style={{
                                fontFamily: "var(--font-montserrat)",
                                fontSize: 10,
                                color: "var(--gold-dark)",
                              }}
                            >
                              <Paperclip size={11} />
                              {e.receipt_filename || "View"}
                            </a>
                          ) : (
                            <span style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              setEditing(e);
                              setShowAddModal(true);
                            }}
                            aria-label="Edit"
                            className="rounded p-1"
                            style={{ color: "var(--white-faint)" }}
                          >
                            <Pencil size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showAddModal && (
        <ExpenseModal
          existing={editing}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card / DateInput building blocks
// ---------------------------------------------------------------------------

function Card({
  Icon,
  label,
  value,
  sub,
  highlight,
}: {
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${highlight ? "rgba(187,148,41,0.4)" : "var(--bg-border)"}`,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} style={{ color: "var(--gold-dark)" }} />
        <span
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-faint)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          {label}
        </span>
      </div>
      <p
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-medium)",
          color: highlight ? "var(--gold)" : "var(--white)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          className="mt-1"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-faint)",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: 11,
          color: "var(--white-faint)",
          letterSpacing: "var(--tracking-wide)",
        }}
      >
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md px-2 py-1"
        style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--bg-border)",
          color: "var(--white)",
          fontFamily: "var(--font-montserrat)",
          fontSize: 12,
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Add / edit expense modal with receipt upload
// ---------------------------------------------------------------------------

function ExpenseModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: ExpenseRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const isAuto = !!existing?.auto_created;
  const [paidAt, setPaidAt] = useState(existing?.paid_at ?? todayISO());
  const [category, setCategory] = useState(existing?.category ?? "other");
  const [amountStr, setAmountStr] = useState(
    existing ? (existing.amount_pence / 100).toFixed(2) : "",
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      const amount_pence = Math.round(parseFloat(amountStr || "0") * 100);
      if (!isAuto) {
        if (!description.trim()) throw new Error("Description is required.");
        if (!amount_pence) throw new Error("Amount must be positive.");
      }

      let saved: ExpenseRow;
      if (isEdit && existing) {
        if (isAuto) {
          // Auto-created rows: only notes editable
          const res = await apiClient.patch<{ status: string; data: ExpenseRow }>(
            endpoints.admin.expenses.detail(existing.id),
            { notes },
          );
          saved = res.data;
        } else {
          const res = await apiClient.patch<{ status: string; data: ExpenseRow }>(
            endpoints.admin.expenses.detail(existing.id),
            {
              paid_at: paidAt,
              category,
              amount_pence,
              description,
              notes,
            },
          );
          saved = res.data;
        }
      } else {
        const res = await apiClient.post<{ status: string; data: ExpenseRow }>(
          endpoints.admin.expenses.list,
          {
            paid_at: paidAt,
            category,
            amount_pence,
            description,
            notes,
          },
        );
        saved = res.data;
      }

      // If a file was attached, upload it now (one extra request — keeps
      // the JSON endpoint simple by not bundling multipart logic into it).
      if (file && saved.id) {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch(endpoints.admin.expenses.receipt(saved.id), {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!resp.ok) {
          throw new Error("Receipt upload failed");
        }
      }

      toast.success(isEdit ? "Expense updated" : "Expense saved");
      onSaved();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message :
        "Failed to save";
      toast.danger(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!existing || existing.auto_created) return;
    if (!confirm("Delete this expense? The receipt file is also removed.")) return;
    setBusy(true);
    try {
      await apiClient.del(endpoints.admin.expenses.detail(existing.id));
      toast.success("Expense deleted");
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to delete";
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
        className="w-full max-w-lg rounded-lg p-6"
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
            {isEdit ? "Edit expense" : "Add expense"}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--white-faint)" }}>
            <X size={16} />
          </button>
        </div>

        {isAuto && (
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
            This row was created automatically (Stripe fee / COGS). Amount,
            category and description are locked. You can still add notes
            and attach a receipt.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Field label="Date paid">
            <input
              type="date"
              value={paidAt}
              disabled={isAuto}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>

          <Field label="Category">
            <select
              value={category}
              disabled={isAuto}
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
              name="amount_pence"
              type="number"
              step="0.01"
              min="0"
              value={amountStr}
              disabled={isAuto}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>

          <Field label="Description">
            <input
              name="description"
              type="text"
              value={description}
              disabled={isAuto}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='e.g. "Google Ads March", "Vistaprint packaging"'
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md px-2 py-2"
              style={inputStyle}
            />
          </Field>

          <Field label="Receipt (PDF / image, max 15MB)">
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
              style={{ fontFamily: "var(--font-montserrat)", color: "var(--white-dim)" }}
            />
            {existing?.has_receipt && (
              <a
                href={existing.receipt_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  color: "var(--gold-dark)",
                }}
              >
                <Paperclip size={11} />
                Current: {existing.receipt_filename}
              </a>
            )}
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {isEdit && !isAuto ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center gap-1 rounded-md px-3 py-2 disabled:opacity-40"
              style={{
                background: "transparent",
                border: "1px solid rgba(214,40,40,0.35)",
                color: "#FF6B6B",
                fontFamily: "var(--font-montserrat)",
                fontSize: 12,
              }}
            >
              <Trash2 size={12} />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
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
              {busy ? "Saving…" : isEdit ? "Update" : "Save"}
            </button>
          </div>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
