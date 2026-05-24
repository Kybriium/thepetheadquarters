"use client";

import { Printer } from "lucide-react";
import { useSiteLegal } from "@/hooks/use-site-legal";
import type { Order } from "@/types/order";

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Self-contained order receipt. Renders the receipt card AND injects the
 * `@media print` stylesheet that flattens it to white/black and hides page
 * chrome. Drop it anywhere — checkout success page, account order detail,
 * future admin reprint flow — and the printed output stays consistent.
 */
export function Receipt({ order }: { order: Order }) {
  const itemsSubtotal = order.items.reduce((sum, i) => sum + i.line_total, 0);
  const vatRatePct = order.vat_rate ? Math.round(parseFloat(order.vat_rate) * 100) : 20;
  // Companies Act 2006 s.82 — every Ltd company must show its registered
  // identity on receipts/invoices. We surface it via the public legal
  // endpoint so a single env-var update propagates everywhere.
  const legal = useSiteLegal();
  const showVat = order.vat_amount > 0;

  return (
    <>
      {/* Print-only styles — keep the receipt readable on paper and hide
          anything outside it. Scoped to the .receipt-card subtree via
          descendant selectors so it never bleeds into the live page. */}
      <style jsx global>{`
        @media print {
          @page { margin: 14mm; }
          body {
            background: #fff !important;
            color: #111 !important;
          }
          header, footer, nav, .print-hide {
            display: none !important;
          }
          .receipt-card {
            background: #fff !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .receipt-card * {
            color: #111 !important;
            border-color: #ccc !important;
            background: transparent !important;
          }
          .receipt-card .receipt-muted { color: #555 !important; }
          .receipt-card .receipt-accent { color: #b08124 !important; }
        }
      `}</style>

      <div
        className="receipt-card rounded-lg text-left"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-8)" }}
      >
        {/* Header — trading name + order meta */}
        <div className="flex items-start justify-between gap-4" style={{ borderBottom: "1px solid var(--bg-border)", paddingBottom: "var(--space-5)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-regular)", color: "var(--white)", lineHeight: 1 }}>
              {legal?.trading_name || "The Pet Headquarters"}
            </p>
            <p className="mt-1 receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
              Order receipt
            </p>
          </div>
          <div className="text-right">
            <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
              Order
            </p>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--white)" }}>
              {order.order_number}
            </p>
            <p className="receipt-muted mt-1" style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)" }}>
              {formatDate(order.paid_at || order.created_at)}
            </p>
            <p
              className="receipt-accent mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{
                background: order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered"
                  ? "rgba(46,125,50,0.1)"
                  : "rgba(187,148,41,0.12)",
                color: order.status === "cancelled" ? "var(--error)" : "var(--success)",
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              {order.status === "paid" ? "Paid" : order.status}
            </p>
          </div>
        </div>

        {/* Line items */}
        <div className="flex flex-col gap-4" style={{ paddingTop: "var(--space-5)", paddingBottom: "var(--space-5)", borderBottom: "1px solid var(--bg-border)" }}>
          {order.items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>
                  {item.product_name}
                </p>
                {item.variant_option_label && (
                  <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                    {item.variant_option_label}
                  </p>
                )}
                <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: 2 }}>
                  {item.quantity} × {formatPrice(item.unit_price)}
                </p>
                {item.customizations.length > 0 && (
                  <ul className="ml-3 mt-1.5 flex flex-col gap-0.5" style={{ borderLeft: "2px solid var(--gold)", paddingLeft: "var(--space-2)" }}>
                    {item.customizations.map((c) => (
                      <li key={c.key} className="receipt-accent" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}>
                        <span style={{ fontWeight: 600 }}>{c.label}:</span> {c.label_value}
                        {c.image_url && (
                          <a
                            href={c.image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 underline"
                            style={{ color: "var(--gold)" }}
                          >
                            view
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--white)", whiteSpace: "nowrap" }}>
                {formatPrice(item.line_total)}
              </p>
            </div>
          ))}
        </div>

        {/* Totals breakdown */}
        <div className="flex flex-col gap-1.5" style={{ paddingTop: "var(--space-5)", paddingBottom: "var(--space-5)", borderBottom: "1px solid var(--bg-border)" }}>
          <TotalsRow label="Subtotal" value={formatPrice(order.subtotal || itemsSubtotal)} />
          <TotalsRow
            label="Shipping"
            value={order.shipping_cost === 0 ? "FREE" : formatPrice(order.shipping_cost)}
            valueAccent={order.shipping_cost === 0}
          />
          {order.discount_amount > 0 && (
            <TotalsRow
              label={order.promotion_code ? `Discount (${order.promotion_code})` : "Discount"}
              value={`−${formatPrice(order.discount_amount)}`}
              valueAccent
            />
          )}
        </div>

        {/* Total — visually distinct */}
        <div className="flex items-baseline justify-between" style={{ paddingTop: "var(--space-4)", paddingBottom: "var(--space-4)" }}>
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>
            Total
          </span>
          <span className="receipt-accent" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)", color: "var(--gold-dark)" }}>
            {formatPrice(order.total)}
          </span>
        </div>
        {showVat && (
          <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)", marginTop: -8 }}>
            Includes VAT of {formatPrice(order.vat_amount)} ({vatRatePct}%)
            {legal?.vat_number && <> · VAT no. {legal.vat_number}</>}
          </p>
        )}

        {/* Shipping address */}
        <div style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-5)", borderTop: "1px solid var(--bg-border)" }}>
          <p className="receipt-muted mb-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
            Shipping to
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
            {order.shipping_full_name}
          </p>
          <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)", lineHeight: "var(--leading-relaxed)" }}>
            {order.shipping_address_line_1}
            {order.shipping_address_line_2 && (
              <>
                <br />
                {order.shipping_address_line_2}
              </>
            )}
            <br />
            {order.shipping_city}
            {order.shipping_county && `, ${order.shipping_county}`} {order.shipping_postcode}
            <br />
            {order.shipping_country}
          </p>
        </div>

        {/* Confirmation email */}
        <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--bg-border)" }}>
          <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)" }}>
            A copy of this receipt was sent to{" "}
            <strong style={{ color: "var(--white-dim)" }}>{order.email}</strong>
          </p>
        </div>

        {/* Legal disclosure — Companies Act 2006 s.82 */}
        {legal?.legal_name && (
          <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--bg-border)" }}>
            <p className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
              {legal.trading_name && legal.trading_name !== legal.legal_name && (
                <>{legal.trading_name} is a trading name of </>
              )}
              <strong style={{ color: "var(--white-dim)" }}>{legal.legal_name}</strong>
              {legal.company_number && (
                <>
                  , a company registered in {legal.incorporation || "England and Wales"}{" "}
                  (no. {legal.company_number})
                </>
              )}
              {legal.registered_office && (
                <>
                  . Registered office: {legal.registered_office}
                </>
              )}
              {legal.vat_registered && legal.vat_number && (
                <> · VAT no. {legal.vat_number}</>
              )}
              .
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Print / Save-as-PDF action. Sits outside the receipt itself so it can be
 * rendered anywhere on the page and won't appear on the printout (it has
 * .print-hide). Same UX everywhere it's used.
 */
export function PrintReceiptButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print-hide inline-flex items-center gap-2 rounded-md px-6 py-2.5"
      style={{
        border: "1px solid var(--bg-border)",
        color: "var(--gold-dark)",
        fontFamily: "var(--font-montserrat)",
        fontWeight: "var(--weight-semibold)",
        fontSize: "var(--text-sm)",
        letterSpacing: "var(--tracking-wider)",
        textTransform: "uppercase",
      }}
    >
      <Printer size={14} /> Print / save PDF
    </button>
  );
}

function TotalsRow({
  label,
  value,
  valueAccent = false,
}: {
  label: string;
  value: string;
  valueAccent?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="receipt-muted" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
        {label}
      </span>
      <span
        className={valueAccent ? "receipt-accent" : ""}
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          fontWeight: 500,
          color: valueAccent ? "var(--gold-dark)" : "var(--white)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
