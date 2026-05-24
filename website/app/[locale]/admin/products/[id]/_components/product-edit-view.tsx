"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useAdminProduct,
  useDeleteProduct,
  useUpdateProduct,
} from "@/hooks/use-admin-products";
import { useAdminBrands, useAdminCategories } from "@/hooks/use-admin-catalog";
import { ConfirmModal } from "../../../_components/confirm-modal";
import { ProductInfoForm } from "./product-info-form";
import { VariantsManager } from "./variants-manager";
import { ImagesManager } from "./images-manager";
import { CustomizationsManager } from "./customizations-manager";
import { SuppliersManager } from "./suppliers-manager";
import { SizeFitManager } from "./size-fit-manager";

interface ProductEditViewProps {
  productId: string;
}

type Tab = "info" | "variants" | "images" | "customizations" | "suppliers" | "size & fit";

export function ProductEditView({ productId }: ProductEditViewProps) {
  const { data: product, isLoading } = useAdminProduct(productId);
  const { data: brands = [] } = useAdminBrands();
  const { data: categories = [] } = useAdminCategories();
  const updateMutation = useUpdateProduct(productId);
  const deleteMutation = useDeleteProduct();

  const [tab, setTab] = useState<Tab>("info");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(productId);
      toast.success("Product deactivated");
      window.location.href = "/admin/products";
    } catch {
      toast.danger("Failed to delete");
    } finally {
      setConfirmDelete(false);
    }
  }

  // Reactivate is just a PATCH `is_active: true`. We don't navigate
  // away after — the admin is mid-edit, so keep them on the page and
  // let React Query refresh the badge.
  async function handleReactivate() {
    try {
      await updateMutation.mutateAsync({ is_active: true });
      toast.success("Product reactivated");
    } catch {
      toast.danger("Failed to reactivate");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-lg py-16 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>Product not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/products" className="inline-flex w-fit items-center gap-2 transition-colors duration-200 hover:text-[var(--gold)]" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-regular)", color: "var(--white)" }}>
            {product.name}
          </h1>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
            {product.slug} {!product.is_active && <span style={{ color: "var(--error)" }}>· Inactive</span>}
          </p>
        </div>
        {/* Toggle: when the product is inactive, surface a clear
            green "Activate" affordance — currently the only way back
            was through Django admin or DB. */}
        {product.is_active ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={updateMutation.isPending}
            className="rounded-md px-4 py-2.5 disabled:opacity-50"
            style={{
              border: "1px solid var(--error)",
              color: "var(--error)",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
            }}
          >
            Deactivate
          </button>
        ) : (
          <button
            onClick={handleReactivate}
            disabled={updateMutation.isPending}
            className="rounded-md px-4 py-2.5 disabled:opacity-50"
            style={{
              background: "var(--success)",
              color: "#FFFFFF",
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
            }}
          >
            {updateMutation.isPending ? "Reactivating…" : "Reactivate"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--bg-border)" }}>
        {(["info", "variants", "images", "customizations", "suppliers", "size & fit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-sm)",
              fontWeight: tab === t ? "var(--weight-semibold)" : "var(--weight-regular)",
              color: tab === t ? "var(--gold-dark)" : "var(--white-faint)",
              borderBottom: tab === t ? "2px solid var(--gold)" : "2px solid transparent",
              marginBottom: "-1px",
              textTransform: "capitalize",
            }}
          >
            {t}
            {t === "variants" && ` (${product.variants.length})`}
            {t === "images" && ` (${product.images.length})`}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <ProductInfoForm
          product={product}
          brands={brands}
          categories={categories}
          onSave={async (data) => {
            try {
              await updateMutation.mutateAsync(data);
              toast.success("Saved");
            } catch {
              toast.danger("Save failed");
            }
          }}
          saving={updateMutation.isPending}
        />
      )}
      {tab === "variants" && <VariantsManager productId={productId} variants={product.variants} product={product} />}
      {tab === "images" && <ImagesManager productId={productId} images={product.images} variants={product.variants} />}
      {tab === "customizations" && <CustomizationsManager productId={productId} />}
      {tab === "suppliers" && (
        <SuppliersManager
          variants={product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            // option_label is best-effort — admin variant payload may
            // expose option_values as a list of strings; join them so
            // the section header reads e.g. "Size: M / Colour: Red".
            option_label: Array.isArray(v.option_values)
              ? v.option_values
                  .map((ov) =>
                    typeof ov === "string" ? ov : (ov as { value?: string }).value || "",
                  )
                  .filter(Boolean)
                  .join(" / ")
              : "",
          }))}
        />
      )}
      {tab === "size & fit" && (
        <SizeFitManager productId={productId} product={product} />
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Deactivate Product?"
        message="The product will be hidden from the storefront. You can reactivate it later via the API."
        confirmLabel="Deactivate"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
