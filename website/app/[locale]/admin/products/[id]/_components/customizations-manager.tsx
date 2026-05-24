"use client";

import Link from "next/link";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useAdminCustomizationTemplates,
  useAttachTemplateToProduct,
  useDetachTemplateFromProduct,
  useProductCustomizations,
} from "@/hooks/use-admin-customizations";

interface CustomizationsManagerProps {
  productId: string;
}

export function CustomizationsManager({ productId }: CustomizationsManagerProps) {
  const { data: productCx, isLoading } = useProductCustomizations(productId);
  const { data: allTemplates = [] } = useAdminCustomizationTemplates();
  const attachMutation = useAttachTemplateToProduct();
  const detachMutation = useDetachTemplateFromProduct();

  if (isLoading || !productCx) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
      </div>
    );
  }

  const attachedIds = new Set(productCx.templates.map((t) => t.template.id));
  const availableTemplates = allTemplates.filter(
    (t) => t.is_active && !attachedIds.has(t.id),
  );

  async function attach(templateId: string) {
    try {
      await attachMutation.mutateAsync({ productId, templateId });
      toast.success("Template attached");
    } catch {
      toast.danger("Already attached or error");
    }
  }

  async function detach(linkId: string) {
    if (!confirm("Remove this customization template from the product?")) return;
    try {
      await detachMutation.mutateAsync({ productId, linkId });
      toast.success("Removed");
    } catch {
      toast.danger("Failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
          Active customizations
        </h2>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", marginTop: "var(--space-1)" }}>
          Customers will fill these in on the product page. Reorder / detach as needed. Manage the templates themselves in{" "}
          <Link href="/admin/customizations" className="underline" style={{ color: "var(--gold-dark)" }}>
            Customizations
          </Link>
          .
        </p>
      </div>

      {productCx.templates.length === 0 ? (
        <p
          className="rounded-md py-6 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}
        >
          No customization templates attached. Pick one below.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {productCx.templates.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-lg p-4"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
                    {link.template.name}
                  </p>
                  <Link
                    href="/admin/customizations"
                    title="Edit template"
                    style={{ color: "var(--white-faint)" }}
                  >
                    <ExternalLink size={12} />
                  </Link>
                </div>
                <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "11px", color: "var(--white-faint)" }}>
                  {link.template.fields.length} fields ·{" "}
                  {link.template.fields.map((f) => f.label).join(", ")}
                </p>
              </div>
              <button
                onClick={() => detach(link.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ color: "var(--error)" }}
                title="Detach"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attach picker */}
      <div className="rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <h3 style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", marginBottom: "var(--space-3)" }}>
          Attach a template
        </h3>
        {availableTemplates.length === 0 ? (
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
            No more templates to attach.{" "}
            <Link href="/admin/customizations" className="underline" style={{ color: "var(--gold-dark)" }}>
              Create a new one
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {availableTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => attach(t.id)}
                disabled={attachMutation.isPending}
                className="flex items-center justify-between rounded-md px-3 py-2.5 text-left disabled:opacity-50"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}
              >
                <div>
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
                    {t.name}
                  </p>
                  <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "11px", color: "var(--white-faint)" }}>
                    {t.fields.length} fields
                  </p>
                </div>
                <span className="flex items-center gap-1" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)" }}>
                  <Plus size={12} /> Attach
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
