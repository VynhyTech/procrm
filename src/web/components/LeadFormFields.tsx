import React from "react";
import { FormField } from "./FormModal";

export interface LeadFieldsForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  preferredContactMethod: string;
  campaignName: string;
  notes: string;
}

export const EMPTY_LEAD_FORM: LeadFieldsForm = {
  firstName: "", lastName: "", email: "", phone: "",
  source: "", preferredContactMethod: "", campaignName: "", notes: "",
};

const SOURCES = ["", "Manual", "Referral", "Walk-in", "Open House", "Sphere", "Phone", "Website", "Facebook", "Google", "API", "Import"];
const CONTACT_METHODS = ["", "Email", "Phone", "SMS", "WhatsApp"];

interface LeadFormFieldsProps {
  form: LeadFieldsForm;
  onChange: (form: LeadFieldsForm) => void;
}

export function LeadFormFields({ form, onChange }: LeadFormFieldsProps) {
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const set = (patch: Partial<LeadFieldsForm>) => onChange({ ...form, ...patch });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="First Name" required>
          <input type="text" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} className={inputClass} autoFocus />
        </FormField>
        <FormField label="Last Name" required>
          <input type="text" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} className={inputClass} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Email">
          <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="Phone">
          <input type="text" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputClass} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Source">
          <select value={form.source} onChange={(e) => set({ source: e.target.value })} className={selectClass}>
            {SOURCES.map((s) => <option key={s} value={s}>{s || "Not specified"}</option>)}
          </select>
        </FormField>
        <FormField label="Preferred Contact">
          <select value={form.preferredContactMethod} onChange={(e) => set({ preferredContactMethod: e.target.value })} className={selectClass}>
            {CONTACT_METHODS.map((m) => <option key={m} value={m}>{m || "Not specified"}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Campaign">
        <input type="text" value={form.campaignName} onChange={(e) => set({ campaignName: e.target.value })} className={inputClass} placeholder="Spring Open House..." />
      </FormField>
      <FormField label="Notes">
        <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} className={`resize-none ${inputClass}`} placeholder="Free-form context..." />
      </FormField>
    </>
  );
}
