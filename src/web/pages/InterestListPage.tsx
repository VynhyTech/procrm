import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { useAuth, useApp } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { ConfirmModal } from "../components/ConfirmModal";
import { FormModal, FormField } from "../components/FormModal";
import { ParentPicker, type ParentType } from "../components/ParentPicker";
import { InterestFormFields, EMPTY_INTEREST_FORM, type InterestFieldsForm } from "../components/InterestFormFields";
import { Home, Pencil, Copy, Trash2, Plus } from "lucide-react";

type Interest = Awaited<ReturnType<typeof trpc.interests.listAll.query>>["interests"][number];

const STATUS_ROW_BORDER: Record<string, string> = {
  Active: "border-l-info-400",
  Cooled: "border-l-warning-400",
  Fulfilled: "border-l-success-400",
  Dropped: "border-l-error-400",
};

export function InterestListPage() {
  const { scopes } = useAuth();
  const { basePath } = useApp();
  const [interests, setInterests] = useState<Interest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentType, setParentType] = useState<ParentType>("Lead");
  const [parentId, setParentId] = useState("");
  const [parentLabel, setParentLabel] = useState("");
  const [form, setForm] = useState<InterestFieldsForm>(EMPTY_INTEREST_FORM);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [creating, setCreating] = useState(false);

  const canEdit = scopes.includes("interests:edit");

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const fetchInterests = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.interests.listAll.query({ status: statusFilter || undefined, limit: pageSize, offset: page * pageSize });
      setInterests(result.interests);
      setTotal(result.total);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [statusFilter, page]);

  useEffect(() => { fetchInterests(); }, [fetchInterests]);

  useEffect(() => {
    trpc.campaigns.list.query().then((r) => setCampaigns(r.campaigns.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, []);

  const openCreate = () => {
    setName("");
    setParentType("Lead");
    setParentId("");
    setParentLabel("");
    setForm(EMPTY_INTEREST_FORM);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !parentId) return;
    setCreating(true);
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
      fetchInterests();
    } catch (err) { console.error(err); } finally { setCreating(false); }
  };

  const handleClone = async (id: string) => {
    setCloningId(id);
    try { await trpc.interests.clone.mutate({ id }); fetchInterests(); }
    catch (err) { console.error(err); } finally { setCloningId(null); }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try { await trpc.interests.delete.mutate({ id: deleteTargetId }); setDeleteTargetId(null); fetchInterests(); }
    catch (err) { console.error(err); } finally { setDeleting(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Interests</h1>
          <p className="text-xs text-foreground-muted">{total} {statusFilter ? statusFilter.toLowerCase() : ""} interests</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Cooled">Cooled</option>
            <option value="Fulfilled">Fulfilled</option>
            <option value="Dropped">Dropped</option>
          </select>
          {canEdit && (
            <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : interests.length === 0 ? (
        <EmptyState
          title="No interests found"
          description="Add what a lead or contact is looking for"
          icon={<Home className="h-10 w-10" />}
          action={canEdit ? <button onClick={openCreate} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">New Interest</button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Bed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Bath</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Furnishing</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Parent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {interests.map((interest) => (
                <tr key={interest.id}
                  onClick={() => navigate(`/interests/${interest.id}`)}
                  className={`border-b border-l-4 border-border-subtle cursor-pointer transition-colors hover:bg-background-secondary ${STATUS_ROW_BORDER[interest.status] ?? "border-l-neutral-300"}`}>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{interest.name}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{interest.propertyType ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{interest.bedrooms ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{interest.bathrooms ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{interest.furnishingPreference ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{interest.source ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={interest.status} /></td>
                  <td className="px-4 py-3 text-xs">
                    <a href={interest.parentType === "Contact" ? `/contacts/${interest.parentId}` : `/leads/${interest.parentId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-text hover:underline">
                      {interest.parentType}: {interest.parentName ?? interest.parentId.slice(0, 8)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(interest.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/interests/${interest.id}`); }} title="Edit"
                          className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); handleClone(interest.id); }} disabled={cloningId === interest.id} title="Clone"
                          className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground disabled:opacity-50">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(interest.id); }} title="Delete"
                          className="rounded-md p-1.5 text-error-500 transition-colors hover:bg-error-50 dark:hover:bg-error-950">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Previous</button>
          <span className="text-xs text-foreground-muted">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)} className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Next</button>
        </div>
      )}

      <ConfirmModal open={!!deleteTargetId} onClose={() => setDeleteTargetId(null)} onConfirm={handleDelete}
        title="Delete Interest" message="Are you sure you want to delete this interest? This cannot be undone."
        confirmLabel="Delete" destructive confirming={deleting} />

      <FormModal open={createOpen} onClose={() => setCreateOpen(false)} title="New Interest" onSubmit={handleCreate} submitLabel="Create" submitting={creating}>
        <FormField label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus"
            placeholder="e.g. 3BR Apartment Downtown"
          />
        </FormField>
        <FormField label="Parent (Lead or Contact)" required>
          <ParentPicker
            parentType={parentType}
            onParentTypeChange={setParentType}
            parentId={parentId}
            parentLabel={parentLabel}
            onSelect={(id, label) => { setParentId(id); setParentLabel(label); }}
          />
        </FormField>
        <InterestFormFields form={form} onChange={setForm} campaigns={campaigns} />
      </FormModal>
    </div>
  );
}
