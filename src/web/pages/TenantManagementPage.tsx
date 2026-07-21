import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { FormModal, FormField } from "../components/FormModal";
import { EmptyState } from "../components/EmptyState";
import { Plus, Shield, Copy, Check, ShieldCheck } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";

type Tenant = Awaited<ReturnType<typeof trpc.tenants.list.query>>[number];
type ScopeItem = Awaited<ReturnType<typeof trpc.tenants.getAllScopes.query>>[number];

const PLANS = ["standard", "premium", "enterprise"];
const COMPANY_SIZES = ["", "1-10", "11-50", "51-200", "201-500", "500+"];

export function TenantManagementPage() {
  const { basePath } = useApp();
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ name: "", legalName: "", industry: "", companySize: "", website: "", phone: "", email: "", streetAddress: "", city: "", state: "", postalCode: "", country: "", subscriptionPlan: "standard", maxUsers: "", billingEmail: "", taxId: "", externalId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Permissions management
  const [permsTenantId, setPermsTenantId] = useState<string | null>(null);
  const [allOrgScopes, setAllOrgScopes] = useState<ScopeItem[]>([]);
  const [allowedScopeIds, setAllowedScopeIds] = useState<Set<string>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try { setTenants(await trpc.tenants.list.query()); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const resetForm = () => setForm({ name: "", legalName: "", industry: "", companySize: "", website: "", phone: "", email: "", streetAddress: "", city: "", state: "", postalCode: "", country: "", subscriptionPlan: "standard", maxUsers: "", billingEmail: "", taxId: "", externalId: "" });

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setForm({
      name: t.name, legalName: t.legalName ?? "", industry: t.industry ?? "", companySize: t.companySize ?? "",
      website: t.website ?? "", phone: t.phone ?? "", email: t.email ?? "",
      streetAddress: t.streetAddress ?? "", city: t.city ?? "", state: t.state ?? "",
      postalCode: t.postalCode ?? "", country: t.country ?? "",
      subscriptionPlan: t.subscriptionPlan, maxUsers: t.maxUsers ? String(t.maxUsers) : "",
      billingEmail: t.billingEmail ?? "", taxId: t.taxId ?? "", externalId: t.externalId ?? "",
    });
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSubmitting(true);
    try {
      if (editTenant) {
        await trpc.tenants.update.mutate({
          id: editTenant.id, name: form.name,
          legalName: form.legalName || null, industry: form.industry || null,
          companySize: form.companySize || null, website: form.website || null,
          phone: form.phone || null, email: form.email || null,
          streetAddress: form.streetAddress || null, city: form.city || null,
          state: form.state || null, postalCode: form.postalCode || null,
          country: form.country || null, subscriptionPlan: form.subscriptionPlan,
          maxUsers: form.maxUsers ? parseInt(form.maxUsers) : null,
          billingEmail: form.billingEmail || null, taxId: form.taxId || null,
          externalId: form.externalId || null,
        });
      } else {
        await trpc.tenants.create.mutate({
          name: form.name, legalName: form.legalName || undefined,
          industry: form.industry || undefined, companySize: form.companySize || undefined,
          website: form.website || undefined, phone: form.phone || undefined,
          email: form.email || undefined, streetAddress: form.streetAddress || undefined,
          city: form.city || undefined, state: form.state || undefined,
          postalCode: form.postalCode || undefined, country: form.country || undefined,
          subscriptionPlan: form.subscriptionPlan,
          maxUsers: form.maxUsers ? parseInt(form.maxUsers) : undefined,
          billingEmail: form.billingEmail || undefined, taxId: form.taxId || undefined,
        });
      }
      setCreateOpen(false); setEditTenant(null); resetForm(); fetchTenants();
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const handleSuspend = async () => {
    if (!suspendId) return;
    setSuspending(true);
    try { await trpc.tenants.suspend.mutate({ id: suspendId }); setSuspendId(null); fetchTenants(); }
    catch (err) { console.error(err); } finally { setSuspending(false); }
  };

  const handleActivate = async (id: string) => {
    try { await trpc.tenants.update.mutate({ id, status: "active" }); fetchTenants(); }
    catch (err) { console.error(err); }
  };

  const copyId = (id: string) => { navigator.clipboard.writeText(id); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

  const openPerms = async (orgId: string) => {
    setPermsTenantId(orgId);
    setPermsLoading(true);
    try {
      const [scopes, allowed] = await Promise.all([
        trpc.tenants.getAllScopes.query(),
        trpc.tenants.getTenantScopes.query({ orgId }),
      ]);
      setAllOrgScopes(scopes);
      setAllowedScopeIds(new Set(allowed));
    } catch (err) { console.error(err); } finally { setPermsLoading(false); }
  };

  const togglePermsScope = (scopeId: string) => {
    setAllowedScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId); else next.add(scopeId);
      return next;
    });
  };

  const togglePermsCategory = (categoryScopes: ScopeItem[]) => {
    const allSelected = categoryScopes.every((s) => allowedScopeIds.has(s.id));
    setAllowedScopeIds((prev) => {
      const next = new Set(prev);
      categoryScopes.forEach((s) => { if (allSelected) next.delete(s.id); else next.add(s.id); });
      return next;
    });
  };

  const handleSavePerms = async () => {
    if (!permsTenantId) return;
    setPermsSaving(true);
    try {
      await trpc.tenants.setTenantScopes.mutate({ orgId: permsTenantId, scopeIds: [...allowedScopeIds] });
      setPermsTenantId(null);
    } catch (err) { console.error(err); } finally { setPermsSaving(false); }
  };

  // Group org scopes by category for the permissions modal
  const permsScopeGroups = new Map<string, ScopeItem[]>();
  allOrgScopes.forEach((s) => {
    const category = s.name.split(":")[0];
    if (!permsScopeGroups.has(category)) permsScopeGroups.set(category, []);
    permsScopeGroups.get(category)?.push(s);
  });

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  const isEditing = !!editTenant;
  const modalOpen = createOpen || isEditing;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Tenant Management</h1>
        <button onClick={() => { resetForm(); setCreateOpen(true); }} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
          <Plus className="h-4 w-4" /> New Tenant
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : tenants.length === 0 ? (
        <EmptyState title="No tenants" description="Create your first tenant to get started" icon={<Shield className="h-10 w-10" />} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Org ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Members</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">City</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-border-subtle transition-colors hover:bg-background-secondary">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="text-2xs font-mono text-foreground-muted">{t.id.slice(0, 12)}...</span>
                      <button onClick={() => copyId(t.id)} className="text-foreground-subtle hover:text-foreground">
                        {copiedId === t.id ? <Check className="h-3 w-3 text-success-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/platform/tenants/${t.id}`)} className="text-sm font-medium text-primary-text hover:underline">{t.name}</button>
                    {t.legalName && <p className="text-2xs text-foreground-subtle">{t.legalName}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{t.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted capitalize">{t.subscriptionPlan}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{t._count.members}{t.maxUsers ? ` / ${t.maxUsers}` : ""}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{t.city ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{t.email ?? t.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openPerms(t.id)} className="flex items-center gap-0.5 text-xs text-info-600 dark:text-info-400 hover:underline">
                        <ShieldCheck className="h-3 w-3" /> Permissions
                      </button>
                      <button onClick={() => openEdit(t)} className="text-xs text-primary-text hover:underline">Edit</button>
                      {t.status === "active" ? (
                        <button onClick={() => setSuspendId(t.id)} className="text-xs text-error-500 transition-colors hover:text-error-700">Suspend</button>
                      ) : (
                        <button onClick={() => handleActivate(t.id)} className="text-xs text-success-500 transition-colors hover:text-success-700">Activate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <FormModal open={modalOpen} onClose={() => { setCreateOpen(false); setEditTenant(null); resetForm(); }} title={isEditing ? "Edit Tenant" : "Create Tenant"} onSubmit={handleSave} submitLabel={isEditing ? "Save" : "Create"} submitting={submitting}>
        {isEditing && (
          <div className="rounded-lg bg-background-secondary px-3 py-2 mb-2">
            <p className="text-2xs text-foreground-subtle">Org ID</p>
            <div className="flex items-center gap-1">
              <p className="text-xs font-mono text-foreground">{editTenant?.id}</p>
              <button onClick={() => editTenant && copyId(editTenant.id)} className="text-foreground-subtle hover:text-foreground">
                {copiedId === editTenant?.id ? <Check className="h-3 w-3 text-success-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">Company</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Company Name" required><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="ABC Realty" /></FormField>
          <FormField label="Legal Name"><input type="text" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className={inputClass} placeholder="ABC Realty LLC" /></FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Industry"><input type="text" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={inputClass} placeholder="Real Estate" /></FormField>
          <FormField label="Company Size"><select value={form.companySize} onChange={(e) => setForm({ ...form, companySize: e.target.value })} className={selectClass}>{COMPANY_SIZES.map((s) => <option key={s} value={s}>{s || "Select..."}</option>)}</select></FormField>
          <FormField label="Website"><input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={inputClass} placeholder="https://..." /></FormField>
        </div>

        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2 mt-4">Contact</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email"><input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="info@company.com" /></FormField>
          <FormField label="Phone"><input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+1 555-0100" /></FormField>
        </div>

        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2 mt-4">Address</p>
        <FormField label="Street"><input type="text" value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} className={inputClass} /></FormField>
        <div className="grid grid-cols-4 gap-4">
          <FormField label="City"><input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} /></FormField>
          <FormField label="State"><input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputClass} /></FormField>
          <FormField label="Postal"><input type="text" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} className={inputClass} /></FormField>
          <FormField label="Country"><input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputClass} /></FormField>
        </div>

        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2 mt-4">Subscription</p>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Plan"><select value={form.subscriptionPlan} onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value })} className={selectClass}>{PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</select></FormField>
          <FormField label="Max Users"><input type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} className={inputClass} placeholder="Unlimited" /></FormField>
          <FormField label="External ID"><input type="text" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} className={inputClass} placeholder="Your internal ID" /></FormField>
        </div>

        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2 mt-4">Billing</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Billing Email"><input type="text" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} className={inputClass} placeholder="billing@company.com" /></FormField>
          <FormField label="Tax ID"><input type="text" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={inputClass} placeholder="Tax registration #" /></FormField>
        </div>
      </FormModal>

      <ConfirmModal open={!!suspendId} onClose={() => setSuspendId(null)} onConfirm={handleSuspend}
        title="Suspend Tenant" message={`Are you sure you want to suspend "${tenants.find((t) => t.id === suspendId)?.name}"? Users in this organization will lose access to the CRM.`}
        confirmLabel="Suspend" destructive confirming={suspending} />

      {/* Allowed Permissions Modal */}
      {permsTenantId && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setPermsTenantId(null)}>
          <div className="mx-4 w-full max-w-3xl max-h-[85vh] overflow-y-auto animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Allowed Permissions</h3>
                <p className="text-xs text-foreground-muted mt-0.5">
                  {tenants.find((t) => t.id === permsTenantId)?.name} — Select which permissions this tenant&apos;s admins can assign to their users
                </p>
              </div>
              <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                {allowedScopeIds.size} / {allOrgScopes.length} allowed
              </span>
            </div>

            {permsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <button onClick={() => setAllowedScopeIds(new Set(allOrgScopes.map((s) => s.id)))} className="text-xs text-primary-text hover:underline">Select all</button>
                  <button onClick={() => setAllowedScopeIds(new Set())} className="text-xs text-foreground-muted hover:underline">Clear all</button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-background-secondary">
                        <th className="px-3 py-2 text-left font-medium text-foreground-muted w-8">✓</th>
                        <th className="px-3 py-2 text-left font-medium text-foreground-muted">Category</th>
                        <th className="px-3 py-2 text-left font-medium text-foreground-muted">Permission</th>
                        <th className="px-3 py-2 text-left font-medium text-foreground-muted">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...permsScopeGroups.entries()].map(([category, scopes]) => {
                        const allCatSelected = scopes.every((s) => allowedScopeIds.has(s.id));
                        const someCatSelected = scopes.some((s) => allowedScopeIds.has(s.id));
                        return scopes.map((scope, i) => (
                          <tr key={scope.id} className={`border-b border-border-subtle hover:bg-background-secondary cursor-pointer ${i === 0 ? "border-t border-border" : ""}`} onClick={() => togglePermsScope(scope.id)}>
                            <td className="px-3 py-1.5">
                              <input type="checkbox" checked={allowedScopeIds.has(scope.id)} onChange={() => togglePermsScope(scope.id)}
                                className="h-3.5 w-3.5 rounded border-input-border accent-primary-accent" />
                            </td>
                            <td className="px-3 py-1.5 text-foreground-subtle font-medium">
                              {i === 0 ? (
                                <button onClick={(e) => { e.stopPropagation(); togglePermsCategory(scopes); }} className="hover:text-foreground flex items-center gap-1" title="Toggle all in category">
                                  <input type="checkbox" checked={allCatSelected} readOnly ref={(el) => { if (el) el.indeterminate = someCatSelected && !allCatSelected; }}
                                    className="h-3 w-3 rounded border-input-border accent-primary-accent pointer-events-none" />
                                  {category}
                                </button>
                              ) : ""}
                            </td>
                            <td className="px-3 py-1.5 font-medium text-foreground">{scope.name.split(":").slice(1).join(":")}</td>
                            <td className="px-3 py-1.5 text-foreground-muted">{scope.description ?? ""}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setPermsTenantId(null)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleSavePerms} disabled={permsSaving}
                className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {permsSaving ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
