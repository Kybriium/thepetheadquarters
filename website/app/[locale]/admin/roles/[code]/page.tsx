import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { RoleEditor } from "../_components/role-editor";

export default async function AdminRoleEditorPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
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
        {code === "new" ? "New role" : "Edit role"}
      </h1>
      <RoleEditor code={code} />
    </div>
  );
}
