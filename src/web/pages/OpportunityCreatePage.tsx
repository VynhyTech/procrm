import React, { useState } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { ArrowLeft } from "lucide-react";

export function OpportunityCreatePage() {
  const { basePath } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", stage: "LeadQualified", amount: "", probability: "", closeDate: "", source: "" });

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    try {
      const opp = await trpc.opportunities.create.mutate({
        name: form.name,
        stage: form.stage,
        amount: form.amount ? parseFloat(form.amount) : undefined,
        probability: form.probability ? parseInt(form.probability) : undefined,
        closeDate: form.closeDate || undefined,
        source: form.source || undefined,
      });
      navigate(`/opportunities/${opp.id}`);
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <button onClick={() => navigate("/opportunities")} className="mb-4 flex items-center gap-1 text-sm text-foreground-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Opportunities
      </button>
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create New Opportunity</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Opportunity Name <span className="text-error-500">*</span></label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Downtown Villa - John Smith" required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Stage</label>
            <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className={selectClass}>
              {["LeadQualified","InitialDiscussion","PropertyShared","SiteVisitScheduled","SiteVisitCompleted","Interested","Negotiation","BookingIntent","AgreementDrafted","AgreementSigned"].map((s) => (
                <option key={s} value={s}>{s.replace(/([A-Z])/g, " $1").trim()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Amount</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} placeholder="500000" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Probability (%)</label>
            <input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className={inputClass} placeholder="50" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Close Date</label>
            <input type="date" value={form.closeDate} onChange={(e) => setForm({ ...form, closeDate: e.target.value })} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Source</label>
          <input type="text" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputClass} placeholder="Referral, Walk-in, etc." />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => navigate("/opportunities")} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">{submitting ? "Creating..." : "Create Opportunity"}</button>
        </div>
      </form>
    </div>
  );
}
