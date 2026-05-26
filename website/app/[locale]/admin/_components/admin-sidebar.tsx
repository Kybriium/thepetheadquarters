"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Warehouse,
  Users,
  Truck,
  ClipboardList,
  Tag,
  FolderTree,
  BarChart3,
  Shield,
  Mail,
  Sparkles,
  Star,
  Activity,
  Wand2,
  Plug,
  ArrowLeft,
  Menu,
  X,
  Receipt,
  UserCog,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type enAdmin from "@/i18n/dictionaries/en/admin.json";

interface AdminSidebarProps {
  dict: typeof enAdmin;
}

// Each nav item declares the permission codes that should make it
// visible. The user sees an item if they hold at least one of the
// listed codes. Dashboard has no perm gate — every admin gets it.
const navItems = [
  { key: "dashboard" as const, href: "/admin", icon: LayoutDashboard, exact: true, perms: [] },
  { key: "orders" as const, href: "/admin/orders", icon: Package, perms: ["orders.view"] },
  { key: "products" as const, href: "/admin/products", icon: Boxes, perms: ["products.view"] },
  { key: "inventory" as const, href: "/admin/inventory", icon: Warehouse, perms: ["inventory.view"] },
  { key: "customers" as const, href: "/admin/customers", icon: Users, perms: ["customers.view"] },
  { key: "suppliers" as const, href: "/admin/suppliers", icon: Truck, perms: ["suppliers.view"] },
  { key: "purchaseOrders" as const, href: "/admin/purchase-orders", icon: ClipboardList, perms: ["purchase_orders.view"] },
  { key: "brands" as const, href: "/admin/brands", icon: Tag, perms: ["catalog.view"] },
  { key: "categories" as const, href: "/admin/categories", icon: FolderTree, perms: ["catalog.view"] },
  { key: "promotions" as const, href: "/admin/promotions", icon: Sparkles, perms: ["promotions.view"] },
  { key: "customizations" as const, href: "/admin/customizations", icon: Wand2, perms: ["products.view"] },
  { key: "optionTypes" as const, href: "/admin/option-types", icon: Tag, perms: ["products.view"] },
  { key: "integrations" as const, href: "/admin/integrations", icon: Plug, perms: ["integrations.view"] },
  { key: "reviews" as const, href: "/admin/reviews", icon: Star, perms: ["reviews.view"] },
  { key: "contactMessages" as const, href: "/admin/contact-messages", icon: Mail, perms: ["contact.view"] },
  { key: "analytics" as const, href: "/admin/analytics", icon: Activity, perms: ["analytics.view"] },
  { key: "finances" as const, href: "/admin/finances", icon: Receipt, perms: ["finances.view", "expenses.view"] },
  { key: "reports" as const, href: "/admin/reports", icon: BarChart3, perms: ["reports.view"] },
  { key: "audit" as const, href: "/admin/audit", icon: Shield, perms: ["audit.view"] },
  { key: "team" as const, href: "/admin/team", icon: UserCog, perms: ["team.view"] },
  { key: "roles" as const, href: "/admin/roles", icon: Shield, perms: ["team.view"] },
];

export function AdminSidebar({ dict }: AdminSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function isActive(item: (typeof navItems)[number]) {
    if (item.exact) {
      return pathname.endsWith("/admin") || pathname.endsWith("/admin/");
    }
    return pathname.includes(item.href);
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      {user && (
        <div
          style={{
            marginBottom: "var(--space-6)",
            paddingBottom: "var(--space-4)",
            borderBottom: "1px solid var(--bg-border)",
          }}
        >
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
            {user.first_name} {user.last_name}
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
            Admin
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1">
        {navItems
          .filter((item) => {
            // No permissions declared → show to every admin (dashboard).
            if (item.perms.length === 0) return true;
            const userPerms = user?.permissions ?? [];
            return item.perms.some((p) => userPerms.includes(p));
          })
          .map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-4 py-2.5 transition-all duration-200"
                style={{
                  background: active ? "rgba(187,148,41,0.1)" : "transparent",
                  color: active ? "var(--gold-dark)" : "var(--white-dim)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-sm)",
                  fontWeight: active ? "var(--weight-medium)" : "var(--weight-regular)",
                }}
              >
                <item.icon size={16} />
                {dict.sidebar[item.key]}
              </Link>
            );
          })}
      </div>

      <Link
        href="/"
        className="mt-4 flex items-center gap-3 rounded-md px-4 py-2.5 transition-all duration-200 hover:bg-[rgba(187,148,41,0.08)]"
        style={{
          color: "var(--white-faint)",
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          borderTop: "1px solid var(--bg-border)",
          paddingTop: "var(--space-4)",
          marginTop: "var(--space-4)",
        }}
      >
        <ArrowLeft size={14} />
        {dict.sidebar.backToStore}
      </Link>
    </nav>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-20 z-40 flex h-10 w-10 items-center justify-center rounded-md md:hidden"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--bg-border)",
          color: "var(--white-dim)",
        }}
      >
        <Menu size={18} />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 z-50 h-full w-72 overflow-y-auto md:hidden"
            style={{
              background: "var(--bg-primary)",
              borderRight: "1px solid var(--bg-border)",
              padding: "var(--space-6) var(--space-5)",
            }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full"
              style={{ color: "var(--white-faint)" }}
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </>
      )}
    </>
  );
}
