import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { RolesListView } from "./_components/roles-list-view";

export default async function AdminRolesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-3xl)",
          fontWeight: "var(--weight-regular)",
          color: "var(--white)",
          marginBottom: "var(--space-6)",
        }}
      >
        Roles & permissions
      </h1>
      <RolesListView />
    </div>
  );
}
