"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Clock, AlertTriangle, Truck, TrendingUp, Mail, Star, Activity, Wallet, Receipt } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import { adminOrderKeys } from "@/hooks/use-admin-orders";
import type { AdminDashboard } from "@/types/admin";
import type enAdmin from "@/i18n/dictionaries/en/admin.json";

interface DashboardContentProps {
  dict: typeof enAdmin;
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(230,81,0,0.1)", color: "var(--warning)" },
  paid: { bg: "rgba(187,148,41,0.12)", color: "var(--gold-dark)" },
  processing: { bg: "rgba(187,148,41,0.12)", color: "var(--gold-dark)" },
  shipped: { bg: "rgba(21,101,192,0.1)", color: "var(--info)" },
  delivered: { bg: "rgba(46,125,50,0.1)", color: "var(--success)" },
  cancelled: { bg: "rgba(198,40,40,0.08)", color: "var(--error)" },
};

export function DashboardContent({ dict }: DashboardContentProps) {
  const { data, isLoading: loading } = useQuery({
    queryKey: adminOrderKeys.dashboard,
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminDashboard }>(
        endpoints.admin.dashboard,
      );
      return res.data;
    },
    staleTime: 30 * 1000,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
        Failed to load dashboard.
      </p>
    );
  }

  const stats = [
    {
      key: "today_orders",
      label: dict.dashboard.todayOrders,
      value: String(data.today.orders_count),
      icon: Package,
    },
    {
      key: "today_revenue",
      label: dict.dashboard.todayRevenue,
      value: formatPrice(data.today.revenue_pence),
      icon: TrendingUp,
    },
    {
      key: "today_expenses",
      label: "Today's Expenses",
      value: formatPrice(data.today.expenses_pence),
      icon: Receipt,
    },
    {
      key: "today_net",
      // The actual take-home for today after Stripe fees + dropship
      // COGS + any manual expenses. Highlighted as the headline number
      // so the admin sees real profit, not vanity revenue.
      label: "Today's Net",
      value: formatPrice(data.today.net_pence),
      icon: Wallet,
      highlight: true,
      warning: data.today.net_pence < 0,
    },
    {
      key: "pending",
      label: dict.dashboard.pending,
      value: String(data.today.pending_count),
      icon: Clock,
    },
    {
      key: "low_stock",
      label: dict.dashboard.lowStock,
      value: String(data.low_stock_count),
      icon: AlertTriangle,
      warning: data.low_stock_count > 0,
    },
    {
      key: "dropship",
      label: dict.dashboard.dropshipPending,
      value: String(data.dropship_pending_count),
      icon: Truck,
      warning: data.dropship_pending_count > 0,
    },
    {
      key: "messages",
      label: "Unread Messages",
      value: String(data.unread_messages_count),
      icon: Mail,
      warning: data.unread_messages_count > 0,
    },
    {
      key: "reviews",
      label: "Reviews to Reply",
      value: String(data.reviews_pending_reply_count),
      icon: Star,
      warning: data.reviews_pending_reply_count > 0,
    },
    {
      key: "visitors_today",
      label: "Visitors Today",
      value: String(data.visitors_today_count),
      icon: Activity,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => {
          // Three states for the card border / icon / number colour:
          //  - warning (orange) for things needing admin action OR a
          //    negative net day
          //  - highlight (gold) for the headline number (today's net)
          //  - neutral for everything else
          const borderColor = stat.warning
            ? "var(--warning)"
            : stat.highlight
              ? "rgba(187,148,41,0.4)"
              : "var(--bg-border)";
          const iconColor = stat.warning
            ? "var(--warning)"
            : stat.highlight
              ? "var(--gold)"
              : "var(--gold-dark)";
          const valueColor = stat.warning
            ? "var(--warning)"
            : stat.highlight
              ? "var(--gold)"
              : "var(--white)";
          return (
            <div
              key={stat.key}
              className="rounded-lg"
              style={{
                background: "var(--bg-secondary)",
                border: `1px solid ${borderColor}`,
                padding: "var(--space-5)",
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
                  {stat.label}
                </span>
                <stat.icon size={16} style={{ color: iconColor }} />
              </div>
              <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-regular)", color: valueColor }}>
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Recent orders */}
      <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
            {dict.dashboard.recentOrders}
          </h2>
          <Link
            href="/admin/orders"
            style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}
          >
            {dict.dashboard.viewAll} →
          </Link>
        </div>

        {data.recent_orders.length === 0 ? (
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
            {dict.dashboard.noOrders}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.recent_orders.map((order) => {
              const colors = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.order_number}`}
                  className="flex items-center justify-between rounded-md transition-colors duration-200 hover:bg-[rgba(187,148,41,0.05)]"
                  style={{ padding: "var(--space-3) var(--space-4)" }}
                >
                  <div className="flex flex-1 items-center gap-4">
                    <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--white)" }}>
                      {order.order_number}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5"
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
                      {dict.orders.statuses[order.status]}
                    </span>
                    <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                      {order.customer_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
                      {formatDate(order.created_at)}
                    </span>
                    <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--gold-dark)" }}>
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
