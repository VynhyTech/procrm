import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ConfirmModal } from "../components/ConfirmModal";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { FormModal, FormField } from "../components/FormModal";
import { InterestFormFields, EMPTY_INTEREST_FORM, type InterestFieldsForm } from "../components/InterestFormFields";
import { Check, Pencil, Copy, Trash2 } from "lucide-react";

type InterestData = Awaited<ReturnType<typeof trpc.interests.getById.query>>;

const PROPERTY_TYPES = ["", "Apartment", "Villa", "Townhouse", "Penthouse", "Plot", "Commercial", "Other"];
const INTEREST_STATUSES = ["Active", "Cooled", "Fulfilled", "Dropped"];
const FURNISHING = ["", "Furnished", "Semi", "Unfurnished"];
const MOVE_IN = ["", "Immediate", "1 month", "3 months", "6 months"];

interface InterestDetailPageProps { id: string; }

export function InterestDetailPage({ id }: InterestDetailPageProps) {
  const { scopes } = useAuth();
  const { basePath } = useApp();
  const [interest, setInterest] = useState<InterestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"details" | "attachments">("details");
  const [cloning, setCloning] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneForm, setCloneForm] = useState<InterestFieldsForm>(EMPTY_INTEREST_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editForm, setEditForm] = useState<InterestFieldsForm>(EMPTY_INTEREST_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = scopes.includes("interests:edit");
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setInterest(await trpc.interests.getById.query({ id })); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { trpc.campaigns.list.query().then((r) => setCampaigns(r.campaigns.map((c) => ({ id: c.id, name: c.name })))).catch(() => {}); }, []);

  const startFieldEdit = (field: string, value: string) => { if (!canEdit) return; setEditingField(field); setEditDraft(value); };

  const saveFieldEdit = async () => {
    if (!editingField || !interest) return;
    try {
      const val = editDraft || undefined;
      await trpc.interests.update.mutate({
        id,
        ...(editingField === "name" ? { name: editDraft.trim() || undefined } : {}),
        ...(editingField === "propertyType" ? { propertyType: val } : {}),
        ...(editingField === "budgetMin" ? { budgetMin: val ? parseFloat(val) : null } : {}),
        ...(editingField === "budgetMax" ? { budgetMax: val ? parseFloat(val) : null } : {}),
        ...(editingField === "locationArea" ? { locationArea: val ?? null } : {}),
        ...(editingField === "bedrooms" ? { bedrooms: val ? parseInt(val) : null } : {}),
        ...(editingField === "bathrooms" ? { bathrooms: val ? parseInt(val) : null } : {}),
        ...(editingField === "furnishingPreference" ? { furnishingPreference: val ?? null } : {}),
        ...(editingField === "moveInTimeline" ? { moveInTimeline: val ?? null } : {}),
        ...(editingField === "otherDetail" ? { otherDetail: val ?? null } : {}),
        ...(editingField === "status" ? { status: val } : {}),
      });
      setEditingField(null);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const interestToForm = (i: NonNullable<typeof interest>): InterestFieldsForm => ({
    propertyType: i.propertyType ?? "",
    budgetMin: i.budgetMin != null ? String(i.budgetMin) : "",
    budgetMax: i.budgetMax != null ? String(i.budgetMax) : "",
    locationArea: i.locationArea ?? "",
    bedrooms: i.bedrooms != null ? String(i.bedrooms) : "",
    bathrooms: i.bathrooms != null ? String(i.bathrooms) : "",
    furnishingPreference: i.furnishingPreference ?? "",
    moveInTimeline: i.moveInTimeline ?? "",
    otherDetail: i.otherDetail ?? "",
    campaignId: i.campaignId ?? "",
  });

  const handleEditClick = () => {
    if (!interest) return;
    setEditName(interest.name);
    setEditForm(interestToForm(interest));
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setSavingEdit(true);
    try {
      await trpc.interests.update.mutate({
        id,
        name: editName.trim() || undefined,
        propertyType: editForm.propertyType || undefined,
        budgetMin: editForm.budgetMin ? parseFloat(editForm.budgetMin) : null,
        budgetMax: editForm.budgetMax ? parseFloat(editForm.budgetMax) : null,
        locationArea: editForm.locationArea || null,
        bedrooms: editForm.bedrooms ? parseInt(editForm.bedrooms) : null,
        bathrooms: editForm.bathrooms ? parseInt(editForm.bathrooms) : null,
        furnishingPreference: editForm.furnishingPreference || null,
        moveInTimeline: editForm.moveInTimeline || null,
        otherDetail: editForm.otherDetail || null,
        campaignId: editForm.campaignId || null,
      });
      setEditOpen(false);
      fetchData();
    } catch (err) { console.error(err); } finally { setSavingEdit(false); }
  };

  const openClone = () => {
    if (!interest) return;
    setCloneName(`${interest.name} (Copy)`);
    setCloneForm(interestToForm(interest));
    setCloneOpen(true);
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const cloned = await trpc.interests.clone.mutate({
        id,
        overrides: {
          name: cloneName.trim() || undefined,
          propertyType: cloneForm.propertyType || null,
          budgetMin: cloneForm.budgetMin ? parseFloat(cloneForm.budgetMin) : null,
          budgetMax: cloneForm.budgetMax ? parseFloat(cloneForm.budgetMax) : null,
          locationArea: cloneForm.locationArea || null,
          bedrooms: cloneForm.bedrooms ? parseInt(cloneForm.bedrooms) : null,
          bathrooms: cloneForm.bathrooms ? parseInt(cloneForm.bathrooms) : null,
          furnishingPreference: cloneForm.furnishingPreference || null,
          moveInTimeline: cloneForm.moveInTimeline || null,
          otherDetail: cloneForm.otherDetail || null,
          campaignId: cloneForm.campaignId || null,
        },
      });
      setCloneOpen(false);
      navigate(`/interests/${cloned.id}`);
    } catch (err) { console.error(err); } finally { setCloning(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await trpc.interests.delete.mutate({ id });
      navigate("/interests");
    } catch (err) { console.error(err); setDeleting(false); }
  };

  if (loading) return <div className="p-6"><div className="skeleton h-8 w-48 rounded" /></div>;
  if (!interest) return <div className="p-6 text-foreground-muted">Interest not found</div>;

  const fieldRow = (label: string, field: string, value: string | null, options?: string[]) => {
    if (editingField === field) {
      return (
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-foreground-muted">{label}</span>
          <div className="flex items-center gap-1">
            {options ? (
              <select value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus onBlur={saveFieldEdit} className="rounded border border-input-borderFocus bg-input-bg px-2 py-1 text-sm text-input-text outline-none text-right">
                {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            ) : (
              <input type="text" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveFieldEdit(); if (e.key === "Escape") setEditingField(null); }} autoFocus className="rounded border border-input-borderFocus bg-input-bg px-2 py-1 text-sm text-input-text outline-none text-right" />
            )}
            <button onClick={saveFieldEdit} className="text-success-500"><Check className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-foreground-muted">{label}</span>
        <span onDoubleClick={() => startFieldEdit(field, value ?? "")} className={`text-sm font-medium text-foreground ${canEdit ? "cursor-pointer hover:text-primary-text" : ""}`} title={canEdit ? "Double-click to edit" : undefined}>
          {value || "—"}
        </span>
      </div>
    );
  };

  const parentUrl = interest.parentType === "Contact" ? `/contacts/${interest.parentId}` : `/leads/${interest.parentId}`;

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* ====== HEADER ====== */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            {editingField === "name" ? (
              <input
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveFieldEdit(); if (e.key === "Escape") setEditingField(null); }}
                onBlur={saveFieldEdit}
                autoFocus
                className="rounded border border-input-borderFocus bg-input-bg px-2 py-0.5 text-xl font-bold text-input-text outline-none"
              />
            ) : (
              <h1
                onDoubleClick={() => startFieldEdit("name", interest.name)}
                className={`text-xl font-bold text-foreground ${canEdit ? "cursor-pointer" : ""}`}
                title={canEdit ? "Double-click to edit" : undefined}
              >
                {interest.name}
              </h1>
            )}
            <div className="mt-0.5 flex items-center gap-1 text-sm text-foreground-muted">
              <span>Interest</span>
              <span>·</span>
              <span>{interest.parentType}:</span>
              <a href={parentUrl} className="text-primary-text hover:underline font-medium">{interest.parentName ?? interest.parentId}</a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button onClick={handleEditClick} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-semibold text-button-primary-text shadow-card transition-colors hover:bg-button-primary-hover">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {canEdit && (
              <button onClick={openClone} className="flex items-center gap-1.5 rounded-lg border-2 border-primary-accent px-4 py-2 text-sm font-semibold text-primary-text shadow-card transition-colors hover:bg-primary-50 dark:hover:bg-primary-950">
                <Copy className="h-3.5 w-3.5" /> Clone
              </button>
            )}
            {canEdit && (
              <button onClick={() => setDeleteConfirmOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-destructive-bg px-4 py-2 text-sm font-semibold text-button-destructive-text shadow-card transition-colors hover:bg-button-destructive-hover">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ====== TWO-COLUMN BODY ====== */}
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-5">

        {/* LEFT COLUMN — Details */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-card-border bg-card shadow-card">
            <div className="flex border-b border-border">
              {(["details", "attachments"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === "details" && (
              <div className="p-5 space-y-6">
                <CollapsibleSection title="Property Requirements">
                  <div className="divide-y divide-border-subtle">
                    {fieldRow("Property Type", "propertyType", interest.propertyType, PROPERTY_TYPES)}
                    {fieldRow("Budget Min", "budgetMin", interest.budgetMin != null ? String(interest.budgetMin) : null)}
                    {fieldRow("Budget Max", "budgetMax", interest.budgetMax != null ? String(interest.budgetMax) : null)}
                    {fieldRow("Location", "locationArea", interest.locationArea)}
                    {fieldRow("Bedrooms", "bedrooms", interest.bedrooms != null ? String(interest.bedrooms) : null)}
                    {fieldRow("Bathrooms", "bathrooms", interest.bathrooms != null ? String(interest.bathrooms) : null)}
                    {fieldRow("Furnishing", "furnishingPreference", interest.furnishingPreference, FURNISHING)}
                    {fieldRow("Move-in Timeline", "moveInTimeline", interest.moveInTimeline, MOVE_IN)}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title="Notes">
                  <div className="divide-y divide-border-subtle">
                    {fieldRow("Details", "otherDetail", interest.otherDetail)}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title="Status & Attribution">
                  <div className="divide-y divide-border-subtle">
                    {fieldRow("Status", "status", interest.status, INTEREST_STATUSES)}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground-muted">Source</span>
                      <span className="text-sm font-medium text-foreground">{interest.source ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground-muted">Created</span>
                      <span className="text-sm font-medium text-foreground">{new Date(interest.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground-muted">Updated</span>
                      <span className="text-sm font-medium text-foreground">{new Date(interest.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            )}

            {activeTab === "attachments" && (
              <div className="p-5">
                <AttachmentsPanel parentType="Interest" parentId={id} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Fixed sidebar */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
            <p className="mb-3 text-xs font-medium text-foreground-subtle uppercase tracking-wide">Status</p>
            <StatusBadge status={interest.status} size="md" />
          </div>

          <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
            <p className="mb-3 text-xs font-medium text-foreground-subtle uppercase tracking-wide">Parent Record</p>
            <a href={parentUrl} className="flex items-center justify-between rounded-lg bg-background-secondary px-4 py-3 transition-colors hover:bg-background-tertiary">
              <span className="text-sm text-foreground-muted">{interest.parentType}</span>
              <span className="text-sm font-medium text-primary-text">{interest.parentName ?? interest.parentId} →</span>
            </a>
          </div>

          {interest.opportunityId && (
            <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
              <p className="mb-3 text-xs font-medium text-foreground-subtle uppercase tracking-wide">Opportunity</p>
              <a href={`/opportunities/${interest.opportunityId}`} className="flex items-center justify-between rounded-lg bg-background-secondary px-4 py-3 transition-colors hover:bg-background-tertiary">
                <span className="text-sm font-medium text-primary-text">View Opportunity →</span>
              </a>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} onConfirm={handleDelete}
        title="Delete Interest" message="Are you sure you want to delete this interest? This cannot be undone."
        confirmLabel="Delete" destructive confirming={deleting} />

      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Interest" onSubmit={handleEditSave} submitLabel="Save Changes" submitting={savingEdit}>
        <FormField label="Name" required>
          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus" autoFocus />
        </FormField>
        <InterestFormFields form={editForm} onChange={setEditForm} campaigns={campaigns} />
      </FormModal>

      <FormModal open={cloneOpen} onClose={() => setCloneOpen(false)} title="Clone Interest" onSubmit={handleClone} submitLabel="Create Clone" submitting={cloning}>
        <FormField label="Name" required>
          <input type="text" value={cloneName} onChange={(e) => setCloneName(e.target.value)} className="w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus" autoFocus />
        </FormField>
        <InterestFormFields form={cloneForm} onChange={setCloneForm} campaigns={campaigns} />
        <p className="text-xs text-foreground-muted">The clone is added to the same {interest.parentType.toLowerCase()} ({interest.parentName ?? interest.parentId}).</p>
      </FormModal>
    </div>
  );
}
