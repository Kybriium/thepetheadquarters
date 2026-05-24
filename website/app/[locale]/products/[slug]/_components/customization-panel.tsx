"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, Check } from "lucide-react";
import { toast } from "@heroui/react";
import { endpoints } from "@/config/endpoints";
import type {
  CustomizationAnswer,
  CustomizationAnswerValue,
  CustomizationField,
  CustomizationSummary,
} from "@/types/customization";

interface CustomizationPanelProps {
  fields: CustomizationField[];
  /**
   * Called whenever the customer changes a field. Parent uses this to
   * decide whether add-to-cart is enabled and what to send to the cart
   * store. `isValid` is true iff all required fields have non-empty values.
   */
  onChange: (state: {
    isValid: boolean;
    answers: CustomizationAnswer[];
    summary: CustomizationSummary[];
    surcharge: number;
  }) => void;
}

type FieldValueMap = Record<string, CustomizationAnswerValue | undefined>;

function fieldHasValue(
  field: CustomizationField,
  value: CustomizationAnswerValue | undefined,
): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  // image upload result
  return typeof value === "object" && typeof value.url === "string" && value.url.length > 0;
}

function summarize(
  fields: CustomizationField[],
  values: FieldValueMap,
): { answers: CustomizationAnswer[]; summary: CustomizationSummary[]; surcharge: number } {
  const answers: CustomizationAnswer[] = [];
  const summary: CustomizationSummary[] = [];
  let surcharge = 0;

  for (const field of fields) {
    const raw = values[field.key];
    if (!fieldHasValue(field, raw)) continue;

    answers.push({ key: field.key, value: raw! });

    let labelValue = "";
    let optionSurcharge = 0;
    let previewImage: string | undefined;

    if (field.field_type === "text" || field.field_type === "long_text") {
      labelValue = typeof raw === "string" ? raw.trim() : "";
    } else if (field.field_type === "image") {
      labelValue = "[uploaded image]";
    } else {
      // select | position — value is the option's `value`
      const opt = field.options.find((o) => o.value === raw);
      labelValue = opt?.label ?? String(raw);
      optionSurcharge = opt?.surcharge_pence ?? 0;
      previewImage = opt?.preview_image_url || undefined;
    }

    const fieldSurcharge = field.surcharge_pence + optionSurcharge;
    surcharge += fieldSurcharge;
    summary.push({
      key: field.key,
      label: field.label,
      field_type: field.field_type,
      value: raw!,
      label_value: labelValue,
      surcharge_pence: fieldSurcharge,
      preview_image_url: previewImage,
    });
  }

  return { answers, summary, surcharge };
}

export function CustomizationPanel({ fields, onChange }: CustomizationPanelProps) {
  const [values, setValues] = useState<FieldValueMap>({});

  function update(field: CustomizationField, next: CustomizationAnswerValue | undefined) {
    const newValues = { ...values, [field.key]: next };
    setValues(newValues);
    const { answers, summary, surcharge } = summarize(fields, newValues);
    const isValid = fields.every(
      (f) => !f.is_required || fieldHasValue(f, newValues[f.key]),
    );
    onChange({ isValid, answers, summary, surcharge });
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center justify-between">
        <h3
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-regular)",
            color: "var(--white)",
          }}
        >
          Personalize this item
        </h3>
        <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
          {fields.filter((f) => f.is_required).length > 0 ? "Required" : "Optional"}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(next) => update(field, next)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-type renderers — adding a new field_type means adding a new branch here
// + a matching server-side validator branch. The data model stays the same.
// ---------------------------------------------------------------------------

interface FieldRowProps {
  field: CustomizationField;
  value: CustomizationAnswerValue | undefined;
  onChange: (next: CustomizationAnswerValue | undefined) => void;
}

function FieldRow({ field, value, onChange }: FieldRowProps) {
  const labelStyle = {
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-xs)" as const,
    fontWeight: "var(--weight-medium)",
    color: "var(--white-dim)",
    letterSpacing: "var(--tracking-wide)" as const,
    textTransform: "uppercase" as const,
  };

  const surchargeSuffix =
    field.surcharge_pence > 0
      ? ` (+£${(field.surcharge_pence / 100).toFixed(2)})`
      : "";

  return (
    <div className="flex flex-col gap-2">
      <label style={labelStyle}>
        {field.label}
        {field.is_required && <span style={{ color: "var(--gold)" }}> *</span>}
        {surchargeSuffix && (
          <span style={{ color: "var(--gold-dark)", marginLeft: 4 }}>
            {surchargeSuffix}
          </span>
        )}
      </label>
      {field.help_text && (
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "11px", color: "var(--white-faint)", lineHeight: "var(--leading-relaxed)" }}>
          {field.help_text}
        </p>
      )}
      {renderInput(field, value, onChange)}
    </div>
  );
}

function renderInput(
  field: CustomizationField,
  value: CustomizationAnswerValue | undefined,
  onChange: (next: CustomizationAnswerValue | undefined) => void,
) {
  switch (field.field_type) {
    case "text":
      return <TextField field={field} value={typeof value === "string" ? value : ""} onChange={onChange} />;
    case "long_text":
      return <LongTextField field={field} value={typeof value === "string" ? value : ""} onChange={onChange} />;
    case "image":
      return <ImageField field={field} value={value} onChange={onChange} />;
    case "select":
      return <SelectField field={field} value={typeof value === "string" ? value : ""} onChange={onChange} />;
    case "position":
      return (
        <PositionField
          field={field}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
        />
      );
    default:
      return null;
  }
}

const baseInput = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-sm)" as const,
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3) var(--space-4)",
  width: "100%",
};

function TextField({ field, value, onChange }: { field: CustomizationField; value: string; onChange: (v: string) => void }) {
  const maxLength = typeof field.config.max_length === "number" ? field.config.max_length : 60;
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={field.help_text || `e.g. ${field.label}`}
        style={baseInput}
      />
      <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
        {value.length} / {maxLength}
      </span>
    </>
  );
}

function LongTextField({ field, value, onChange }: { field: CustomizationField; value: string; onChange: (v: string) => void }) {
  const maxLength = typeof field.config.max_length === "number" ? field.config.max_length : 500;
  return (
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={4}
        placeholder={field.help_text || ""}
        style={{ ...baseInput, fontFamily: "var(--font-montserrat)", resize: "vertical" }}
      />
      <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
        {value.length} / {maxLength}
      </span>
    </>
  );
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: CustomizationField;
  value: string;
  onChange: (v: CustomizationAnswerValue | undefined) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={baseInput}
    >
      <option value="">— Choose —</option>
      {field.options.map((opt) => (
        <option key={opt.id} value={opt.value}>
          {opt.label}
          {opt.surcharge_pence > 0 && ` (+£${(opt.surcharge_pence / 100).toFixed(2)})`}
        </option>
      ))}
    </select>
  );
}

function PositionField({ field, value, onChange }: { field: CustomizationField; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {field.options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex flex-col gap-2 rounded-md p-3 text-left transition-all duration-200"
            style={{
              background: selected ? "rgba(187,148,41,0.1)" : "var(--bg-tertiary)",
              border: `1px solid ${selected ? "var(--gold)" : "var(--bg-border)"}`,
            }}
          >
            {opt.preview_image_url ? (
              <div className="relative h-20 w-full overflow-hidden rounded" style={{ background: "var(--bg-secondary)" }}>
                <Image src={opt.preview_image_url} alt={opt.label} fill sizes="120px" className="object-cover" unoptimized />
                {selected && (
                  <span
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: "var(--gold)", color: "#fff" }}
                  >
                    <Check size={12} />
                  </span>
                )}
              </div>
            ) : (
              <div className="flex h-20 w-full items-center justify-center rounded" style={{ background: "var(--bg-secondary)" }}>
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>{opt.label}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600, color: selected ? "var(--gold-dark)" : "var(--white)" }}>
                {opt.label}
              </span>
              {opt.surcharge_pence > 0 && (
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
                  +£{(opt.surcharge_pence / 100).toFixed(2)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ImageField({
  field,
  value,
  onChange,
}: {
  field: CustomizationField;
  value: CustomizationAnswerValue | undefined;
  onChange: (v: CustomizationAnswerValue | undefined) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const currentUrl =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && typeof value.url === "string"
      ? value.url
      : "";

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoints.customizations.upload, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.danger(err.code || "Upload failed");
        return;
      }
      const data = (await res.json()) as {
        data: { url: string; public_id: string };
      };
      onChange({ url: data.data.url, public_id: data.data.public_id });
    } catch {
      toast.danger("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const maxMb = typeof field.config.max_file_mb === "number" ? field.config.max_file_mb : 8;

  if (currentUrl) {
    return (
      <div className="flex items-center gap-3 rounded-md p-3" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}>
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded" style={{ background: "var(--bg-secondary)" }}>
          <Image src={currentUrl} alt="Uploaded preview" fill sizes="64px" className="object-cover" unoptimized />
        </div>
        <div className="flex-1">
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-dim)" }}>
            Image uploaded ✓
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[rgba(244,67,54,0.1)]"
          style={{ color: "var(--white-faint)" }}
          aria-label="Remove image"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-md py-6 transition-colors duration-200 disabled:opacity-50"
        style={{
          background: "var(--bg-tertiary)",
          border: "2px dashed var(--bg-border)",
          color: "var(--white-faint)",
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-sm)",
        }}
      >
        <Upload size={16} />
        {uploading ? "Uploading..." : "Click to upload an image"}
      </button>
      <p className="mt-1.5" style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
        JPEG, PNG, WebP or GIF · max {maxMb} MB
      </p>
    </div>
  );
}
