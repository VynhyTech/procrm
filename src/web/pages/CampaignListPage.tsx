import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { FormModal, FormField } from "../components/FormModal";
import { EmptyState } from "../components/EmptyState";
import { Plus, Pencil, Trash2, Megaphone } from "lucide-react";

type Campaign = Awaited<ReturnType<typeof trpc.campaigns.list.query>>["campaigns"][number];

const TYPES = ["Email", "Facebook", "Google", "LandingPage", "Event", "Referral"];

export function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "", status: "Active", startDate: "", endDate: "" });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try { const result = await trpc.campaigns.list.query({ limit: pageSize, offset: page * pageSize }); setCampaigns(result.campaigns); setTotal(result.total); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (editId) {
        await trpc.campaigns.update.mutate({ id: editId, name: form.name, type: form.type || null, status: form.status, startDate: form.startDate || null, endDate: form.endDate || null });
      } else {
        await trpc.campaigns.create.mutate({ name: form.name, type: form.type || undefined, status: form.status, startDate: form.startDate || undefined, endDate: form.endDate || undefined });
      }
      setModalOpen(false);
      setEditId(null);
      setForm({ name: "", type: "", status: "Active", startDate: "", endDate: "" });
      fetchCampaigns();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await trpc.campaigns.delete.mutate({ id }); fetchCampaigns(); } catch (err) { console.error(err); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Campaigns</h1>
          <p className="text-xs text-foreground-muted">{total} total</p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ name: "", type: "", status: "Active", startDate: "", endDate: "" }); setModalOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Create your first marketing campaign" icon={<Megaphone className="h-10 w-10" />}
          action={<button onClick={() => setModalOpen(true)} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Create Campaign</button>} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Start</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">End</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Updated By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Updated</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border-subtle transition-colors hover:bg-background-secondary">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{c.type ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{c.startDate ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{c.endDate ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{c.creator?.name ?? c.creator?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{c.updater?.name ?? c.updater?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(c.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditId(c.id); setForm({ name: c.name, type: c.type ?? "", status: c.status, startDate: c.startDate ?? "", endDate: c.endDate ?? "" }); setModalOpen(true); }}
                        className="rounded-md p-1.5 text-foreground-subtle transition-colors hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(c.id)} className="rounded-md p-1.5 text-foreground-subtle transition-colors hover:text-error-500"><Trash2 className="h-3.5 w-3.5" /></button>
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

      <FormModal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Campaign" : "Create Campaign"} onSubmit={handleSave} submitLabel={editId ? "Save" : "Create"} submitting={saving}>
        <FormField label="Campaign Name" required>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Summer Property Showcase" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={selectClass}>
              <option value="">Select...</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectClass}>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Completed">Completed</option>
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Start Date">
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} />
          </FormField>
          <FormField label="End Date">
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} />
          </FormField>
        </div>
      </FormModal>
    </div>
  );
}
