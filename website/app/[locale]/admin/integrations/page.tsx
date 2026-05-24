"use client";

import Link from "next/link";
import { ChevronRight, Check } from "lucide-react";
import { useTelegramConfig } from "@/hooks/use-admin-integrations";

export default function AdminIntegrationsPage() {
  const { data: telegram } = useTelegramConfig();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-regular)", color: "var(--white)" }}>
          Integrations
        </h1>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", marginTop: "var(--space-1)" }}>
          Connect outbound channels so you get pinged whenever something happens in the shop.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          href="/admin/integrations/telegram"
          name="Telegram"
          description="Receive new orders, contact messages, reviews and low-stock alerts in any chat or group."
          status={
            telegram?.configured
              ? telegram.is_enabled
                ? "Connected"
                : "Disabled"
              : "Not connected"
          }
          isConnected={!!telegram?.configured && telegram.is_enabled}
        />
        {/* Future: Slack, Discord, Email digest. The integrations app is
            designed so those drop in here as new cards with no schema changes. */}
      </div>
    </div>
  );
}

function IntegrationCard({
  href,
  name,
  description,
  status,
  isConnected,
}: {
  href: string;
  name: string;
  description: string;
  status: string;
  isConnected: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-4 rounded-lg p-5 transition-all duration-200 hover:border-[var(--gold)]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
            {name}
          </h3>
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: isConnected ? "rgba(76,175,80,0.12)" : "var(--bg-tertiary)",
              color: isConnected ? "var(--success)" : "var(--white-faint)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            {isConnected && <Check size={10} />}
            {status}
          </span>
        </div>
        <p className="mt-1" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
          {description}
        </p>
      </div>
      <ChevronRight size={18} style={{ color: "var(--white-faint)" }} />
    </Link>
  );
}
