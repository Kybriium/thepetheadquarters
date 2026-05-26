import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { ProtectedRoute } from "../_components/protected-route";
import { AccountSidebar } from "../_components/account-sidebar";
import { SecurityView } from "../_components/security-view";

export default async function SecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale as Locale, "auth");
  const { reason } = await searchParams;

  return (
    <ProtectedRoute>
      <section className="py-12 md:py-16" style={{ background: "var(--bg-primary)" }}>
        <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:px-6 md:grid-cols-[240px_1fr]">
          <AccountSidebar dict={dict} />
          <SecurityView dict={dict} reason={reason ?? null} />
        </div>
      </section>
    </ProtectedRoute>
  );
}
