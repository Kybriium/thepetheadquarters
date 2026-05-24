"use client";

import { useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { toast } from "@heroui/react";
import {
  useCreateOptionType,
  useOptionTypes,
  type AdminOptionType,
} from "@/hooks/use-admin-option-types";
import { OptionTypeEditor } from "./option-type-editor";

export function OptionTypesHome() {
  const { data: types = [], isLoading } = useOptionTypes();
  const createMutation = useCreateOptionType();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    const code = newCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const name = newName.trim();
    if (!code || !name) {
      toast.danger("Code and name are required");
      return;
    }
    try {
      const ot = await createMutation.mutateAsync({ code, name });
      setSelectedId(ot.id);
      setNewCode("");
      setNewName("");
      setCreating(false);
      toast.success("Option type created");
    } catch (e) {
      toast.danger((e as Error).message || "Failed to create");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-regular)", color: "var(--white)" }}>
          Option Types
        </h1>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", marginTop: "var(--space-1)" }}>
          Reusable variant axes (Size, Colour, Material…). Define them once here, attach to any product from its detail page, then generate variants.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <div className="flex flex-col gap-2">
          {isLoading && (
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
              Loading…
            </p>
          )}
          {!isLoading && types.length === 0 && !creating && (
            <p
              className="rounded-md py-6 text-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--bg-border)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                color: "var(--white-faint)",
              }}
            >
              No option types yet.
            </p>
          )}
          {types.map((t) => (
            <TypeRow
              key={t.id}
              type={t}
              active={t.id === selectedId}
              onClick={() => setSelectedId(t.id)}
            />
          ))}

          {creating ? (
            <div
              className="flex flex-col gap-2 rounded-md p-3"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--gold)" }}
            >
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="code (e.g. color)"
                style={inputStyle}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Display name (e.g. Colour)"
                style={inputStyle}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-md py-2"
                  style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600 }}
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--bg-border)", color: "var(--white-faint)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md py-2.5"
              style={{
                border: "1px solid var(--bg-border)",
                color: "var(--gold-dark)",
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
              }}
            >
              <Plus size={14} />
              New option type
            </button>
          )}
        </div>

        {/* Editor */}
        <div>
          {selectedId ? (
            <OptionTypeEditor typeId={selectedId} />
          ) : (
            <div
              className="flex h-64 items-center justify-center rounded-lg"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
            >
              <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
                Pick an option type to edit, or create one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-xs)" as const,
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-2) var(--space-3)",
};

function TypeRow({
  type,
  active,
  onClick,
}: {
  type: AdminOptionType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors duration-200"
      style={{
        background: active ? "rgba(187,148,41,0.12)" : "var(--bg-secondary)",
        border: `1px solid ${active ? "var(--gold)" : "var(--bg-border)"}`,
      }}
    >
      <div>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
          {type.name}
        </p>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "10px", color: "var(--white-faint)" }}>
          {type.values.length} values · {type.code}
        </p>
      </div>
      <ChevronRight size={14} style={{ color: active ? "var(--gold-dark)" : "var(--white-faint)" }} />
    </button>
  );
}
