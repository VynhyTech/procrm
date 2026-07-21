import React, { useEffect, useState } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { ArrowLeft } from "lucide-react";

const SOURCES = ["Manual", "Referral", "Walk-in", "Open House", "Sphere", "Phone", "Website", "Facebook", "Google", "API", "Import"];

type CampaignOption = { id: string; name: string };

export function LeadCreatePage() {
  const { basePath } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sendToPool, setSendToPool] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredContactMethod: "",
    campaignId: "",
    notes: "",
    source: "",
  });

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  // Load campaigns for dropdown
  useEffect(() => {
    trpc.campaigns.list.query().then((r) => setCampaigns(r.campaigns.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: Record<string, string> = {};

    if (!form.firstName.trim()) errors.firstName = "First name is required";
    if (!form.lastName.trim()) errors.lastName = "Last name is required";
    if (!form.email.trim() && !form.phone.trim()) {
      errors.email = "Email or phone required";
      errors.phone = "Email or phone required";
    } else if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = "Must include @ and domain (e.g. name@example.com)";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    // Resolve campaign name from selected ID
    const selectedCampaign = campaigns.find((c) => c.id === form.campaignId);

    setSubmitting(true);
    try {
      const lead = await trpc.leads.create.mutate({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        preferredContactMethod: form.preferredContactMethod || undefined,
        campaignId: form.campaignId || undefined,
        campaignName: selectedCampaign?.name || undefined,
        notes: form.notes || undefined,
        source: form.source,
        intakeMode: sendToPool ? "pool_manual" : "manual",
      });
      if (lead.type === "contact_reinquiry") {
        navigate(`/contacts/${lead.contactId}`);
      } else {
        navigate(`/leads/${lead.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create lead";
      if (msg.toLowerCase().includes("email")) {
        setFieldErrors({ email: "Must include @ and domain (e.g. name@example.com)" });
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const errorInputClass = "w-full rounded-lg border border-error-500 bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-error-500";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <button onClick={() => navigate("/leads")} className="mb-4 flex items-center gap-1 text-sm text-foreground-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Leads
      </button>

      <h1 className="mb-6 text-lg font-semibold text-foreground">Create New Lead</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 dark:border-error-800 dark:bg-error-950">
          <p className="text-sm text-error-900 dark:text-error-100">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">First Name <span className="text-error-500">*</span></label>
            <input type="text" value={form.firstName} onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setFieldErrors((p) => { const n = { ...p }; delete n.firstName; return n; }); }} className={fieldErrors.firstName ? errorInputClass : inputClass} placeholder="John" />
            {fieldErrors.firstName && <p className="mt-1 text-2xs text-error-500">{fieldErrors.firstName}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Last Name <span className="text-error-500">*</span></label>
            <input type="text" value={form.lastName} onChange={(e) => { setForm({ ...form, lastName: e.target.value }); setFieldErrors((p) => { const n = { ...p }; delete n.lastName; return n; }); }} className={fieldErrors.lastName ? errorInputClass : inputClass} placeholder="Doe" />
            {fieldErrors.lastName && <p className="mt-1 text-2xs text-error-500">{fieldErrors.lastName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Email <span className="text-error-500">*</span></label>
            <input type="text" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((p) => { const n = { ...p }; delete n.email; delete n.phone; return n; }); }} className={fieldErrors.email ? errorInputClass : inputClass} placeholder="john@example.com" />
            {fieldErrors.email ? <p className="mt-1 text-2xs text-error-500">{fieldErrors.email}</p> : <p className="mt-1 text-2xs text-foreground-subtle">Email or phone required (at least one)</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Phone <span className="text-error-500">*</span></label>
            <input type="text" value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors((p) => { const n = { ...p }; delete n.email; delete n.phone; return n; }); }} className={fieldErrors.phone ? errorInputClass : inputClass} placeholder="+1 234 567 8900" />
            {fieldErrors.phone && <p className="mt-1 text-2xs text-error-500">{fieldErrors.phone}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Source</label>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={selectClass}>
              <option value="">Not specified</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Preferred Contact Method</label>
            <select value={form.preferredContactMethod} onChange={(e) => setForm({ ...form, preferredContactMethod: e.target.value })} className={selectClass}>
              <option value="">Not specified</option>
              <option value="Email">Email</option>
              <option value="Phone">Phone</option>
              <option value="SMS">SMS</option>
              <option value="WhatsApp">WhatsApp</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Campaign</label>
          <select value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })} className={selectClass}>
            <option value="">No campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {campaigns.length === 0 && <p className="mt-1 text-2xs text-foreground-subtle">No campaigns created yet — <a href="/campaigns" className="text-primary-text hover:underline">create one</a></p>}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={sendToPool} className="h-4 w-4 rounded border-input-border accent-primary-accent"
              onChange={(e) => setSendToPool(e.target.checked)}
            />
            <span>Send to pool instead of claiming</span>
          </label>
          <p className="mt-1 text-2xs text-foreground-subtle">If checked, the lead enters the shared pool for any agent to claim</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={`${inputClass} resize-none`} placeholder="Additional notes about this lead..." />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => navigate("/leads")} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">{submitting ? "Creating..." : "Create Lead"}</button>
        </div>
      </form>
    </div>
  );
}
