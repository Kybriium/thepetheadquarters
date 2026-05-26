import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { TeamView } from "./_components/team-view";

export default async function AdminTeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale as Locale, "admin");

  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-3xl)",
          fontWeight: "var(--weight-regular)",
          color: "var(--white)",
          marginBottom: "var(--space-2)",
        }}
      >
        {dict.sidebar.team}
      </h1>
      <p
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
          color: "var(--white-faint)",
          marginBottom: "var(--space-6)",
        }}
      >
        Assign roles to staff accounts. The active permissions for each role are
        defined in code at apps/accounts/rbac.py.
      </p>
      <TeamView />
    </div>
  );
}
