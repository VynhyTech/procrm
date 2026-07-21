import React from "react";
import { FormField } from "./FormModal";

export interface InterestFieldsForm {
  propertyType: string;
  budgetMin: string;
  budgetMax: string;
  locationArea: string;
  bedrooms: string;
  bathrooms: string;
  furnishingPreference: string;
  moveInTimeline: string;
  otherDetail: string;
  campaignId: string;
}

const PROPERTY_TYPES = ["Apartment", "Villa", "Townhouse", "Penthouse", "Plot", "Commercial", "Other"];

interface InterestFormFieldsProps {
  form: InterestFieldsForm;
  onChange: (form: InterestFieldsForm) => void;
  campaigns: Array<{ id: string; name: string }>;
}

export function InterestFormFields({ form, onChange, campaigns }: InterestFormFieldsProps) {
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const set = (patch: Partial<InterestFieldsForm>) => onChange({ ...form, ...patch });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Property Type">
          <select value={form.propertyType} onChange={(e) => set({ propertyType: e.target.value })} className={selectClass}>
            <option value="">Any</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Location / Area">
          <input type="text" value={form.locationArea} onChange={(e) => set({ locationArea: e.target.value })} className={inputClass} placeholder="Downtown, Suburbs..." />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Budget Min">
          <input type="number" value={form.budgetMin} onChange={(e) => set({ budgetMin: e.target.value })} className={inputClass} placeholder="300000" />
        </FormField>
        <FormField label="Budget Max">
          <input type="number" value={form.budgetMax} onChange={(e) => set({ budgetMax: e.target.value })} className={inputClass} placeholder="500000" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Bedrooms">
          <input type="number" value={form.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} className={inputClass} placeholder="3" />
        </FormField>
        <FormField label="Bathrooms">
          <input type="number" value={form.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} className={inputClass} placeholder="2" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Furnishing">
          <select value={form.furnishingPreference} onChange={(e) => set({ furnishingPreference: e.target.value })} className={selectClass}>
            <option value="">Any</option>
            <option value="Furnished">Furnished</option>
            <option value="Semi">Semi-furnished</option>
            <option value="Unfurnished">Unfurnished</option>
          </select>
        </FormField>
        <FormField label="Move-in Timeline">
          <select value={form.moveInTimeline} onChange={(e) => set({ moveInTimeline: e.target.value })} className={selectClass}>
            <option value="">Not specified</option>
            <option value="Immediate">Immediate</option>
            <option value="1 month">1 month</option>
            <option value="3 months">3 months</option>
            <option value="6 months">6 months</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Notes / Other Details">
          <input type="text" value={form.otherDetail} onChange={(e) => set({ otherDetail: e.target.value })} className={inputClass} placeholder="Pool, garden, sea view..." />
        </FormField>
        {campaigns.length > 0 && (
          <FormField label="Campaign">
            <select value={form.campaignId} onChange={(e) => set({ campaignId: e.target.value })} className={selectClass}>
              <option value="">None</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
        )}
      </div>
    </>
  );
}

export const EMPTY_INTEREST_FORM: InterestFieldsForm = {
  propertyType: "", budgetMin: "", budgetMax: "", locationArea: "", bedrooms: "", bathrooms: "",
  furnishingPreference: "", moveInTimeline: "", otherDetail: "", campaignId: "",
};
