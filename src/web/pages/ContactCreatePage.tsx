import React, { useState } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { ArrowLeft } from "lucide-react";

export function ContactCreatePage() {
  const { basePath } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    secondaryEmail: "", secondaryPhone: "", preferredContactMethod: "",
    lifecycleStage: "Prospect", contactType: "Individual",
    streetAddress: "", city: "", state: "", postalCode: "",
    source: "", title: "", department: "", notes: "",
    marketingConsent: "", importantDates: "", householdContext: "",
  });

  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) return;
    const errs: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email && !form.phone) { errs.email = "Email or phone required"; errs.phone = "Email or phone required"; }
    else if (form.email && !emailRegex.test(form.email.trim())) { errs.email = "Must include @ and domain (e.g. name@example.com)"; }
    if (form.secondaryEmail && !emailRegex.test(form.secondaryEmail.trim())) { errs.secondaryEmail = "Must include @ and domain (e.g. name@example.com)"; }
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); setError(null); return; }
    setFieldErrors({});
    setSubmitting(true); setError(null);
    try {
      const contact = await trpc.contacts.create.mutate({
        firstName: form.firstName, lastName: form.lastName,
        email: form.email || undefined, phone: form.phone || undefined,
        secondaryEmail: form.secondaryEmail || undefined, secondaryPhone: form.secondaryPhone || undefined,
        preferredContactMethod: form.preferredContactMethod || undefined,
        lifecycleStage: form.lifecycleStage, contactType: form.contactType,
        streetAddress: form.streetAddress || undefined, city: form.city || undefined,
        state: form.state || undefined, postalCode: form.postalCode || undefined,
        source: form.source || undefined, title: form.title || undefined,
        department: form.department || undefined, notes: form.notes || undefined,
        marketingConsent: form.marketingConsent || undefined,
        importantDates: form.importantDates || undefined, householdContext: form.householdContext || undefined,
      });
      navigate(`/contacts/${contact.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create contact";
      if (msg.toLowerCase().includes("email")) {
        setFieldErrors({ email: "Must include @ and domain (e.g. name@example.com)" });
      } else {
        setError(msg);
      }
    } finally { setSubmitting(false); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <button onClick={() => navigate("/contacts")} className="mb-4 flex items-center gap-1 text-sm text-foreground-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Contacts
      </button>
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create New Contact</h1>

      {error && <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs font-medium text-foreground-muted">Identity</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">First Name *</label><input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputClass} required /></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Last Name *</label><input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputClass} required /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">Email *</label><input type="text" value={form.email} onChange={(e) => { set("email", e.target.value); setFieldErrors((p) => { const n = { ...p }; delete n.email; delete n.phone; return n; }); }} className={fieldErrors.email ? `${inputClass} !border-error-500` : inputClass} placeholder="john@example.com" />{fieldErrors.email ? <p className="mt-0.5 text-2xs text-error-500">{fieldErrors.email}</p> : <p className="mt-0.5 text-2xs text-foreground-subtle">Email or phone required</p>}</div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Phone *</label><input type="text" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} placeholder="+1 555-0100" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">Secondary Email</label><input type="text" value={form.secondaryEmail} onChange={(e) => { set("secondaryEmail", e.target.value); setFieldErrors((p) => { const n = { ...p }; delete n.secondaryEmail; return n; }); }} className={fieldErrors.secondaryEmail ? `${inputClass} !border-error-500` : inputClass} />{fieldErrors.secondaryEmail && <p className="mt-0.5 text-2xs text-error-500">{fieldErrors.secondaryEmail}</p>}</div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Secondary Phone</label><input type="text" value={form.secondaryPhone} onChange={(e) => set("secondaryPhone", e.target.value)} className={inputClass} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">Preferred Contact</label>
            <select value={form.preferredContactMethod} onChange={(e) => set("preferredContactMethod", e.target.value)} className={selectClass}><option value="">Not specified</option><option value="Email">Email</option><option value="Phone">Phone</option><option value="SMS">SMS</option><option value="WhatsApp">WhatsApp</option></select></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Lifecycle Stage</label>
            <select value={form.lifecycleStage} onChange={(e) => set("lifecycleStage", e.target.value)} className={selectClass}><option value="Prospect">Prospect</option><option value="Customer">Customer</option></select></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Contact Type</label>
            <select value={form.contactType} onChange={(e) => set("contactType", e.target.value)} className={selectClass}><option value="Individual">Individual</option><option value="Developer">Developer</option><option value="Investor">Investor</option></select></div>
        </div>

        <p className="pt-2 text-xs font-medium text-foreground-muted">Address</p>
        <div><label className="mb-1 block text-sm font-medium text-foreground">Street</label><input type="text" value={form.streetAddress} onChange={(e) => set("streetAddress", e.target.value)} className={inputClass} /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">City</label><input type="text" value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">State</label><input type="text" value={form.state} onChange={(e) => set("state", e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Postal Code</label><input type="text" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} className={inputClass} /></div>
        </div>

        <p className="pt-2 text-xs font-medium text-foreground-muted">Professional & Source</p>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">Title</label><input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Department</label><input type="text" value={form.department} onChange={(e) => set("department", e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Source</label><input type="text" value={form.source} onChange={(e) => set("source", e.target.value)} className={inputClass} placeholder="Referral, Walk-in..." /></div>
        </div>

        <p className="pt-2 text-xs font-medium text-foreground-muted">Relationship</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">Important Dates</label><input type="text" value={form.importantDates} onChange={(e) => set("importantDates", e.target.value)} className={inputClass} placeholder="Birthday: Jan 15, Anniversary: Mar 20" /></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Household</label><input type="text" value={form.householdContext} onChange={(e) => set("householdContext", e.target.value)} className={inputClass} placeholder="Spouse: Jane, 2 kids" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1 block text-sm font-medium text-foreground">Marketing Consent</label>
            <select value={form.marketingConsent} onChange={(e) => set("marketingConsent", e.target.value)} className={selectClass}><option value="">Not set</option><option value="opt-in">Opt-in</option><option value="opt-out">Opt-out</option></select></div>
          <div><label className="mb-1 block text-sm font-medium text-foreground">Notes</label><input type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} placeholder="Free-form context..." /></div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => navigate("/contacts")} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">{submitting ? "Creating..." : "Create Contact"}</button>
        </div>
      </form>
    </div>
  );
}
