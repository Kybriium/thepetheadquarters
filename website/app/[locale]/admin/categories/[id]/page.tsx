"use client";

/**
 * Admin Category edit page.
 *
 * Focused on the "How to measure" guide because that's the missing
 * piece — name/description/parent already have an inline form on the
 * categories list page, but the measure-guide fields don't fit cleanly
 * there. This page is also where the size-fit-manager (on the product
 * edit page) deep-links to when the admin clicks "Edit the … measure
 * guide".
 *
 * One category guide powers every product in that category on the
 * storefront PDP, so editing here cascades.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@heroui/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import {
  adminCategoryKeys,
  type AdminCategory,
} from "@/hooks/use-admin-catalog";

export default function AdminCategoryEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const { data: category, isLoading } = useQuery({
    queryKey: ["admin", "category", id, "detail"],
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminCategory }>(
        endpoints.admin.categories.detail(id),
      );
      return res.data;
    },
  });

  // Local form state — populated once category loads, edited freely.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [guideText, setGuideText] = useState("");
  const [guideImageUrl, setGuideImageUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!category || hydrated) return;
    setName(category.name);
    setDescription(category.description);
    setImage((category as AdminCategory & { image?: string }).image ?? "");
    setGuideText(category.measure_guide_text ?? "");
    setGuideImageUrl(category.measure_guide_image_url ?? "");
    setHydrated(true);
  }, [category, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiClient.patch(endpoints.admin.categories.detail(id), {
        name,
        description,
        image,
        measure_guide_text: guideText,
        measure_guide_image_url: guideImageUrl,
      });
    },
    onSuccess: () => {
      toast.success("Category saved");
      qc.invalidateQueries({ queryKey: ["admin", "category", id, "detail"] });
      qc.invalidateQueries({ queryKey: adminCategoryKeys.all });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Save failed";
      toast.danger(msg);
    },
  });

  if (isLoading || !category) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="h-6 w-6 animate-spin rounded-full"
          style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/categories"
        className="inline-flex w-fit items-center gap-2 transition-colors hover:text-[var(--gold)]"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-xs)",
          color: "var(--white-faint)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
        }}
      >
        <ArrowLeft size={14} />
        Back to categories
      </Link>

      <h1
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-3xl)",
          fontWeight: "var(--weight-regular)",
          color: "var(--white)",
        }}
      >
        {category.name}
      </h1>

      {/* Basics */}
      <Section title="Basics">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>
        <Field label="Hero image URL (used on the storefront category page)">
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…"
            style={inputStyle}
          />
        </Field>
      </Section>

      {/* Measure guide */}
      <Section
        title="How to measure (inherited by every product in this category)"
        intro={
          "Shown above the size table on the PDP for every product whose first category is this one. " +
          "Use one tip per line — the frontend renders each line as a separate bullet."
        }
      >
        <Field label="Tips (one per line)">
          <textarea
            value={guideText}
            onChange={(e) => setGuideText(e.target.value)}
            rows={6}
            placeholder={
              "Neck — wrap a soft tape around the base of the neck. Two fingers should slip under.\n" +
              "Chest — measure the widest part of the rib cage just behind the front legs.\n" +
              "Weight — round up if your pet is between sizes."
            }
            style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-montserrat)" }}
          />
        </Field>
        <Field label="Diagram image URL (optional)">
          <input
            value={guideImageUrl}
            onChange={(e) => setGuideImageUrl(e.target.value)}
            placeholder="https://… (e.g. labelled measuring diagram)"
            style={inputStyle}
          />
        </Field>

        {/* Live-ish preview */}
        {(guideText || guideImageUrl) && (
          <div
            className="mt-4 rounded-md p-3"
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}
          >
            <p
              className="mb-2"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--white-faint)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              Preview
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {guideImageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={guideImageUrl}
                  alt="Measure guide"
                  style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 4 }}
                />
              )}
              <div className="flex-1">
                {guideText.split("\n").filter(Boolean).map((line, i) => (
                  <p
                    key={i}
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      fontSize: 12,
                      color: "var(--white-dim)",
                      lineHeight: 1.5,
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Save */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => router.back()}
          disabled={saveMutation.isPending}
          className="rounded-md px-4 py-2 disabled:opacity-40"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--white-dim)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="rounded-md px-4 py-2 disabled:opacity-40"
          style={{
            background: "var(--gold)",
            color: "#0F0F12",
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local building blocks
// ---------------------------------------------------------------------------

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--bg-border)",
        padding: "var(--space-5)",
      }}
    >
      <h2
        className="mb-2"
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "var(--text-lg)",
          fontWeight: "var(--weight-medium)",
          color: "var(--white)",
        }}
      >
        {title}
      </h2>
      {intro && (
        <p
          className="mb-4"
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: 12,
            color: "var(--white-faint)",
            lineHeight: 1.5,
          }}
        >
          {intro}
        </p>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: 11,
          color: "var(--white-faint)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: 13,
  borderRadius: 4,
  padding: "8px 10px",
  width: "100%",
};
