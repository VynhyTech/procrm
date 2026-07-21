import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { StatusBadge } from "./StatusBadge";
import { FormModal, FormField } from "./FormModal";
import { InterestFormFields, EMPTY_INTEREST_FORM, type InterestFieldsForm } from "./InterestFormFields";
import { Plus, Home, Check, X } from "lucide-react";

type Interest = Awaited<ReturnType<typeof trpc.interests.list.query>>[number];

const PROPERTY_TYPES = ["Apartment", "Villa", "Townhouse", "Penthouse", "Plot", "Commercial", "Other"];
const INTEREST_STATUSES = ["Active", "Cooled", "Fulfilled", "Dropped"];
const FURNISHING = ["", "Furnished", "Semi", "Unfurnished"];
const MOVE_IN = ["", "Immediate", "1 month", "3 months", "6 months"];

interface InterestPanelProps {
  parentType: "Lead" | "Contact";
  parentId: string;
  initialInterests?: Interest[];
  initialCampaigns?: Array<{ id: string; name: string }>;
  onRefresh?: () => void;
}

export function InterestPanel({ parentType, parentId, initialInterests, initialCampaigns, onRefresh }: InterestPanelProps) {
  const [interests, setInterests] = useState<Interest[]>(initialInterests ?? []);
  const [loading, setLoading] = useState(!initialInterests);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [form, setForm] = useState<InterestFieldsForm>(EMPTY_INTEREST_FORM);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>(initialCampaigns ?? []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", propertyType: "", budgetMin: "", budgetMax: "", locationArea: "", bedrooms: "", bathrooms: "", furnishingPreference: "", moveInTimeline: "", otherDetail: "", status: "" });
  const [editSaving, setEditSaving] = useState(false);

  const fetchInterests = useCallback(async () => {
    if (initialInterests) return;
    try { setInterests(await trpc.interests.list.query({ parentType, parentId })); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, [parentType, parentId, initialInterests]);

  useEffect(() => { fetchInterests(); }, [fetchInterests]);
  useEffect(() => { if (initialCampaigns) return; trpc.campaigns.list.query().then((r) => setCampaigns(r.campaigns.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}); }, [initialCampaigns]);
  useEffect(() => { if (initialInterests) setInterests(initialInterests); }, [initialInterests]);
  useEffect(() => { if (initialCampaigns) setCampaigns(initialCampaigns); }, [initialCampaigns]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await trpc.interests.create.mutate({
        name: name.trim(),
        parentType, parentId,
        propertyType: form.propertyType || undefined,
        budgetMin: form.budgetMin ? parseFloat(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? parseFloat(form.budgetMax) : undefined,
        locationArea: form.locationArea || undefined,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseInt(form.bathrooms) : undefined,
        furnishingPreference: form.furnishingPreference || undefined,
        moveInTimeline: form.moveInTimeline || undefined,
        otherDetail: form.otherDetail || undefined,
        campaignId: form.campaignId || undefined,
      });
      setCreateOpen(false);
      setName("");
      setForm(EMPTY_INTEREST_FORM);
      if (onRefresh) onRefresh(); else fetchInterests();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const startEditing = (interest: Interest) => {
    setEditingId(interest.id);
    setEditForm({
      name: interest.name,
      propertyType: interest.propertyType ?? "",
      budgetMin: interest.budgetMin != null ? String(interest.budgetMin) : "",
      budgetMax: interest.budgetMax != null ? String(interest.budgetMax) : "",
      locationArea: interest.locationArea ?? "",
      bedrooms: interest.bedrooms != null ? String(interest.bedrooms) : "",
      bathrooms: interest.bathrooms != null ? String(interest.bathrooms) : "",
      furnishingPreference: interest.furnishingPreference ?? "",
      moveInTimeline: interest.moveInTimeline ?? "",
      otherDetail: interest.otherDetail ?? "",
      status: interest.status,
    });
  };

  const saveEditing = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await trpc.interests.update.mutate({
        id: editingId,
        name: editForm.name.trim(),
        propertyType: editForm.propertyType || undefined,
        budgetMin: editForm.budgetMin ? parseFloat(editForm.budgetMin) : null,
        budgetMax: editForm.budgetMax ? parseFloat(editForm.budgetMax) : null,
        locationArea: editForm.locationArea || null,
        bedrooms: editForm.bedrooms ? parseInt(editForm.bedrooms) : null,
        bathrooms: editForm.bathrooms ? parseInt(editForm.bathrooms) : null,
        furnishingPreference: editForm.furnishingPreference || null,
        moveInTimeline: editForm.moveInTimeline || null,
        otherDetail: editForm.otherDetail || null,
        status: editForm.status || undefined,
      });
      setEditingId(null);
      if (onRefresh) onRefresh(); else fetchInterests();
    } catch (err) { console.error(err); } finally { setEditSaving(false); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const inlineInput = "w-full rounded border border-input-borderFocus bg-input-bg px-2 py-1 text-sm text-input-text outline-none";
  const inlineSelect = "w-full rounded border border-input-borderFocus bg-input-bg px-2 py-1 text-sm text-input-text outline-none";

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Home className="h-4 w-4 text-foreground-subtle" /> Interests ({interests.filter((i) => i.status === "Active").length} active)
        </h2>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1 rounded-md bg-button-primary-bg px-2.5 py-1.5 text-xs font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
      ) : interests.length === 0 ? (
        <p className="py-4 text-center text-xs text-foreground-muted">No interests recorded yet — add what this person is looking for</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-secondary">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Type</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-foreground-muted">Budget Min</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-foreground-muted">Budget Max</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Location</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Bed</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Bath</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Furnishing</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Move-in</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Notes</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Status</th>
                  {editingId && <th className="px-3 py-2.5 w-16" />}
                </tr>
              </thead>
              <tbody>
                {interests.map((interest) => {
                  const isEditing = editingId === interest.id;
                  if (isEditing) {
                    return (
                      <tr key={interest.id} className="border-b border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950">
                        <td className="px-2 py-1.5"><input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inlineInput} /></td>
                        <td className="px-2 py-1.5"><select value={editForm.propertyType} onChange={(e) => setEditForm({ ...editForm, propertyType: e.target.value })} className={inlineSelect}><option value="">—</option>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                        <td className="px-2 py-1.5"><input type="number" value={editForm.budgetMin} onChange={(e) => setEditForm({ ...editForm, budgetMin: e.target.value })} className={inlineInput} placeholder="Min" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={editForm.budgetMax} onChange={(e) => setEditForm({ ...editForm, budgetMax: e.target.value })} className={inlineInput} placeholder="Max" /></td>
                        <td className="px-2 py-1.5"><input type="text" value={editForm.locationArea} onChange={(e) => setEditForm({ ...editForm, locationArea: e.target.value })} className={inlineInput} /></td>
                        <td className="px-2 py-1.5"><input type="number" value={editForm.bedrooms} onChange={(e) => setEditForm({ ...editForm, bedrooms: e.target.value })} className={inlineInput} /></td>
                        <td className="px-2 py-1.5"><input type="number" value={editForm.bathrooms} onChange={(e) => setEditForm({ ...editForm, bathrooms: e.target.value })} className={inlineInput} /></td>
                        <td className="px-2 py-1.5"><select value={editForm.furnishingPreference} onChange={(e) => setEditForm({ ...editForm, furnishingPreference: e.target.value })} className={inlineSelect}>{FURNISHING.map((f) => <option key={f} value={f}>{f || "—"}</option>)}</select></td>
                        <td className="px-2 py-1.5"><select value={editForm.moveInTimeline} onChange={(e) => setEditForm({ ...editForm, moveInTimeline: e.target.value })} className={inlineSelect}>{MOVE_IN.map((m) => <option key={m} value={m}>{m || "—"}</option>)}</select></td>
                        <td className="px-2 py-1.5"><input type="text" value={editForm.otherDetail} onChange={(e) => setEditForm({ ...editForm, otherDetail: e.target.value })} className={inlineInput} /></td>
                        <td className="px-2 py-1.5"><select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className={inlineSelect}>{INTEREST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                        <td className="px-2 py-1.5"><div className="flex items-center gap-1"><button onClick={saveEditing} disabled={editSaving} className="rounded-md p-1 text-success-600 hover:bg-success-50 dark:text-success-400"><Check className="h-4 w-4" /></button><button onClick={() => setEditingId(null)} className="rounded-md p-1 text-foreground-muted hover:bg-background-tertiary"><X className="h-4 w-4" /></button></div></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={interest.id} onDoubleClick={() => startEditing(interest)} className="border-b border-border-subtle cursor-pointer transition-colors hover:bg-background-secondary" title="Double-click to edit">
                      <td className="px-3 py-2.5 font-medium text-foreground">{interest.name}</td>
                      <td className="px-3 py-2.5 text-foreground-muted">{interest.propertyType ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right text-foreground">{interest.budgetMin != null ? `$${interest.budgetMin.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-foreground">{interest.budgetMax != null ? `$${interest.budgetMax.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">{interest.locationArea ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">{interest.bedrooms ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">{interest.bathrooms ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground-muted">{interest.furnishingPreference ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground-muted">{interest.moveInTimeline ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground-muted">{interest.otherDetail ?? "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={interest.status} /></td>
                      {editingId && <td />}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-2xs text-foreground-subtle">Double-click a row to edit</p>
        </>
      )}

      <FormModal open={createOpen} onClose={() => setCreateOpen(false)} title="New Interest" onSubmit={handleCreate} submitLabel="Add" submitting={saving}>
        <FormField label="Name" required>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. 3BR Apartment Downtown" />
        </FormField>
        <InterestFormFields form={form} onChange={setForm} campaigns={campaigns} />
      </FormModal>
    </div>
  );
}
