import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { FormModal, FormField } from "../components/FormModal";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Plus, Download, Shield, Clock, Trash2 } from "lucide-react";

type DeletionReq = Awaited<ReturnType<typeof trpc.compliance.getDeletionRequests.query>>[number];
type RetentionPolicy = Awaited<ReturnType<typeof trpc.compliance.getRetentionPolicies.query>>[number];

const RETENTION_ENTITIES = ["Lead", "Contact", "Opportunity", "AuditLog"];

export function CompliancePage() {
  const [activeTab, setActiveTab] = useState<"deletion" | "export" | "retention">("deletion");

  return (
    <div className="p-6">
      <h1 className="mb-2 text-lg font-semibold text-foreground">Compliance & Privacy</h1>
      <p className="mb-6 text-xs text-foreground-muted">GDPR data management, deletion requests, and retention policies</p>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-input-border p-0.5">
        {[
          { key: "deletion", label: "Deletion Requests", icon: <Trash2 className="h-3.5 w-3.5" /> },
          { key: "export", label: "Data Export", icon: <Download className="h-3.5 w-3.5" /> },
          { key: "retention", label: "Retention Policies", icon: <Clock className="h-3.5 w-3.5" /> },
        ].map((tab) => (
          <button key={tab.key} onClick={() => { const k = tab.key; if (k === "deletion" || k === "export" || k === "retention") setActiveTab(k); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "deletion" && <DeletionRequestsTab />}
      {activeTab === "export" && <DataExportTab />}
      {activeTab === "retention" && <RetentionPoliciesTab />}
    </div>
  );
}

function DeletionRequestsTab() {
  const [requests, setRequests] = useState<DeletionReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subjectEmail: "", subjectName: "", reason: "" });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try { setRequests(await trpc.compliance.getDeletionRequests.query({})); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleCreate = async () => {
    if (!form.subjectEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.subjectEmail.trim())) { setEmailError("Must include @ and domain (e.g. name@example.com)"); return; }
    setEmailError(null);
    setSubmitting(true);
    try {
      await trpc.compliance.createDeletionRequest.mutate(form);
      setCreateOpen(false);
      setForm({ subjectEmail: "", subjectName: "", reason: "" });
      fetchRequests();
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [impact, setImpact] = useState<{ leads: number; contacts: number; messages: number; activities: number; comments: number; total: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  const handlePreview = async (id: string) => {
    setPreviewId(id);
    setLoadingImpact(true);
    try {
      const result = await trpc.compliance.previewDeletionImpact.query({ id });
      setImpact(result);
    } catch (err) { console.error(err); } finally { setLoadingImpact(false); }
  };

  const handleProcess = async () => {
    if (!previewId) return;
    setProcessing(previewId);
    try {
      await trpc.compliance.processDeletionRequest.mutate({ id: previewId });
      setPreviewId(null);
      setImpact(null);
      fetchRequests();
    } catch (err) { console.error(err); } finally { setProcessing(null); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-foreground-muted">Manage GDPR right-to-erasure requests</p>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
          <Plus className="h-3.5 w-3.5" /> New Request
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : requests.length === 0 ? (
        <EmptyState title="No deletion requests" icon={<Shield className="h-10 w-10" />} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Requested By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-border-subtle">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{req.subjectEmail}</p>
                    {req.subjectName && <p className="text-xs text-foreground-muted">{req.subjectName}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{req.requester?.name ?? req.requester?.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{new Date(req.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {req.status === "pending" && (
                      <button onClick={() => handlePreview(req.id)}
                        className="text-xs font-medium text-error-500 transition-colors hover:text-error-700">
                        Review & Process
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormModal open={createOpen} onClose={() => setCreateOpen(false)} title="New Deletion Request" onSubmit={handleCreate} submitLabel="Submit Request" submitting={submitting}>
        <FormField label="Subject Email" required>
          <input type="text" value={form.subjectEmail} onChange={(e) => { setForm({ ...form, subjectEmail: e.target.value }); setEmailError(null); }} className={emailError ? `${inputClass} !border-error-500` : inputClass} placeholder="person@example.com" />
          {emailError && <p className="mt-0.5 text-2xs text-error-500">{emailError}</p>}
        </FormField>
        <FormField label="Subject Name">
          <input type="text" value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="Reason">
          <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} placeholder="GDPR request" />
        </FormField>
      </FormModal>

      {/* Impact Preview Modal */}
      {previewId && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => { setPreviewId(null); setImpact(null); }}>
          <div className="mx-4 w-full max-w-md animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-semibold text-foreground">Deletion Impact Preview</h3>
            <p className="mb-4 text-xs text-foreground-muted">The following data will be permanently deleted:</p>
            {loadingImpact ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-6 rounded" />)}</div>
            ) : impact ? (
              <div className="mb-4 space-y-2 rounded-lg bg-error-50 p-4 dark:bg-error-950">
                <div className="flex justify-between text-sm"><span className="text-error-900 dark:text-error-100">Leads</span><span className="font-bold text-error-900 dark:text-error-100">{impact.leads}</span></div>
                <div className="flex justify-between text-sm"><span className="text-error-900 dark:text-error-100">Contacts</span><span className="font-bold text-error-900 dark:text-error-100">{impact.contacts}</span></div>
                <div className="flex justify-between text-sm"><span className="text-error-900 dark:text-error-100">Messages</span><span className="font-bold text-error-900 dark:text-error-100">{impact.messages}</span></div>
                <div className="flex justify-between text-sm"><span className="text-error-900 dark:text-error-100">Activities</span><span className="font-bold text-error-900 dark:text-error-100">{impact.activities}</span></div>
                <div className="flex justify-between text-sm"><span className="text-error-900 dark:text-error-100">Comments</span><span className="font-bold text-error-900 dark:text-error-100">{impact.comments}</span></div>
                <div className="mt-2 flex justify-between border-t border-error-200 pt-2 text-sm dark:border-error-800"><span className="font-bold text-error-900 dark:text-error-100">Total Records</span><span className="font-bold text-error-900 dark:text-error-100">{impact.total}</span></div>
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setPreviewId(null); setImpact(null); }} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleProcess} disabled={!!processing || loadingImpact}
                className="rounded-lg bg-button-destructive-bg px-4 py-2 text-sm font-medium text-button-destructive-text transition-colors hover:bg-button-destructive-hover disabled:opacity-50">
                {processing ? "Deleting..." : "Confirm Deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DataExportTab() {
  const [email, setEmail] = useState("");
  const [exportEmailError, setExportEmailError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<Record<string, unknown> | null>(null);

  const handleExport = async () => {
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setExportEmailError("Must include @ and domain (e.g. name@example.com)"); return; }
    setExportEmailError(null);
    setExporting(true);
    try {
      const data = await trpc.compliance.exportUserData.query({ email });
      setExportData(data);
    } catch (err) { console.error(err); } finally { setExporting(false); }
  };

  const handleDownload = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-export-${email}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div>
      <p className="mb-4 text-sm text-foreground-muted">Export all data associated with an email address (GDPR right of access)</p>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Email Address</label>
          <input type="text" value={email} onChange={(e) => { setEmail(e.target.value); setExportEmailError(null); }} className={exportEmailError ? `${inputClass} !border-error-500` : inputClass} placeholder="person@example.com" />
          {exportEmailError && <p className="mt-0.5 text-2xs text-error-500">{exportEmailError}</p>}
        </div>
        <button onClick={handleExport} disabled={exporting || !email}
          className="shrink-0 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
          {exporting ? "Exporting..." : "Export Data"}
        </button>
      </div>

      {exportData && (
        <div className="mt-6 rounded-xl border border-card-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Export Results</h2>
            <button onClick={handleDownload} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-xs font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover">
              <Download className="h-3.5 w-3.5" /> Download JSON
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted">Leads: {Array.isArray(exportData.leads) ? exportData.leads.length : 0} records</p>
            <p className="text-xs text-foreground-muted">Contacts: {Array.isArray(exportData.contacts) ? exportData.contacts.length : 0} records</p>
            <p className="text-xs text-foreground-muted">Activities: {Array.isArray(exportData.activities) ? exportData.activities.length : 0} records</p>
          </div>
          <div className="mt-3 max-h-48 overflow-auto rounded-lg bg-background-secondary p-3">
            <pre className="text-2xs text-foreground-muted">{JSON.stringify(exportData, null, 2).slice(0, 2000)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function RetentionPoliciesTab() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEntity, setEditEntity] = useState("");
  const [editDays, setEditDays] = useState("365");
  const [saving, setSaving] = useState(false);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try { setPolicies(await trpc.compliance.getRetentionPolicies.query()); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleSave = async () => {
    if (!editEntity || !editDays) return;
    setSaving(true);
    try {
      await trpc.compliance.upsertRetentionPolicy.mutate({
        entityType: editEntity,
        retentionDays: parseInt(editDays),
        isActive: true,
      });
      setEditEntity("");
      setEditDays("365");
      fetchPolicies();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const selectClass = "rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const inputClass = "w-24 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div>
      <p className="mb-4 text-sm text-foreground-muted">Configure how long data is retained per entity type</p>

      {/* Add/Edit */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Entity Type</label>
          <select value={editEntity} onChange={(e) => setEditEntity(e.target.value)} className={selectClass}>
            <option value="">Select...</option>
            {RETENTION_ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Retention (days)</label>
          <input type="number" value={editDays} onChange={(e) => setEditDays(e.target.value)} className={inputClass} min="30" max="3650" />
        </div>
        <button onClick={handleSave} disabled={saving || !editEntity}
          className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
          {saving ? "Saving..." : "Save Policy"}
        </button>
      </div>

      {/* Existing policies */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : policies.length === 0 ? (
        <EmptyState title="No retention policies configured" description="Set policies to automatically manage data lifecycle" icon={<Clock className="h-10 w-10" />} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Entity Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Retention Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-border-subtle">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{p.entityType}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{p.retentionDays} days ({Math.round(p.retentionDays / 365 * 10) / 10} years)</td>
                  <td className="px-4 py-3"><StatusBadge status={p.isActive ? "active" : "inactive"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
