import React from "react";
import { FormField } from "./FormModal";

export interface ContactFieldsForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  secondaryEmail: string;
  secondaryPhone: string;
  preferredContactMethod: string;
  lifecycleStage: string;
  engagementStatus: string;
  contactType: string;
  title: string;
  department: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  source: string;
  campaignName: string;
  importantDates: string;
  householdContext: string;
  marketingConsent: string;
  notes: string;
}

export const EMPTY_CONTACT_FORM: ContactFieldsForm = {
  firstName: "", lastName: "", email: "", phone: "",
  secondaryEmail: "", secondaryPhone: "", preferredContactMethod: "",
  lifecycleStage: "Prospect", engagementStatus: "Active", contactType: "Individual",
  title: "", department: "",
  streetAddress: "", city: "", state: "", postalCode: "",
  source: "", campaignName: "",
  importantDates: "", householdContext: "", marketingConsent: "",
  notes: "",
};

const CONTACT_METHODS = ["", "Email", "Phone", "SMS", "WhatsApp"];
const LIFECYCLE_STAGES = ["Prospect", "Customer"];
const ENGAGEMENT_STATUSES = ["Active", "Inactive"];
const CONTACT_TYPES = ["Individual", "Developer", "Investor"];
const CONSENT_OPTIONS = ["", "opt-in", "opt-out"];

interface ContactFormFieldsProps {
  form: ContactFieldsForm;
  onChange: (form: ContactFieldsForm) => void;
}

export function ContactFormFields({ form, onChange }: ContactFormFieldsProps) {
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const set = (patch: Partial<ContactFieldsForm>) => onChange({ ...form, ...patch });

  return (
    <>
      <p className="text-xs font-medium text-foreground-muted">Identity</p>
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
        <FormField label="Secondary Email">
          <input type="email" value={form.secondaryEmail} onChange={(e) => set({ secondaryEmail: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="Secondary Phone">
          <input type="text" value={form.secondaryPhone} onChange={(e) => set({ secondaryPhone: e.target.value })} className={inputClass} />
        </FormField>
      </div>

      <p className="pt-2 text-xs font-medium text-foreground-muted">Classification</p>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Preferred Contact">
          <select value={form.preferredContactMethod} onChange={(e) => set({ preferredContactMethod: e.target.value })} className={selectClass}>
            {CONTACT_METHODS.map((m) => <option key={m} value={m}>{m || "Not specified"}</option>)}
          </select>
        </FormField>
        <FormField label="Lifecycle Stage">
          <select value={form.lifecycleStage} onChange={(e) => set({ lifecycleStage: e.target.value })} className={selectClass}>
            {LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Engagement">
          <select value={form.engagementStatus} onChange={(e) => set({ engagementStatus: e.target.value })} className={selectClass}>
            {ENGAGEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Type">
          <select value={form.contactType} onChange={(e) => set({ contactType: e.target.value })} className={selectClass}>
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Title">
          <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="Department">
          <input type="text" value={form.department} onChange={(e) => set({ department: e.target.value })} className={inputClass} />
        </FormField>
      </div>

      <p className="pt-2 text-xs font-medium text-foreground-muted">Address</p>
      <FormField label="Street">
        <input type="text" value={form.streetAddress} onChange={(e) => set({ streetAddress: e.target.value })} className={inputClass} />
      </FormField>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="City">
          <input type="text" value={form.city} onChange={(e) => set({ city: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="State">
          <input type="text" value={form.state} onChange={(e) => set({ state: e.target.value })} className={inputClass} />
        </FormField>
        <FormField label="Postal Code">
          <input type="text" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} className={inputClass} />
        </FormField>
      </div>

      <p className="pt-2 text-xs font-medium text-foreground-muted">Attribution & Notes</p>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Source">
          <input type="text" value={form.source} onChange={(e) => set({ source: e.target.value })} className={inputClass} placeholder="Referral, Walk-in..." />
        </FormField>
        <FormField label="Campaign">
          <input type="text" value={form.campaignName} onChange={(e) => set({ campaignName: e.target.value })} className={inputClass} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Important Dates">
          <input type="text" value={form.importantDates} onChange={(e) => set({ importantDates: e.target.value })} className={inputClass} placeholder="Birthday: Jan 15..." />
        </FormField>
        <FormField label="Household">
          <input type="text" value={form.householdContext} onChange={(e) => set({ householdContext: e.target.value })} className={inputClass} placeholder="Spouse: Jane, 2 kids" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Marketing Consent">
          <select value={form.marketingConsent} onChange={(e) => set({ marketingConsent: e.target.value })} className={selectClass}>
            {CONSENT_OPTIONS.map((c) => <option key={c} value={c}>{c || "Not set"}</option>)}
          </select>
        </FormField>
        <FormField label="Notes">
          <input type="text" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} placeholder="Free-form context..." />
        </FormField>
      </div>
    </>
  );
}
