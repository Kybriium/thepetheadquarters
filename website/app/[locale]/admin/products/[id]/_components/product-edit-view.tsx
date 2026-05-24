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

interface ProductEditViewProps {
  productId: string;
}

type Tab = "info" | "variants" | "images" | "customizations";

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
        <button onClick={() => setConfirmDelete(true)} className="rounded-md px-4 py-2.5" style={{ border: "1px solid var(--error)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}>
          Deactivate
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--bg-border)" }}>
        {(["info", "variants", "images", "customizations"] as const).map((t) => (
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
