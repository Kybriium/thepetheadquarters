"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Truck, XCircle, RefreshCw } from "lucide-react";
import { toast } from "@heroui/react";
import { ApiError } from "@/lib/api-client";
import {
  useAdminOrder,
  useCancelOrder,
  useRefundOrder,
  useShipOrder,
  useTransitionOrderStatus,
} from "@/hooks/use-admin-orders";
import type { CarrierCode } from "@/types/admin";
import { StatusBadge } from "../../../_components/status-badge";
import { ShipModal } from "../../../_components/ship-modal";
import { ConfirmModal } from "../../../_components/confirm-modal";
import { OrderStatusTimeline } from "../../../_components/order-status-timeline";
import type enAdmin from "@/i18n/dictionaries/en/admin.json";

interface OrderDetailViewProps {
  dict: typeof enAdmin;
  orderNumber: string;
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function OrderDetailView({ dict, orderNumber }: OrderDetailViewProps) {
  const { data: order, isLoading } = useAdminOrder(orderNumber);
  const shipMutation = useShipOrder(orderNumber);
  const cancelMutation = useCancelOrder(orderNumber);
  const refundMutation = useRefundOrder(orderNumber);
  const statusMutation = useTransitionOrderStatus(orderNumber);

  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  async function handleShip(carrier: CarrierCode, trackingNumber: string, trackingUrl: string) {
    try {
      await shipMutation.mutateAsync({
        carrier,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
      });
      setShipOpen(false);
      toast.success("Order marked as shipped.");
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "";
      toast.danger(code.includes("tracking") ? "Tracking required" : "Failed to ship order");
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync("Cancelled via admin");
      setCancelOpen(false);
      toast.success("Order cancelled.");
    } catch {
      toast.danger("Failed to cancel order");
    }
  }

  async function handleRefund() {
    try {
      await refundMutation.mutateAsync();
      setRefundOpen(false);
      toast.success("Refund issued.");
    } catch {
      toast.danger("Refund failed");
    }
  }

  async function handleStatusTransition(status: string) {
    try {
      await statusMutation.mutateAsync(status);
      toast.success(`Status updated to ${status}`);
    } catch {
      toast.danger("Failed to update status");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-lg py-16 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
          Order not found.
        </p>
      </div>
    );
  }

  const canShip = ["paid", "processing"].includes(order.status);
  const canCancel = !["cancelled", "delivered"].includes(order.status);
  const canRefund = ["paid", "processing", "shipped"].includes(order.status) && !!order.stripe_payment_intent_id;
  const canDeliver = order.status === "shipped";
  const canProcess = order.status === "paid";

  const actionLoading =
    shipMutation.isPending ||
    cancelMutation.isPending ||
    refundMutation.isPending ||
    statusMutation.isPending;

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <Link
        href="/admin/orders"
        className="inline-flex w-fit items-center gap-2 transition-colors duration-200 hover:text-[var(--gold)]"
        style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-regular)", color: "var(--white)" }}>
            {order.order_number}
          </h1>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
            Placed {formatDateTime(order.created_at)} · {order.email}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Status timeline */}
      <OrderStatusTimeline order={order} />

      {/* Desktop action buttons */}
      <div className="hidden flex-wrap gap-3 md:flex">
        {canShip && (
          <button
            onClick={() => setShipOpen(true)}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-md px-5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}
          >
            <Truck size={16} />
            {dict.orders.actions.ship}
          </button>
        )}
        {canProcess && (
          <button onClick={() => handleStatusTransition("processing")} disabled={actionLoading} className="rounded-md px-4 py-2.5 transition-colors duration-200 disabled:opacity-50" style={{ border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            {dict.orders.actions.process}
          </button>
        )}
        {canDeliver && (
          <button onClick={() => handleStatusTransition("delivered")} disabled={actionLoading} className="rounded-md px-4 py-2.5 transition-colors duration-200 disabled:opacity-50" style={{ border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            {dict.orders.actions.deliver}
          </button>
        )}
        {canRefund && (
          <button onClick={() => setRefundOpen(true)} disabled={actionLoading} className="flex items-center gap-2 rounded-md px-4 py-2.5 transition-colors duration-200 disabled:opacity-50" style={{ border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            <RefreshCw size={14} />
            {dict.orders.actions.refund}
          </button>
        )}
        {canCancel && (
          <button onClick={() => setCancelOpen(true)} disabled={actionLoading} className="flex items-center gap-2 rounded-md px-4 py-2.5 transition-colors duration-200 disabled:opacity-50" style={{ border: "1px solid var(--bg-border)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}>
            <XCircle size={14} />
            {dict.orders.actions.cancel}
          </button>
        )}
      </div>

      {/* Items */}
      <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}>
        <h2 className="mb-4" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
          Items ({order.items.length})
        </h2>
        <div className="flex flex-col gap-4">
          {order.items.map((item, i) => (
            <div
              key={item.id}
              className="flex gap-4"
              style={{
                paddingBottom: i < order.items.length - 1 ? "var(--space-4)" : 0,
                borderBottom: i < order.items.length - 1 ? "1px solid var(--bg-border)" : "none",
              }}
            >
              {item.image_url && (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md" style={{ background: "var(--bg-tertiary)" }}>
                  <Image src={item.image_url} alt={item.product_name} fill sizes="64px" className="object-cover" />
                </div>
              )}
              <div className="flex-1">
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
                  {item.product_name}
                  {item.fulfillment_type === "dropship" && (
                    <span className="ml-2 rounded-full px-2 py-0.5" style={{ background: "rgba(21,101,192,0.1)", color: "var(--info)", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" }}>
                      Dropship
                    </span>
                  )}
                </p>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                  {item.variant_sku} {item.variant_option_label && `· ${item.variant_option_label}`}
                </p>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                  Qty: {item.quantity} × {formatPrice(item.unit_price)}
                </p>
                {item.cogs_amount > 0 && (
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                    COGS: {formatPrice(item.cogs_amount)}
                  </p>
                )}
                {item.customizations.length > 0 && (
                  <div className="mt-2 rounded-md p-2.5" style={{ background: "rgba(187,148,41,0.08)", borderLeft: "2px solid var(--gold)" }}>
                    <p className="mb-1" style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", fontWeight: 600, color: "var(--gold-dark)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
                      Personalization
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {item.customizations.map((c) => (
                        <p key={c.key} style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)" }}>
                          <span style={{ fontWeight: 600, color: "var(--white)" }}>{c.label}:</span> {c.label_value}
                          {c.image_url && (
                            <>
                              {" — "}
                              <a href={c.image_url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--gold-dark)" }}>
                                download
                              </a>
                            </>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>
                {formatPrice(item.line_total)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Shipping address */}
        <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-5)" }}>
          <h2 className="mb-3" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
            Shipping Address
          </h2>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
            {order.shipping_full_name}
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
            {order.shipping_address_line_1}
            {order.shipping_address_line_2 && `, ${order.shipping_address_line_2}`}
            <br />
            {order.shipping_city}{order.shipping_county ? `, ${order.shipping_county}` : ""} {order.shipping_postcode}
          </p>
          {order.shipping_phone && (
            <p className="mt-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
              📞 {order.shipping_phone}
            </p>
          )}
        </div>

        {/* Payment */}
        <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-5)" }}>
          <h2 className="mb-3" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
            Payment
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>Subtotal (net)</span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>{formatPrice(order.subtotal - order.vat_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>VAT</span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>{formatPrice(order.vat_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>Shipping</span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: order.shipping_cost === 0 ? "var(--success)" : "var(--white)" }}>
                {order.shipping_cost === 0 ? "FREE" : formatPrice(order.shipping_cost)}
              </span>
            </div>
            <div className="flex justify-between" style={{ paddingTop: "var(--space-2)", borderTop: "1px solid var(--bg-border)" }}>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>Total</span>
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-base)", fontWeight: "var(--weight-bold)", color: "var(--gold-dark)" }}>{formatPrice(order.total)}</span>
            </div>
            {order.refund_amount > 0 && (
              <div className="flex justify-between">
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--error)" }}>Refunded</span>
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--error)" }}>{formatPrice(order.refund_amount)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tracking */}
      {order.tracking_carrier && (
        <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-5)" }}>
          <h2 className="mb-3" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
            Tracking
          </h2>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>
            {dict.orders.carriers[order.tracking_carrier as CarrierCode]} · {order.tracking_number}
          </p>
          {order.tracking_link && (
            <a href={order.tracking_link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}>
              Track package →
            </a>
          )}
        </div>
      )}

      {/* Mobile sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex gap-2 border-t md:hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--bg-border)", padding: "var(--space-3) var(--space-4)" }}>
        {canShip ? (
          <button onClick={() => setShipOpen(true)} disabled={actionLoading} className="flex-1 rounded-md px-4 py-3 disabled:opacity-50" style={{ background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
            {dict.orders.actions.ship}
          </button>
        ) : canDeliver ? (
          <button onClick={() => handleStatusTransition("delivered")} disabled={actionLoading} className="flex-1 rounded-md px-4 py-3 disabled:opacity-50" style={{ background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
            {dict.orders.actions.deliver}
          </button>
        ) : canProcess ? (
          <button onClick={() => handleStatusTransition("processing")} disabled={actionLoading} className="flex-1 rounded-md px-4 py-3 disabled:opacity-50" style={{ background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
            {dict.orders.actions.process}
          </button>
        ) : null}
        {canCancel && (
          <button onClick={() => setCancelOpen(true)} disabled={actionLoading} className="rounded-md px-4 py-3 disabled:opacity-50" style={{ border: "1px solid var(--error)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}>
            <XCircle size={16} />
          </button>
        )}
      </div>

      <ShipModal open={shipOpen} dict={dict} loading={shipMutation.isPending} onSubmit={handleShip} onCancel={() => setShipOpen(false)} />
      <ConfirmModal open={cancelOpen} title="Cancel Order?" message="This will cancel the order and restock items. The customer will be notified." confirmLabel="Cancel Order" destructive loading={cancelMutation.isPending} onConfirm={handleCancel} onCancel={() => setCancelOpen(false)} />
      <ConfirmModal open={refundOpen} title="Issue Refund?" message="This will refund the full order amount via Stripe and mark the order as cancelled. Items will be restocked." confirmLabel="Refund" destructive loading={refundMutation.isPending} onConfirm={handleRefund} onCancel={() => setRefundOpen(false)} />
    </div>
  );
}
