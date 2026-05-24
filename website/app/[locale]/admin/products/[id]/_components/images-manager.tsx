"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Upload, Link2, Star } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useAddImage,
  useDeleteImage,
  useUpdateImage,
  type AdminProductImage,
  type AdminVariant,
} from "@/hooks/use-admin-products";
import { endpoints } from "@/config/endpoints";
import { ConfirmModal } from "../../../_components/confirm-modal";

interface ImagesManagerProps {
  productId: string;
  images: AdminProductImage[];
  /** Optional — when provided, each image gets a "Belongs to variant" picker. */
  variants?: AdminVariant[];
}

function variantLabel(v: AdminVariant): string {
  const opts = v.option_values?.map((ov) => ov.label).join(" / ");
  return opts ? `${opts} (${v.sku})` : v.sku;
}

const API_HOST = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(
  /\/api\/v1\/?$/,
  "",
);

/**
 * Convert relative /media/... URLs from the local-storage backend into
 * absolute URLs so Next.js Image can fetch them.
 */
function resolveImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/media/")) return `${API_HOST}${url}`;
  return url;
}

type Mode = "upload" | "url";

export function ImagesManager({ productId, images, variants = [] }: ImagesManagerProps) {
  const addMutation = useAddImage(productId);
  const deleteMutation = useDeleteImage(productId);
  const updateMutation = useUpdateImage(productId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSetPrimary(imageId: string) {
    try {
      await updateMutation.mutateAsync({ imageId, data: { is_primary: true } });
      toast.success("Primary image updated");
    } catch {
      toast.danger("Failed to update");
    }
  }

  async function handleSetVariant(imageId: string, variantId: string | null) {
    try {
      await updateMutation.mutateAsync({ imageId, data: { variant_id: variantId } });
      toast.success(variantId ? "Linked to variant" : "Unlinked");
    } catch {
      toast.danger("Failed");
    }
  }

  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<Mode>("upload");
  const [url, setUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [variantId, setVariantId] = useState<string>(""); // "" means none
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<AdminProductImage | null>(null);

  function reset() {
    setUrl("");
    setAltText("");
    setIsPrimary(false);
    setVariantId("");
    setShowForm(false);
    setMode("upload");
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      // Read CSRF token (not strictly needed since admin endpoints are exempt,
      // but harmless and consistent with rest of api-client)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "products");

      const res = await fetch(endpoints.admin.upload.image, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.danger(err.code || "Upload failed");
        return;
      }

      const data = await res.json();
      const uploadedUrl = data.data?.url;

      if (!uploadedUrl) {
        toast.danger("No URL in response");
        return;
      }

      // Now create the image record
      await addMutation.mutateAsync({
        url: uploadedUrl,
        alt_text: altText,
        is_primary: isPrimary,
        sort_order: images.length,
        variant_id: variantId || null,
      });

      toast.success("Image uploaded");
      reset();
    } catch {
      toast.danger("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddByUrl() {
    if (!url.trim()) {
      toast.danger("URL required");
      return;
    }
    try {
      await addMutation.mutateAsync({
        url,
        alt_text: altText,
        is_primary: isPrimary,
        sort_order: images.length,
        variant_id: variantId || null,
      });
      toast.success("Image added");
      reset();
    } catch {
      toast.danger("Failed to add image");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Image removed");
    } catch {
      toast.danger("Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  const labelStyle = { fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" as const, color: "var(--white-dim)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" as const, display: "block" as const, marginBottom: "var(--space-2)" };
  const inputStyle = { background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", width: "100%" };
  const hintStyle = { fontFamily: "var(--font-montserrat)", fontSize: "11px" as const, color: "var(--white-faint)", marginTop: "var(--space-1)", lineHeight: "var(--leading-relaxed)" as const };

  const busy = uploading || addMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      {images.length === 0 ? (
        <p className="rounded-lg py-12 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
          No images yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="rounded-lg" style={{ background: "var(--bg-secondary)", border: `1px solid ${img.is_primary ? "var(--gold)" : "var(--bg-border)"}`, padding: "var(--space-3)" }}>
              <div className="relative aspect-square overflow-hidden rounded-md" style={{ background: "var(--bg-tertiary)" }}>
                <Image src={resolveImageUrl(img.url)} alt={img.alt_text || ""} fill sizes="200px" className="object-cover" unoptimized={img.url.startsWith("/media/")} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                {img.is_primary ? (
                  <span className="flex items-center gap-1" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--gold-dark)", fontWeight: 600 }}>
                    <Star size={11} fill="var(--gold-dark)" /> Primary
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetPrimary(img.id)}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-1 transition-colors duration-200 hover:text-[var(--gold-dark)] disabled:opacity-50"
                    style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}
                    title="Set as primary"
                  >
                    <Star size={11} /> Set primary
                  </button>
                )}
                <button onClick={() => setDeleting(img)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[rgba(198,40,40,0.1)]" style={{ color: "var(--white-faint)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
              {variants.length > 0 && (
                <div className="mt-2">
                  <label style={{ fontFamily: "var(--font-montserrat)", fontSize: 9, color: "var(--white-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", display: "block", marginBottom: 4 }}>
                    Variant
                  </label>
                  <select
                    value={img.variant || ""}
                    onChange={(e) => handleSetVariant(img.id, e.target.value || null)}
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: 11, borderRadius: "var(--radius-sm)", padding: "4px 6px", width: "100%" }}
                  >
                    <option value="">All variants</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {variantLabel(v)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="flex w-fit items-center gap-2 rounded-md px-4 py-2.5" style={{ border: "1px solid var(--bg-border)", color: "var(--gold-dark)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>
          <Plus size={14} />
          Add Image
        </button>
      )}

      {showForm && (
        <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-6)" }}>
          <h3 className="mb-4" style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>Add Image</h3>

          {/* Mode toggle */}
          <div className="mb-5 flex gap-1 rounded-md p-1" style={{ background: "var(--bg-tertiary)", width: "fit-content" }}>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className="flex items-center gap-2 rounded-md px-4 py-2"
              style={{
                background: mode === "upload" ? "var(--bg-secondary)" : "transparent",
                color: mode === "upload" ? "var(--gold-dark)" : "var(--white-faint)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: mode === "upload" ? "var(--weight-semibold)" : "var(--weight-regular)",
              }}
            >
              <Upload size={14} /> Upload file
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className="flex items-center gap-2 rounded-md px-4 py-2"
              style={{
                background: mode === "url" ? "var(--bg-secondary)" : "transparent",
                color: mode === "url" ? "var(--gold-dark)" : "var(--white-faint)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: mode === "url" ? "var(--weight-semibold)" : "var(--weight-regular)",
              }}
            >
              <Link2 size={14} /> Paste URL
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label style={labelStyle}>Alt text</label>
              <input value={altText} onChange={(e) => setAltText(e.target.value)} style={inputStyle} placeholder="Describe the image (for accessibility)" />
              <p style={hintStyle}>Used for screen readers and shown if the image fails to load</p>
            </div>

            <label className="flex items-center gap-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
              <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} style={{ accentColor: "var(--gold)" }} />
              Primary image
            </label>

            {variants.length > 0 && (
              <div>
                <label style={labelStyle}>Belongs to variant (optional)</label>
                <select value={variantId} onChange={(e) => setVariantId(e.target.value)} style={inputStyle}>
                  <option value="">— Shown for all variants —</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {variantLabel(v)}
                    </option>
                  ))}
                </select>
                <p style={hintStyle}>When a customer selects this variant, the gallery will switch to images tagged with it.</p>
              </div>
            )}

            {mode === "upload" ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-md py-8 transition-colors duration-200 disabled:opacity-50"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "2px dashed var(--bg-border)",
                    color: "var(--white-faint)",
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  <Upload size={18} />
                  {busy ? "Uploading..." : "Click to choose an image"}
                </button>
                <p style={hintStyle}>JPEG, PNG, WebP or GIF · max 8 MB · 4000×4000 px</p>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Image URL *</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
                <p style={hintStyle}>Paste a public image URL (Cloudinary, Unsplash, etc.)</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            {mode === "url" && (
              <button onClick={handleAddByUrl} disabled={busy} className="rounded-md px-5 py-2.5 disabled:opacity-50" style={{ background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                {busy ? "..." : "Add"}
              </button>
            )}
            <button onClick={reset} className="rounded-md px-5 py-2.5" style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}>Cancel</button>
          </div>
        </div>
      )}

      <ConfirmModal open={!!deleting} title="Remove Image?" message="This permanently deletes the image record." confirmLabel="Remove" destructive loading={deleteMutation.isPending} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}
