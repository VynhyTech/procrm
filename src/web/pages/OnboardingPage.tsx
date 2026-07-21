import React, { useState } from "react";
import { useApp, useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { Building, CheckCircle, Mail } from "lucide-react";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

export function OnboardingPage() {
  const { basePath } = useApp();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [form, setForm] = useState({
    firstName: user?.name?.split(" ")[0] ?? "",
    lastName: user?.name?.split(" ").slice(1).join(" ") ?? "",
    email: user?.email ?? "",
    phone: "",
    companyName: "",
    industry: "Real Estate",
    companySize: "",
    country: "",
    city: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { setError("First and last name are required"); return; }
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Invalid email format"); return; }
    if (!form.companyName.trim()) { setError("Company name is required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      await trpc.onboarding.register.mutate({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        companyName: form.companyName,
        industry: form.industry,
        companySize: form.companySize || undefined,
        country: form.country || undefined,
        city: form.city || undefined,
      });
      setOrgName(form.companyName);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2.5 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2.5 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  // ====== SUCCESS SCREEN ======
  if (success) {
    const trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-50 dark:bg-success-950">
            <CheckCircle className="h-8 w-8 text-success-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to {orgName}!</h1>
          <p className="mt-2 text-sm text-foreground-muted">Your workspace has been created successfully.</p>

          <div className="mt-6 rounded-2xl border border-card-border bg-card p-6 shadow-card text-left space-y-4">
            <div className="rounded-lg bg-info-50 px-4 py-3 dark:bg-info-950">
              <p className="text-sm font-medium text-info-700 dark:text-info-300">14-Day Free Trial</p>
              <p className="mt-0.5 text-xs text-info-600 dark:text-info-400">Your trial is active until {trialEndDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. All features are available during the trial.</p>
            </div>

            <div>
              <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">What you can do</p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2 text-sm text-foreground-muted"><CheckCircle className="h-3.5 w-3.5 text-success-500 shrink-0" /> Manage leads, contacts, and opportunities</li>
                <li className="flex items-center gap-2 text-sm text-foreground-muted"><CheckCircle className="h-3.5 w-3.5 text-success-500 shrink-0" /> Track interests and property requirements</li>
                <li className="flex items-center gap-2 text-sm text-foreground-muted"><CheckCircle className="h-3.5 w-3.5 text-success-500 shrink-0" /> Invite your team and assign roles</li>
                <li className="flex items-center gap-2 text-sm text-foreground-muted"><CheckCircle className="h-3.5 w-3.5 text-success-500 shrink-0" /> Send SMS, Email, and WhatsApp messages</li>
                <li className="flex items-center gap-2 text-sm text-foreground-muted"><CheckCircle className="h-3.5 w-3.5 text-success-500 shrink-0" /> Build reports and track agent performance</li>
              </ul>
            </div>

            <div className="rounded-lg bg-background-secondary px-4 py-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-foreground-subtle" />
                <div>
                  <p className="text-xs font-medium text-foreground">Confirmation email</p>
                  <p className="text-2xs text-foreground-muted">A welcome email will be sent to <span className="font-medium">{form.email}</span> once our email service is connected.</p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => { window.location.href = basePath + "/"; }}
            className="mt-6 w-full rounded-lg bg-button-primary-bg py-2.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ====== ONBOARDING FORM ======
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-950">
            <Building className="h-7 w-7 text-primary-text" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set up your workspace</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Welcome{user?.name ? `, ${user.name}` : ""}! Tell us about your company to get started.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-card-border bg-card p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">Your Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">First Name <span className="text-error-500">*</span></label>
                <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} placeholder="John" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Last Name <span className="text-error-500">*</span></label>
                <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} placeholder="Smith" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Email <span className="text-error-500">*</span></label>
                <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="john@company.com" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Phone</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+1 555-0100" />
              </div>
            </div>

            <div className="my-2 border-t border-border" />
            <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">Company</p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Company Name <span className="text-error-500">*</span></label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className={inputClass}
                placeholder="ABC Realty"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Industry</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  className={inputClass}
                  placeholder="Real Estate"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Company Size</label>
                <select
                  value={form.companySize}
                  onChange={(e) => setForm({ ...form, companySize: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Select...</option>
                  {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Country</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className={inputClass}
                  placeholder="United Arab Emirates"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className={inputClass}
                  placeholder="Dubai"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !form.companyName.trim()}
              className="w-full rounded-lg bg-button-primary-bg py-2.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50"
            >
              {submitting ? "Setting up..." : "Get Started"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-foreground-subtle">
          By continuing, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
