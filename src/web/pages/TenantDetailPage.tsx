import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";
import {
  ArrowLeft,
  Building,
  Copy,
  Check,
  Mail,
  Phone,
  Globe,
  MapPin,
  Users,
  ShieldCheck,
  BarChart3,
  Calendar,
  CreditCard,
  Pencil,
  ListChecks,
} from "lucide-react";
import { FormModal, FormField } from "../components/FormModal";
import { pluralizeEntity } from "../constants/entityLabels";

type TenantDetail = Awaited<ReturnType<typeof trpc.tenants.getById.query>>;
type ScopeItem = Awaited<ReturnType<typeof trpc.tenants.getAllScopes.query>>[number];
type TenantCustomField = Awaited<ReturnType<typeof trpc.tenants.getCustomFields.query>>[number];

const PLANS = ["standard", "premium", "enterprise"];
const COMPANY_SIZES = ["", "1-10", "11-50", "51-200", "201-500", "500+"];
const FIELD_TYPE_LABELS: Record<string, string> = { text: "Text", number: "Number", date: "Date", select: "Dropdown", checkbox: "Checkbox" };

export function TenantDetailPage({ id }: { id: string }) {
  const { basePath } = useApp();
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "permissions" | "customFields">("overview");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", legalName: "", industry: "", companySize: "", website: "", phone: "", email: "", streetAddress: "", city: "", state: "", postalCode: "", country: "", subscriptionPlan: "standard", maxUsers: "", billingEmail: "", taxId: "", externalId: "" });
  const [submitting, setSubmitting] = useState(false);

  // Suspend
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspending, setSuspending] = useState(false);

  // Permissions
  const [allOrgScopes, setAllOrgScopes] = useState<ScopeItem[]>([]);
  const [allowedScopeIds, setAllowedScopeIds] = useState<Set<string>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  // Custom fields (read-only)
  const [customFields, setCustomFields] = useState<TenantCustomField[]>([]);
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const [customFieldsLoaded, setCustomFieldsLoaded] = useState(false);

  const fetchTenant = useCallback(async () => {
    setLoading(true);
    try {
      const data = await trpc.tenants.getById.query({ id });
      setTenant(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchTenant(); }, [fetchTenant]);

  // Load permissions when switching to permissions tab
  useEffect(() => {
    if (activeTab === "permissions" && allOrgScopes.length === 0) {
      setPermsLoading(true);
      Promise.all([
        trpc.tenants.getAllScopes.query(),
        trpc.tenants.getTenantScopes.query({ orgId: id }),
      ]).then(([scopes, allowed]) => {
        setAllOrgScopes(scopes);
        setAllowedScopeIds(new Set(allowed));
      }).catch(console.error).finally(() => setPermsLoading(false));
    }
  }, [activeTab, id, allOrgScopes.length]);

  // Load custom fields when switching to that tab
  useEffect(() => {
    if (activeTab === "customFields" && !customFieldsLoaded) {
      setCustomFieldsLoading(true);
      trpc.tenants.getCustomFields.query({ orgId: id })
        .then((fields) => { setCustomFields(fields); setCustomFieldsLoaded(true); })
        .catch(console.error)
        .finally(() => setCustomFieldsLoading(false));
    }
  }, [activeTab, id, customFieldsLoaded]);

  const copyId = () => { navigator.clipboard.writeText(id); setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); };

  const openEdit = () => {
    if (!tenant) return;
    setForm({
      name: tenant.name, legalName: tenant.legalName ?? "", industry: tenant.industry ?? "", companySize: tenant.companySize ?? "",
      website: tenant.website ?? "", phone: tenant.phone ?? "", email: tenant.email ?? "",
      streetAddress: tenant.streetAddress ?? "", city: tenant.city ?? "", state: tenant.state ?? "",
      postalCode: tenant.postalCode ?? "", country: tenant.country ?? "",
      subscriptionPlan: tenant.subscriptionPlan, maxUsers: tenant.maxUsers ? String(tenant.maxUsers) : "",
      billingEmail: tenant.billingEmail ?? "", taxId: tenant.taxId ?? "", externalId: tenant.externalId ?? "",
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !tenant) return;
    setSubmitting(true);
    try {
      await trpc.tenants.update.mutate({
        id: tenant.id, name: form.name,
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
      setEditOpen(false);
      fetchTenant();
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const handleSuspend = async () => {
    if (!tenant) return;
    setSuspending(true);
    try {
      if (tenant.status === "active") {
        await trpc.tenants.suspend.mutate({ id: tenant.id });
      } else {
        await trpc.tenants.update.mutate({ id: tenant.id, status: "active" });
      }
      setSuspendOpen(false);
      fetchTenant();
    } catch (err) { console.error(err); } finally { setSuspending(false); }
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
    setPermsSaving(true);
    try {
      await trpc.tenants.setTenantScopes.mutate({ orgId: id, scopeIds: [...allowedScopeIds] });
      fetchTenant();
    } catch (err) { console.error(err); } finally { setPermsSaving(false); }
  };

  // Group scopes by category
  const permsScopeGroups = new Map<string, ScopeItem[]>();
  allOrgScopes.forEach((s) => {
    const category = s.name.split(":")[0];
    if (!permsScopeGroups.has(category)) permsScopeGroups.set(category, []);
    permsScopeGroups.get(category)?.push(s);
  });

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  if (loading) {
    return (
      <div className="p-6">
        <div className="skeleton h-8 w-48 rounded-lg mb-6" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <button onClick={() => navigate("/platform/tenants")} className="flex items-center gap-1 text-sm text-primary-text hover:underline mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Tenants
        </button>
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-foreground-muted">Tenant not found</p>
        </div>
      </div>
    );
  }

  const address = [tenant.streetAddress, tenant.city, tenant.state, tenant.postalCode, tenant.country].filter(Boolean).join(", ");

  return (
    <div className="p-6">
      {/* Back link */}
      <button onClick={() => navigate("/platform/tenants")} className="mb-4 inline-flex items-center gap-1 text-sm text-primary-text hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Tenants
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-950">
            <Building className="h-6 w-6 text-primary-text" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{tenant.name}</h1>
              <StatusBadge status={tenant.status} />
            </div>
            {tenant.legalName && <p className="text-sm text-foreground-muted">{tenant.legalName}</p>}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xs font-mono text-foreground-subtle">{tenant.id}</span>
              <button onClick={copyId} className="text-foreground-subtle hover:text-foreground">
                {copiedId ? <Check className="h-3 w-3 text-success-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={openEdit} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-semibold text-button-primary-text shadow-card transition-colors hover:bg-button-primary-hover">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button onClick={() => setSuspendOpen(true)}
            className={`rounded-lg border border-button-outline-border px-3 py-2 text-sm font-medium shadow-card transition-colors ${tenant.status === "active" ? "bg-error-50 text-error-700 hover:bg-error-100 dark:bg-error-950 dark:text-error-300" : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-950 dark:text-success-300"}`}
          >
            {tenant.status === "active" ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-border">
        {(["overview", "members", "permissions", "customFields"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary-accent text-primary-text" : "border-transparent text-foreground-muted hover:text-foreground"}`}
          >
            {tab === "overview" ? "Overview" : tab === "members" ? `Members (${tenant.members.length})` : tab === "permissions" ? `Permissions (${tenant.allowedScopes.length})` : "Custom Fields"}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: Company details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Company Info Card */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Building className="h-4 w-4 text-foreground-muted" /> Company Information
              </h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <InfoRow label="Company Name" value={tenant.name} />
                <InfoRow label="Legal Name" value={tenant.legalName} />
                <InfoRow label="Industry" value={tenant.industry} />
                <InfoRow label="Company Size" value={tenant.companySize ? `${tenant.companySize} employees` : null} />
                <InfoRow label="External ID" value={tenant.externalId} />
                <InfoRow label="Created" value={new Date(tenant.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
              </div>
            </div>

            {/* Contact & Address */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4 text-foreground-muted" /> Contact & Address
              </h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <InfoRow label="Email" value={tenant.email} icon={<Mail className="h-3.5 w-3.5" />} />
                <InfoRow label="Phone" value={tenant.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow label="Website" value={tenant.website} icon={<Globe className="h-3.5 w-3.5" />} link />
                <InfoRow label="Address" value={address || null} icon={<MapPin className="h-3.5 w-3.5" />} />
              </div>
            </div>

            {/* Billing & Subscription */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-foreground-muted" /> Subscription & Billing
              </h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <InfoRow label="Plan" value={tenant.subscriptionPlan.charAt(0).toUpperCase() + tenant.subscriptionPlan.slice(1)} />
                <InfoRow label="Max Users" value={tenant.maxUsers ? String(tenant.maxUsers) : "Unlimited"} />
                <InfoRow label="Billing Email" value={tenant.billingEmail} icon={<Mail className="h-3.5 w-3.5" />} />
                <InfoRow label="Tax ID" value={tenant.taxId} />
              </div>
            </div>
          </div>

          {/* Right column: Key contact + stats */}
          <div className="space-y-6">
            {/* Key Contact */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-foreground-muted" /> Key Contact
              </h2>
              {tenant.createdByUser ? (
                <div className="flex items-center gap-3">
                  {tenant.createdByUser.picture ? (
                    <img src={tenant.createdByUser.picture} className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" alt="" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-950 text-primary-text font-semibold text-sm">
                      {(tenant.createdByUser.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{tenant.createdByUser.name ?? "—"}</p>
                    <p className="text-xs text-foreground-muted">{tenant.createdByUser.email ?? "—"}</p>
                    <p className="text-2xs text-foreground-subtle mt-0.5">Registered the organization</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No registration contact on file</p>
              )}
            </div>

            {/* Usage Stats */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-foreground-muted" /> Usage
              </h2>
              <div className="space-y-2.5">
                <StatRow label="Members" value={tenant.members.length} max={tenant.maxUsers} />
                <StatRow label="Leads" value={tenant._count.leads} />
                <StatRow label="Contacts" value={tenant._count.contacts} />
                <StatRow label="Opportunities" value={tenant._count.opportunities} />
                <StatRow label="Business Units" value={tenant._count.businessUnits} />
                <StatRow label="Tasks" value={tenant._count.crmTasks} />
                <StatRow label="Activities" value={tenant._count.crmActivities} />
              </div>
            </div>

            {/* Permissions Summary */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-foreground-muted" /> Allowed Permissions
              </h2>
              {tenant.allowedScopes.length > 0 ? (
                <>
                  <p className="text-xs text-foreground-muted mb-2">{tenant.allowedScopes.length} permissions configured</p>
                  <div className="flex flex-wrap gap-1">
                    {tenant.allowedScopes.slice(0, 12).map((as) => (
                      <span key={as.scopeId} className="rounded-full bg-background-secondary px-2 py-0.5 text-2xs text-foreground-muted">{as.scope.name}</span>
                    ))}
                    {tenant.allowedScopes.length > 12 && (
                      <span className="rounded-full bg-background-secondary px-2 py-0.5 text-2xs text-foreground-subtle">+{tenant.allowedScopes.length - 12} more</span>
                    )}
                  </div>
                  <button onClick={() => setActiveTab("permissions")} className="mt-2 text-xs text-primary-text hover:underline">Manage permissions</button>
                </>
              ) : (
                <>
                  <p className="text-xs text-foreground-muted">No permissions configured — all org-assignable permissions available by default</p>
                  <button onClick={() => setActiveTab("permissions")} className="mt-2 text-xs text-primary-text hover:underline">Configure permissions</button>
                </>
              )}
            </div>

            {/* Dates */}
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-foreground-muted" /> Timeline
              </h2>
              <div className="space-y-2">
                <InfoRow label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
                <InfoRow label="Last Updated" value={new Date(tenant.updatedAt).toLocaleString()} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === "members" && (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Roles</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Last Seen</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Joined</th>
              </tr>
            </thead>
            <tbody>
              {tenant.members.map((m) => (
                <tr key={m.userId} className="border-b border-border-subtle hover:bg-background-secondary">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.user.picture ? (
                        <img src={m.user.picture} className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" alt="" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-950 text-primary-text font-semibold text-xs">
                          {(m.user.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.user.name ?? "—"}</p>
                        {tenant.createdBy === m.userId && <span className="text-2xs text-foreground-subtle">Org creator</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{m.user.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.user.roles.length > 0 ? m.user.roles.map((r) => (
                        <span key={r.role.id} className="rounded-full bg-primary-50 px-2 py-0.5 text-2xs font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                          {r.role.name}
                        </span>
                      )) : <span className="text-2xs text-foreground-subtle">No roles</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(m.user.lastSeenAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(m.assignedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {tenant.members.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-foreground-muted">No members</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PERMISSIONS TAB */}
      {activeTab === "permissions" && (
        <div>
          {permsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setAllowedScopeIds(new Set(allOrgScopes.map((s) => s.id)))} className="text-xs text-primary-text hover:underline">Select all</button>
                  <button onClick={() => setAllowedScopeIds(new Set())} className="text-xs text-foreground-muted hover:underline">Clear all</button>
                  <span className="text-xs text-foreground-subtle">{allowedScopeIds.size} / {allOrgScopes.length} selected</span>
                </div>
                <button onClick={handleSavePerms} disabled={permsSaving}
                  className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                  {permsSaving ? "Saving..." : "Save Permissions"}
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-card-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-background-secondary">
                      <th className="px-3 py-2.5 text-left font-medium text-foreground-muted w-8">✓</th>
                      <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Category</th>
                      <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Permission</th>
                      <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...permsScopeGroups.entries()].map(([category, scopes]) => {
                      const allCatSelected = scopes.every((s) => allowedScopeIds.has(s.id));
                      const someCatSelected = scopes.some((s) => allowedScopeIds.has(s.id));
                      return scopes.map((scope, i) => (
                        <tr key={scope.id} className={`border-b border-border-subtle hover:bg-background-secondary cursor-pointer ${i === 0 ? "border-t border-border" : ""}`} onClick={() => togglePermsScope(scope.id)}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={allowedScopeIds.has(scope.id)} onChange={() => togglePermsScope(scope.id)}
                              className="h-3.5 w-3.5 rounded border-input-border accent-primary-accent" />
                          </td>
                          <td className="px-3 py-2 text-foreground-subtle font-medium">
                            {i === 0 ? (
                              <button onClick={(e) => { e.stopPropagation(); togglePermsCategory(scopes); }} className="hover:text-foreground flex items-center gap-1" title="Toggle all in category">
                                <input type="checkbox" checked={allCatSelected} readOnly ref={(el) => { if (el) el.indeterminate = someCatSelected && !allCatSelected; }}
                                  className="h-3 w-3 rounded border-input-border accent-primary-accent pointer-events-none" />
                                {category}
                              </button>
                            ) : ""}
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground">{scope.name.split(":").slice(1).join(":")}</td>
                          <td className="px-3 py-2 text-foreground-muted">{scope.description ?? ""}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* CUSTOM FIELDS TAB (read-only) */}
      {activeTab === "customFields" && (
        <div>
          {customFieldsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
            </div>
          ) : customFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <ListChecks className="h-8 w-8 text-foreground-subtle" />
              <p className="text-sm text-foreground-muted">This tenant hasn't defined any custom fields yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(["Lead", "Contact", "Opportunity"] as const).map((entityType) => {
                const entityFields = customFields.filter((f) => f.entityType === entityType);
                if (entityFields.length === 0) return null;
                return (
                  <div key={entityType}>
                    <p className="mb-2 text-xs font-medium text-foreground-subtle uppercase tracking-wide">{pluralizeEntity(entityType)} ({entityFields.length})</p>
                    <div className="overflow-x-auto rounded-xl border border-card-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-background-secondary">
                            <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Label</th>
                            <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Key</th>
                            <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Type</th>
                            <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Options</th>
                            <th className="px-3 py-2.5 text-left font-medium text-foreground-muted">Required</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entityFields.map((f) => (
                            <tr key={f.id} className="border-b border-border-subtle last:border-0">
                              <td className="px-3 py-2 font-medium text-foreground">{f.label}</td>
                              <td className="px-3 py-2 text-foreground-muted">{f.key}</td>
                              <td className="px-3 py-2 text-foreground-muted">{FIELD_TYPE_LABELS[f.fieldType] ?? f.fieldType}</td>
                              <td className="px-3 py-2 text-foreground-muted">{Array.isArray(f.options) ? (f.options as string[]).join(", ") : "—"}</td>
                              <td className="px-3 py-2 text-foreground-muted">{f.required ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Tenant" onSubmit={handleSave} submitLabel="Save" submitting={submitting}>
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

      {/* Suspend / Activate Confirm */}
      <ConfirmModal open={suspendOpen} onClose={() => setSuspendOpen(false)} onConfirm={handleSuspend}
        title={tenant.status === "active" ? "Suspend Tenant" : "Activate Tenant"}
        message={tenant.status === "active"
          ? `Are you sure you want to suspend "${tenant.name}"? Users in this organization will lose access to the CRM.`
          : `Are you sure you want to activate "${tenant.name}"? Users will regain access to the CRM.`}
        confirmLabel={tenant.status === "active" ? "Suspend" : "Activate"}
        destructive={tenant.status === "active"} confirming={suspending} />
    </div>
  );
}

// ====== Helper Components ======

function InfoRow({ label, value, icon, link }: { label: string; value: string | null | undefined; icon?: React.ReactNode; link?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-foreground-subtle uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {icon && <span className="text-foreground-subtle">{icon}</span>}
        {value ? (
          link ? (
            <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-text hover:underline">{value}</a>
          ) : (
            <p className="text-sm text-foreground">{value}</p>
          )
        ) : (
          <p className="text-sm text-foreground-muted">—</p>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, max }: { label: string; value: number; max?: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground-muted">{label}</span>
      <span className="text-sm font-medium text-foreground">
        {value.toLocaleString()}
        {max != null && <span className="text-foreground-subtle font-normal"> / {max}</span>}
      </span>
    </div>
  );
}
