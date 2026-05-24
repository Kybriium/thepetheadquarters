"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useCreateFieldOption,
  useDeleteFieldOption,
  useUpdateField,
} from "@/hooks/use-admin-customizations";
import type { CustomizationField } from "@/types/customization";

interface FieldEditorProps {
  field: CustomizationField;
  onDelete: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  text: "Short text",
  long_text: "Long text",
  image: "Image upload",
  select: "Single choice",
  position: "Placement",
};

export function FieldEditor({ field, onDelete }: FieldEditorProps) {
  const [open, setOpen] = useState(false);
  const supportsOptions = field.field_type === "select" || field.field_type === "position";

  const updateMutation = useUpdateField();
  const addOptionMutation = useCreateFieldOption();
  const deleteOptionMutation = useDeleteFieldOption();

  const [isRequired, setIsRequired] = useState(field.is_required);
  const [surcharge, setSurcharge] = useState(field.surcharge_pence);
  const [helpText, setHelpText] = useState(field.help_text);

  async function saveField() {
    try {
      await updateMutation.mutateAsync({
        id: field.id,
        data: {
          is_required: isRequired,
          surcharge_pence: surcharge,
          help_text: helpText,
        },
      });
      toast.success("Saved");
    } catch {
      toast.danger("Save failed");
    }
  }

  return (
    <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
            {field.label}
            {field.is_required && <span style={{ color: "var(--gold)" }}> *</span>}
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "11px", color: "var(--white-faint)" }}>
            {TYPE_LABELS[field.field_type]} · key: {field.key}
            {field.surcharge_pence > 0 && ` · +£${(field.surcharge_pence / 100).toFixed(2)}`}
            {supportsOptions && ` · ${field.options.length} options`}
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} style={{ color: "var(--white-faint)" }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--white-faint)" }} />
        )}
      </button>

      {open && (
        <div className="border-t p-4" style={{ borderColor: "var(--bg-border)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label style={labelStyle}>Help text</label>
              <input value={helpText} onChange={(e) => setHelpText(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Surcharge (pence)</label>
              <input
                type="number"
                min={0}
                value={surcharge}
                onChange={(e) => setSurcharge(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
            <label className="flex items-center gap-2 sm:col-span-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} style={{ accentColor: "var(--gold)" }} />
              Required
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={saveField}
              disabled={updateMutation.isPending}
              className="rounded-md px-3 py-1.5 disabled:opacity-50"
              style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600 }}
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={onDelete}
              className="ml-auto flex items-center gap-1 rounded-md px-3 py-1.5"
              style={{ color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
            >
              <Trash2 size={12} /> Delete field
            </button>
          </div>

          {supportsOptions && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>Options</p>
              <div className="flex flex-col gap-2">
                {field.options.map((opt) => (
                  <div
                    key={opt.id}
                    className="flex items-center justify-between gap-3 rounded-md p-2"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}
                  >
                    <div className="flex-1">
                      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--white)" }}>
                        {opt.label}
                      </p>
                      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
                        value: {opt.value}
                        {opt.surcharge_pence > 0 && ` · +£${(opt.surcharge_pence / 100).toFixed(2)}`}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm("Remove option?")) return;
                        try {
                          await deleteOptionMutation.mutateAsync(opt.id);
                          toast.success("Removed");
                        } catch {
                          toast.danger("Failed");
                        }
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ color: "var(--error)" }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <NewOptionForm
                fieldId={field.id}
                onAdded={() => toast.success("Option added")}
                busy={addOptionMutation.isPending}
                onSubmit={async (data) => {
                  try {
                    await addOptionMutation.mutateAsync({ fieldId: field.id, data });
                  } catch {
                    toast.danger("Failed");
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewOptionForm({
  onSubmit,
  busy,
}: {
  fieldId: string;
  onAdded: () => void;
  onSubmit: (data: { value: string; label: string; surcharge_pence: number; preview_image_url: string }) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [surcharge, setSurcharge] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
        placeholder="value (e.g. back)"
        style={inputStyle}
      />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Back side)" style={inputStyle} />
      <input
        type="number"
        min={0}
        value={surcharge}
        onChange={(e) => setSurcharge(Number(e.target.value) || 0)}
        placeholder="Surcharge"
        style={inputStyle}
      />
      <button
        onClick={() => {
          if (!value || !label) return;
          onSubmit({ value, label, surcharge_pence: surcharge, preview_image_url: previewUrl });
          setValue("");
          setLabel("");
          setSurcharge(0);
          setPreviewUrl("");
        }}
        disabled={busy || !value || !label}
        className="flex items-center justify-center gap-1 rounded-md px-3 py-2 disabled:opacity-50"
        style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600 }}
      >
        <Plus size={12} /> Add
      </button>
      <input
        value={previewUrl}
        onChange={(e) => setPreviewUrl(e.target.value)}
        placeholder="Preview image URL (optional)"
        style={{ ...inputStyle, gridColumn: "span 4" }}
      />
    </div>
  );
}

const labelStyle = {
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-xs)" as const,
  color: "var(--white-faint)",
  letterSpacing: "var(--tracking-wide)" as const,
  textTransform: "uppercase" as const,
  display: "block" as const,
  marginBottom: "var(--space-1)",
};

const inputStyle = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-sm)" as const,
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-2) var(--space-3)",
  width: "100%",
};
