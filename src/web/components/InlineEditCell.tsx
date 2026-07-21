import React, { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";

interface InlineEditCellProps {
  value: string | null;
  onSave: (newValue: string | null) => Promise<void>;
  placeholder?: string;
}

export function InlineEditCell({ value, onSave, placeholder }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    const newVal = draft.trim() || null;
    if (newVal === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(newVal); } catch (err) { console.error(err); }
    finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input ref={inputRef} type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          onBlur={save} disabled={saving}
          className="w-full rounded border border-input-borderFocus bg-input-bg px-2 py-0.5 text-sm text-input-text outline-none" />
        <button onClick={save} disabled={saving} className="text-success-500 shrink-0"><Check className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <span onDoubleClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="cursor-pointer rounded px-1 py-0.5 hover:bg-background-tertiary"
      title="Double-click to edit">
      {value || placeholder || "—"}
    </span>
  );
}
