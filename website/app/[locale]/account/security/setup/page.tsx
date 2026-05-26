import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { ProtectedRoute } from "../../_components/protected-route";
import { MfaSetupWizard } from "../../_components/mfa-setup-wizard";

export default async function MfaSetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale as Locale, "auth");

  return (
    <ProtectedRoute>
      <section className="py-12 md:py-16" style={{ background: "var(--bg-primary)" }}>
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <MfaSetupWizard dict={dict} />
        </div>
      </section>
    </ProtectedRoute>
  );
}
