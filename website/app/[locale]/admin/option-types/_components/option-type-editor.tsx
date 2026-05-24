"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useCreateOptionValue,
  useDeleteOptionType,
  useDeleteOptionValue,
  useOptionTypes,
  useUpdateOptionType,
  useUpdateOptionValue,
  type AdminOptionValue,
} from "@/hooks/use-admin-option-types";

interface Props {
  typeId: string;
}

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

const labelStyle = {
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-xs)" as const,
  color: "var(--white-faint)",
  letterSpacing: "var(--tracking-wide)" as const,
  textTransform: "uppercase" as const,
  display: "block" as const,
  marginBottom: "var(--space-1)",
};

export function OptionTypeEditor({ typeId }: Props) {
  const { data: types = [] } = useOptionTypes();
  const type = types.find((t) => t.id === typeId);

  const updateMutation = useUpdateOptionType();
  const deleteMutation = useDeleteOptionType();
  const addValueMutation = useCreateOptionValue();

  const [name, setName] = useState(type?.name || "");
  useEffect(() => {
    if (type) setName(type.name);
  }, [type]);

  if (!type) return null;

  async function saveName() {
    try {
      await updateMutation.mutateAsync({ id: typeId, data: { name } });
      toast.success("Saved");
    } catch {
      toast.danger("Save failed");
    }
  }

  async function deleteType() {
    if (!confirm("Delete this option type? It will be detached from any products using it.")) return;
    try {
      await deleteMutation.mutateAsync(typeId);
      toast.success("Option type deleted");
    } catch {
      toast.danger("Delete failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveName}
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 rounded-md px-4 py-2"
              style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600 }}
            >
              <Save size={14} /> {updateMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={deleteType}
              className="ml-auto rounded-md px-4 py-2"
              style={{ border: "1px solid var(--error)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}
            >
              Delete option type
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
          Values ({type.values.length})
        </h3>

        {type.values.length === 0 ? (
          <p
            className="rounded-md py-6 text-center"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}
          >
            No values yet — add the first one below.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {type.values.map((v) => (
              <ValueRow key={v.id} value={v} />
            ))}
          </div>
        )}

        <NewValueForm
          onSubmit={async (data) => {
            try {
              await addValueMutation.mutateAsync({ typeId, data });
              toast.success("Value added");
            } catch {
              toast.danger("Failed to add value");
            }
          }}
          busy={addValueMutation.isPending}
        />
      </div>
    </div>
  );
}

function ValueRow({ value }: { value: AdminOptionValue }) {
  const updateMutation = useUpdateOptionValue();
  const deleteMutation = useDeleteOptionValue();
  const [label, setLabel] = useState(value.label);
  const [hex, setHex] = useState(value.swatch_hex);
  const [imgUrl, setImgUrl] = useState(value.swatch_image_url);

  async function save() {
    try {
      await updateMutation.mutateAsync({
        id: value.id,
        data: { label, swatch_hex: hex, swatch_image_url: imgUrl },
      });
      toast.success("Saved");
    } catch {
      toast.danger("Save failed");
    }
  }

  return (
    <div className="grid items-center gap-2 rounded-md p-3 sm:grid-cols-[40px_1fr_120px_1fr_auto]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
    >
      {/* Swatch preview */}
      <Swatch hex={hex} imageUrl={imgUrl} label={label} />

      <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} placeholder="Label" />
      <input value={hex} onChange={(e) => setHex(e.target.value)} style={inputStyle} placeholder="#RRGGBB" />
      <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} style={inputStyle} placeholder="Swatch image URL (optional)" />

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={updateMutation.isPending}
          className="rounded-md px-3 py-2"
          style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600 }}
        >
          {updateMutation.isPending ? "…" : "Save"}
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Delete value "${value.label}"?`)) return;
            try {
              await deleteMutation.mutateAsync(value.id);
              toast.success("Removed");
            } catch {
              toast.danger("Failed");
            }
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ color: "var(--error)" }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function NewValueForm({
  onSubmit,
  busy,
}: {
  onSubmit: (data: { label: string; swatch_hex?: string; swatch_image_url?: string }) => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState("");
  const [hex, setHex] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  return (
    <div className="grid items-center gap-2 rounded-md p-3 sm:grid-cols-[40px_1fr_120px_1fr_auto]"
      style={{ background: "var(--bg-tertiary)", border: "1px dashed var(--bg-border)" }}
    >
      <Swatch hex={hex} imageUrl={imgUrl} label={label || "?"} />
      <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} placeholder="Label" />
      <input value={hex} onChange={(e) => setHex(e.target.value)} style={inputStyle} placeholder="#RRGGBB" />
      <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} style={inputStyle} placeholder="Swatch image URL" />
      <button
        onClick={() => {
          if (!label.trim()) return;
          onSubmit({ label: label.trim(), swatch_hex: hex, swatch_image_url: imgUrl });
          setLabel(""); setHex(""); setImgUrl("");
        }}
        disabled={busy}
        className="flex items-center gap-1 rounded-md px-3 py-2 disabled:opacity-50"
        style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600 }}
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function Swatch({ hex, imageUrl, label }: { hex: string; imageUrl: string; label: string }) {
  if (imageUrl) {
    return (
      <span
        className="block h-8 w-8 rounded-full"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "1px solid var(--bg-border)",
        }}
        title={label}
      />
    );
  }
  if (hex) {
    return (
      <span
        className="block h-8 w-8 rounded-full"
        style={{ background: hex, border: "1px solid var(--bg-border)" }}
        title={label}
      />
    );
  }
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px dashed var(--bg-border)",
        color: "var(--white-faint)",
        fontFamily: "var(--font-montserrat)",
        fontSize: 10,
      }}
      title={label}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}
