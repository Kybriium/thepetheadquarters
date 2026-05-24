"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useAdminCustomizationTemplates,
  useCreateTemplateField,
  useDeleteCustomizationTemplate,
  useDeleteField,
  useUpdateCustomizationTemplate,
} from "@/hooks/use-admin-customizations";
import type { CustomizationFieldType } from "@/types/customization";
import { FieldEditor } from "./field-editor";

interface TemplateEditorProps {
  templateId: string;
}

const FIELD_TYPE_OPTIONS: { value: CustomizationFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "image", label: "Image upload" },
  { value: "select", label: "Single choice (dropdown)" },
  { value: "position", label: "Placement (choice with previews)" },
];

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const { data: templates = [] } = useAdminCustomizationTemplates();
  const template = templates.find((t) => t.id === templateId);

  const updateMutation = useUpdateCustomizationTemplate();
  const deleteMutation = useDeleteCustomizationTemplate();
  const addFieldMutation = useCreateTemplateField();
  const deleteFieldMutation = useDeleteField();

  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [addingField, setAddingField] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setIsActive(template.is_active);
    }
  }, [template]);

  if (!template) return null;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        id: templateId,
        data: { name, description, is_active: isActive },
      });
      toast.success("Saved");
    } catch {
      toast.danger("Save failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this template? Any product attachments will be removed too.")) return;
    try {
      await deleteMutation.mutateAsync(templateId);
      toast.success("Template deleted");
    } catch {
      toast.danger("Delete failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header card */}
      <div className="rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Optional — shown only in admin." />
          </div>
          <label className="flex items-center gap-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ accentColor: "var(--gold)" }} />
            Active (uncheck to hide from storefront without deleting)
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 rounded-md px-4 py-2"
              style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600 }}
            >
              <Save size={14} /> {updateMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleDelete}
              className="ml-auto rounded-md px-4 py-2"
              style={{ border: "1px solid var(--error)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}
            >
              Delete template
            </button>
          </div>
        </div>
      </div>

      {/* Fields list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
            Fields ({template.fields.length})
          </h3>
          {!addingField && (
            <button
              onClick={() => setAddingField(true)}
              className="flex items-center gap-2 rounded-md px-3 py-2"
              style={{ border: "1px solid var(--bg-border)", color: "var(--gold-dark)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 500 }}
            >
              <Plus size={12} /> Add field
            </button>
          )}
        </div>

        {addingField && (
          <NewFieldForm
            onCancel={() => setAddingField(false)}
            onSubmit={async (data) => {
              try {
                await addFieldMutation.mutateAsync({ templateId, data });
                toast.success("Field added");
                setAddingField(false);
              } catch {
                toast.danger("Failed to add field");
              }
            }}
            busy={addFieldMutation.isPending}
          />
        )}

        {template.fields.length === 0 && !addingField && (
          <p
            className="rounded-md py-6 text-center"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}
          >
            No fields yet — add the first one.
          </p>
        )}

        {template.fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            onDelete={async () => {
              if (!confirm(`Delete field "${field.label}"?`)) return;
              try {
                await deleteFieldMutation.mutateAsync(field.id);
                toast.success("Field removed");
              } catch {
                toast.danger("Delete failed");
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NewFieldForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (data: {
    key: string;
    label: string;
    field_type: CustomizationFieldType;
    is_required: boolean;
    surcharge_pence: number;
    help_text: string;
  }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomizationFieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [surchargePence, setSurchargePence] = useState(0);
  const [helpText, setHelpText] = useState("");

  return (
    <div className="rounded-lg p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--gold)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Key (used internally)</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            style={inputStyle}
            placeholder="pet_name"
          />
        </div>
        <div>
          <label style={labelStyle}>Label (customer sees)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} placeholder="Pet name" />
        </div>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomizationFieldType)} style={inputStyle}>
            {FIELD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Surcharge (pence)</label>
          <input
            type="number"
            min={0}
            value={surchargePence}
            onChange={(e) => setSurchargePence(Number(e.target.value) || 0)}
            style={inputStyle}
            placeholder="0"
          />
        </div>
        <div className="sm:col-span-2">
          <label style={labelStyle}>Help text (optional)</label>
          <input value={helpText} onChange={(e) => setHelpText(e.target.value)} style={inputStyle} placeholder="e.g. Max 12 characters" />
        </div>
        <label className="flex items-center gap-2 sm:col-span-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} style={{ accentColor: "var(--gold)" }} />
          Customer must fill in this field
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onSubmit({ key, label, field_type: fieldType, is_required: isRequired, surcharge_pence: surchargePence, help_text: helpText })}
          disabled={busy || !key || !label}
          className="rounded-md px-4 py-2 disabled:opacity-50"
          style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600 }}
        >
          {busy ? "Adding…" : "Add field"}
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-2" style={{ border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}>
          Cancel
        </button>
      </div>
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
