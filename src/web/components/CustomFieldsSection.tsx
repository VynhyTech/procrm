import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { Check } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";

type EntityType = "Lead" | "Contact" | "Opportunity";
type FieldDef = Awaited<ReturnType<typeof trpc.orgSettings.getCustomFields.query>>[number];

interface CustomFieldsSectionProps {
  entityType: EntityType;
  recordId: string;
  values: Record<string, unknown> | null;
  canEdit: boolean;
  onSaved: () => void;
}

async function saveCustomField(entityType: EntityType, id: string, key: string, value: unknown) {
  if (entityType === "Lead") return trpc.leads.updateCustomField.mutate({ id, key, value });
  if (entityType === "Contact") return trpc.contacts.updateCustomField.mutate({ id, key, value });
  return trpc.opportunities.updateCustomField.mutate({ id, key, value });
}

export function CustomFieldsSection({ entityType, recordId, values, canEdit, onSaved }: CustomFieldsSectionProps) {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchFields = useCallback(async () => {
    try { setFields(await trpc.orgSettings.getCustomFields.query({ entityType })); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, [entityType]);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const startEdit = (field: FieldDef) => {
    if (!canEdit) return;
    const current = values?.[field.key];
    setEditingKey(field.key);
    setDraft(current == null ? "" : String(current));
  };

  const saveText = async (field: FieldDef) => {
    setSaving(true);
    try {
      const value = field.fieldType === "number" ? (draft.trim() === "" ? null : Number(draft)) : (draft.trim() || null);
      await saveCustomField(entityType, recordId, field.key, value);
      setEditingKey(null);
      onSaved();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const toggleCheckbox = async (field: FieldDef) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await saveCustomField(entityType, recordId, field.key, !values?.[field.key]);
      onSaved();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const saveSelect = async (field: FieldDef, value: string) => {
    setSaving(true);
    try {
      await saveCustomField(entityType, recordId, field.key, value || null);
      onSaved();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  if (loading || fields.length === 0) return null;

  return (
    <CollapsibleSection title="Custom Fields">
      <div className="divide-y divide-border-subtle">
        {fields.map((field) => {
          const value = values?.[field.key];
          const isEditing = editingKey === field.key;

          if (field.fieldType === "checkbox") {
            return (
              <div key={field.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-foreground-muted">{field.label}</span>
                <input type="checkbox" checked={!!value} disabled={!canEdit || saving} onChange={() => toggleCheckbox(field)}
                  className="h-4 w-4 rounded border-input-border accent-primary-accent" />
              </div>
            );
          }

          if (field.fieldType === "select") {
            const options = Array.isArray(field.options) ? (field.options as string[]) : [];
            return (
              <div key={field.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-foreground-muted">{field.label}</span>
                {canEdit ? (
                  <select value={typeof value === "string" ? value : ""} onChange={(e) => saveSelect(field, e.target.value)} disabled={saving}
                    className="rounded border border-input-border bg-input-bg px-2 py-1 text-sm text-input-text outline-none">
                    <option value="">—</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <span className="text-sm font-medium text-foreground">{typeof value === "string" && value ? value : "—"}</span>
                )}
              </div>
            );
          }

          if (isEditing) {
            return (
              <div key={field.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-foreground-muted">{field.label}</span>
                <div className="flex items-center gap-1">
                  <input
                    type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
                    value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveText(field); if (e.key === "Escape") setEditingKey(null); }}
                    autoFocus disabled={saving}
                    className="rounded border border-input-borderFocus bg-input-bg px-2 py-1 text-sm text-input-text outline-none text-right"
                  />
                  <button onClick={() => saveText(field)} className="text-success-500"><Check className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          }

          return (
            <div key={field.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-foreground-muted">{field.label}</span>
              <span
                onDoubleClick={() => startEdit(field)}
                className={`text-sm font-medium text-foreground ${canEdit ? "cursor-pointer hover:text-primary-text" : ""}`}
                title={canEdit ? "Double-click to edit" : undefined}
              >
                {value == null || value === "" ? "—" : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
