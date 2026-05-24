"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import { PrintReceiptButton, Receipt } from "@/components/orders/receipt";
import type { Order } from "@/types/order";

interface OrderDetailProps {
  orderNumber: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(230,81,0,0.1)", color: "var(--warning)" },
  paid: { bg: "rgba(187,148,41,0.12)", color: "var(--gold-dark)" },
  processing: { bg: "rgba(187,148,41,0.12)", color: "var(--gold-dark)" },
  shipped: { bg: "rgba(21,101,192,0.1)", color: "var(--info)" },
  delivered: { bg: "rgba(46,125,50,0.1)", color: "var(--success)" },
  cancelled: { bg: "rgba(198,40,40,0.08)", color: "var(--error)" },
};

export function OrderDetail({ orderNumber }: OrderDetailProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ status: string; data: Order }>(endpoints.orders.detail(orderNumber))
      .then((res) => setOrder(res.data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderNumber]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
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
        <Link
          href="/account/orders"
          className="mt-6 inline-block transition-colors duration-200 hover:text-[var(--gold)]"
          style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)", fontWeight: "var(--weight-medium)" }}
        >
          ← Back to orders
        </Link>
      </div>
    );
  }

  const colors = STATUS_COLORS[order.status] || STATUS_COLORS.pending;

  return (
    <div className="flex flex-col gap-6">
      <div className="print-hide flex items-center justify-between gap-4">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 transition-colors duration-200 hover:text-[var(--gold)]"
          style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}
        >
          <ArrowLeft size={14} />
          Back to orders
        </Link>
        {/* Status badge — surfaces shipped/delivered/cancelled states which
            the receipt header only renders as "Paid". */}
        <span
          className="rounded-full px-3 py-1"
          style={{
            background: colors.bg,
            color: colors.color,
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-semibold)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          {order.status}
        </span>
      </div>

      <Receipt order={order} />

      <div className="print-hide flex justify-center">
        <PrintReceiptButton />
      </div>
    </div>
  );
}
