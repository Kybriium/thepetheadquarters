"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, MapPin, Lock, Shield, Package, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type enAuth from "@/i18n/dictionaries/en/auth.json";

interface AccountSidebarProps {
  dict: typeof enAuth;
}

const navItems = [
  { key: "profile" as const, href: "/account", icon: User },
  { key: "addresses" as const, href: "/account/addresses", icon: MapPin },
  { key: "password" as const, href: "/account/password", icon: Lock },
  { key: "security" as const, href: "/account/security", icon: Shield },
  { key: "orders" as const, href: "/account/orders", icon: Package },
];

export function AccountSidebar({ dict }: AccountSidebarProps) {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <nav className="flex flex-col gap-1">
      {user && (
        <div style={{ marginBottom: "var(--space-6)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--bg-border)" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", fontWeight: "var(--weight-medium)", color: "var(--white)" }}>
            {user.first_name} {user.last_name}
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
            {user.email}
          </p>
        </div>
      )}

      {navItems.map((item) => {
        const isActive =
          item.href === "/account"
            ? pathname.endsWith("/account")
            : pathname.includes(item.href);

        return (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-4 py-2.5 transition-all duration-200"
            style={{
              background: isActive ? "rgba(187,148,41,0.1)" : "transparent",
              color: isActive ? "var(--gold-dark)" : "var(--white-dim)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: isActive ? "var(--weight-medium)" : "var(--weight-regular)",
            }}
          >
            <item.icon size={16} />
            {dict.account[item.key]}
          </Link>
        );
      })}

      <button
        onClick={() => logout()}
        className="mt-4 flex items-center gap-3 rounded-md px-4 py-2.5 transition-all duration-200 hover:bg-[rgba(198,40,40,0.08)]"
        style={{
          color: "var(--white-faint)",
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          borderTop: "1px solid var(--bg-border)",
          paddingTop: "var(--space-4)",
          marginTop: "var(--space-4)",
        }}
      >
        <LogOut size={16} />
        {dict.account.logout}
      </button>
    </nav>
  );
}
