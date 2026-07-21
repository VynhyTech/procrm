import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { FormModal, FormField } from "../components/FormModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { applyBrandingColor } from "../lib/branding";
import { pluralizeEntity } from "../constants/entityLabels";
import { Plus, Users, Building, ShieldCheck, Pencil, Trash2, FileText, ListChecks, Copy, Check, Plug, X } from "lucide-react";

type BusinessUnit = Awaited<ReturnType<typeof trpc.orgSettings.getBusinessUnits.query>>[number];
type Team = Awaited<ReturnType<typeof trpc.orgSettings.getTeams.query>>[number];
type TeamMember = Awaited<ReturnType<typeof trpc.orgSettings.getTeamMembers.query>>[number];
type OrgMember = Awaited<ReturnType<typeof trpc.orgSettings.getOrgMembers.query>>[number];
type Template = Awaited<ReturnType<typeof trpc.communications.getTemplates.query>>[number];
type CustomField = Awaited<ReturnType<typeof trpc.orgSettings.getCustomFields.query>>[number];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"org" | "templates" | "roles" | "branding" | "customFields" | "integrations">("org");
  return (
    <div className="p-6">
      <h1 className="mb-2 text-lg font-semibold text-foreground">Organization Settings</h1>
      <div className="mb-6 flex gap-1 rounded-lg border border-input-border p-0.5">
        {[
          { key: "org", label: "Structure" },
          { key: "customFields", label: "Custom Fields" },
          { key: "templates", label: "Message Templates" },
          { key: "roles", label: "CRM Roles" },
          { key: "branding", label: "Branding" },
          { key: "integrations", label: "Integrations" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => { const k = tab.key; if (k === "org" || k === "templates" || k === "roles" || k === "branding" || k === "customFields" || k === "integrations") setActiveTab(k); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "org" && <OrgStructureTab />}
      {activeTab === "customFields" && <CustomFieldsTab />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "roles" && <RolesTab />}
      {activeTab === "branding" && <BrandingTab />}
      {activeTab === "integrations" && <IntegrationsTab />}
    </div>
  );
}

// ========== Integrations Tab (API keys + lead-intake webhook) ==========
type ApiKeySummary = Awaited<ReturnType<typeof trpc.apiKeys.list.query>>[number];
type RequestLog = Awaited<ReturnType<typeof trpc.apiKeys.listRequestLogs.query>>[number];

const WEBHOOK_URL = `${window.location.origin}/api/v1/lead-intake`;
const EXAMPLE_PAYLOAD = `{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+1 555 0100",
  "source": "Facebook",
  "campaignName": "Spring Open House",
  "externalLeadId": "<the platform's own lead id, for safe retries>"
}`;

function IntegrationsTab() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ name: string; rawKey: string } | null>(null);
  const [copied, setCopied] = useState<"key" | "url" | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [keysData, logsData] = await Promise.all([trpc.apiKeys.list.query(), trpc.apiKeys.listRequestLogs.query({ limit: 20 })]);
      setKeys(keysData);
      setLogs(logsData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!keyName.trim()) return;
    setCreating(true);
    try {
      const result = await trpc.apiKeys.create.mutate({ name: keyName.trim() });
      setRevealedKey({ name: result.name, rawKey: result.rawKey });
      setCreateOpen(false);
      setKeyName("");
      fetchData();
    } catch (err) { console.error(err); } finally { setCreating(false); }
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    setRevoking(true);
    try { await trpc.apiKeys.revoke.mutate({ id: revokeId }); setRevokeId(null); fetchData(); }
    catch (err) { console.error(err); } finally { setRevoking(false); }
  };

  const copyText = async (text: string, which: "key" | "url") => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  if (loading) return <div className="skeleton h-40 max-w-3xl rounded-xl" />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary-text" />
          <h3 className="text-sm font-semibold text-foreground">Lead Intake Webhook</h3>
        </div>
        <p className="mb-4 text-xs text-foreground-muted">
          Bring in leads from Facebook, LinkedIn, or Google Lead Ads without a native integration — connect a Zapier or Make automation
          that posts new leads to this endpoint, tagged with a campaign name. Duplicate detection and re-inquiry matching run automatically, same as any lead created in the app.
        </p>

        <div className="mb-3 rounded-xl border border-card-border bg-card p-4 shadow-card">
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-foreground-subtle">Endpoint</p>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-input-border bg-background-secondary p-2">
            <code className="min-w-0 flex-1 truncate text-xs text-foreground">POST {WEBHOOK_URL}</code>
            <button onClick={() => copyText(WEBHOOK_URL, "url")} className="shrink-0 rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
              {copied === "url" ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-foreground-subtle">Header</p>
          <code className="mb-3 block rounded-lg border border-input-border bg-background-secondary p-2 text-xs text-foreground">x-api-key: &lt;your key&gt;</code>
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-foreground-subtle">Example Body (JSON)</p>
          <pre className="overflow-x-auto rounded-lg border border-input-border bg-background-secondary p-3 text-2xs text-foreground-muted">{EXAMPLE_PAYLOAD}</pre>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
            <Plus className="h-3.5 w-3.5" /> Create API Key
          </button>
        </div>
        {keys.length === 0 ? (
          <EmptyState title="No API keys yet" description="Create one to start sending leads in from Zapier, Make, or a custom integration." icon={<Plug className="h-8 w-8" />} />
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-lg border border-input-border bg-background-secondary px-4 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{k.name}</span>
                    {k.revokedAt && <span className="rounded-full bg-error-50 px-2 py-0.5 text-2xs font-medium text-error-700 dark:bg-error-950 dark:text-error-300">Revoked</span>}
                  </div>
                  <p className="text-2xs text-foreground-subtle">
                    {k.keyPrefix}••••••· created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!k.revokedAt && (
                  <button onClick={() => setRevokeId(k.id)} className="text-xs text-error-500 hover:underline">Revoke</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Requests</h3>
        {logs.length === 0 ? (
          <p className="text-xs text-foreground-muted">No requests received yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-background-secondary">
                  <th className="px-3 py-2 text-left font-medium text-foreground-muted">Time</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground-muted">Source</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground-muted">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground-muted">Result</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border-subtle">
                    <td className="px-3 py-2 text-foreground-muted">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-foreground">{log.source ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={log.status < 300 ? "text-success-500" : "text-error-500"}>{log.status}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground-muted">{log.error ?? (log.leadId ? "Lead created" : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormModal open={createOpen} onClose={() => setCreateOpen(false)} title="Create API Key" onSubmit={handleCreate} submitLabel="Create" submitting={creating}>
        <FormField label="Name" required>
          <input type="text" value={keyName} onChange={(e) => setKeyName(e.target.value)} className={inputClass} placeholder="Zapier - Facebook Leads" autoFocus />
        </FormField>
      </FormModal>

      {revealedKey && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setRevealedKey(null)}>
          <div className="mx-4 w-full max-w-md animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">API Key Created</h3>
              <button onClick={() => setRevealedKey(null)} className="rounded-lg p-1 text-foreground-muted transition-colors hover:bg-background-secondary"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-xs text-foreground-muted">
              Copy <span className="font-medium text-foreground">{revealedKey.name}</span> now — for security, it won't be shown again after you close this.
            </p>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-input-border bg-background-secondary p-2">
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">{revealedKey.rawKey}</code>
              <button onClick={() => copyText(revealedKey.rawKey, "key")} className="shrink-0 rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
                {copied === "key" ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setRevealedKey(null)} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Done</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!revokeId} onClose={() => setRevokeId(null)} onConfirm={handleRevoke}
        title="Revoke API Key" message="Any integration using this key will immediately stop being able to send leads in. This cannot be undone."
        confirmLabel="Revoke" destructive confirming={revoking} />
    </div>
  );
}

// ========== Branding Tab ==========
function BrandingTab() {
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    trpc.onboarding.getBranding.query().then((b) => {
      if (b) { setLogoUrl(b.logoUrl ?? ""); setPrimaryColor(b.primaryColor ?? ""); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await trpc.onboarding.updateBranding.mutate({ logoUrl: logoUrl || null, primaryColor: primaryColor || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      applyBrandingColor(primaryColor || null);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const PRESET_COLORS = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#be185d", "#4f46e5"];

  if (loading) return <div className="skeleton h-40 rounded-xl" />;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Logo</h3>
        <p className="mb-3 text-xs text-foreground-muted">Enter a URL for your company logo. It will appear in the sidebar header.</p>
        <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputClass} placeholder="https://yourcompany.com/logo.png" />
        {logoUrl && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-background-secondary p-3">
            <img src={logoUrl} alt="Preview" className="h-8 w-8 rounded object-contain" onError={(e) => { if (e.target instanceof HTMLImageElement) e.target.style.display = "none"; }} />
            <span className="text-xs text-foreground-muted">Logo preview</span>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Brand Color</h3>
        <p className="mb-3 text-xs text-foreground-muted">Pick your primary brand color. This changes the accent color throughout the app.</p>
        <div className="flex items-center gap-3 mb-3">
          <input type="color" value={primaryColor || "#2563eb"} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-10 cursor-pointer rounded border border-input-border" />
          <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputClass} placeholder="#2563eb" />
        </div>
        <div className="flex gap-2">
          {PRESET_COLORS.map((c) => (
            <button key={c} onClick={() => setPrimaryColor(c)} className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${primaryColor === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} title={c} />
          ))}
          {primaryColor && <button onClick={() => setPrimaryColor("")} className="text-2xs text-foreground-muted hover:text-foreground">Reset</button>}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
        {saving ? "Saving..." : saved ? "Saved!" : "Save Branding"}
      </button>
    </div>
  );
}

// ========== Organization Structure Tab ==========
function OrgStructureTab() {
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [buModalOpen, setBuModalOpen] = useState(false);
  const [buEditId, setBuEditId] = useState<string | null>(null);
  const [buForm, setBuForm] = useState({ name: "", description: "" });
  const [buSubmitting, setBuSubmitting] = useState(false);
  const [buDeleteId, setBuDeleteId] = useState<string | null>(null);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamEditId, setTeamEditId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ businessUnitId: "", name: "", description: "" });
  const [teamSubmitting, setTeamSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [buData, teamData, memberData] = await Promise.all([
        trpc.orgSettings.getBusinessUnits.query(),
        trpc.orgSettings.getTeams.query(),
        trpc.orgSettings.getOrgMembers.query(),
      ]);
      setUnits(buData);
      setTeams(teamData);
      setOrgMembers(memberData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (selectedTeamId) trpc.orgSettings.getTeamMembers.query({ teamId: selectedTeamId }).then(setTeamMembers).catch(console.error);
    else setTeamMembers([]);
  }, [selectedTeamId]);

  const handleSaveBU = async () => {
    if (!buForm.name) return;
    setBuSubmitting(true);
    try {
      if (buEditId) {
        await trpc.orgSettings.updateBusinessUnit.mutate({ id: buEditId, name: buForm.name, description: buForm.description || null });
      } else {
        await trpc.orgSettings.createBusinessUnit.mutate(buForm);
      }
      setBuModalOpen(false); setBuEditId(null); setBuForm({ name: "", description: "" }); fetchData();
    } catch (err) { console.error(err); } finally { setBuSubmitting(false); }
  };

  const handleDeleteBU = async () => {
    if (!buDeleteId) return;
    try {
      await trpc.orgSettings.updateBusinessUnit.mutate({ id: buDeleteId, status: "inactive" });
      setBuDeleteId(null); fetchData();
    } catch (err) { console.error(err); }
  };

  const handleSaveTeam = async () => {
    if (!teamForm.name) return;
    setTeamSubmitting(true);
    try {
      if (teamEditId) {
        await trpc.orgSettings.updateTeam.mutate({ id: teamEditId, name: teamForm.name, description: teamForm.description || null });
      } else {
        if (!teamForm.businessUnitId) return;
        await trpc.orgSettings.createTeam.mutate(teamForm);
      }
      setTeamModalOpen(false); setTeamEditId(null); setTeamForm({ businessUnitId: "", name: "", description: "" }); fetchData();
    } catch (err) { console.error(err); } finally { setTeamSubmitting(false); }
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedTeamId) return;
    try {
      await trpc.orgSettings.addTeamMember.mutate({ teamId: selectedTeamId, userId });
      setTeamMembers(await trpc.orgSettings.getTeamMembers.query({ teamId: selectedTeamId }));
    } catch (err) { console.error(err); }
  };
  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeamId) return;
    try {
      await trpc.orgSettings.removeTeamMember.mutate({ teamId: selectedTeamId, userId });
      setTeamMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) { console.error(err); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>;

  const memberIds = new Set(teamMembers.map((m) => m.userId));
  const availableMembers = orgMembers.filter((m) => !memberIds.has(m.id));

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Business Units */}
        <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Business Units</h2>
            <button onClick={() => { setBuEditId(null); setBuForm({ name: "", description: "" }); setBuModalOpen(true); }}
              className="flex items-center gap-1 rounded-md bg-button-primary-bg px-2.5 py-1.5 text-xs font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {units.length === 0 ? (
            <EmptyState title="No business units" icon={<Building className="h-8 w-8" />} />
          ) : (
            <div className="space-y-2">
              {units.map((bu) => (
                <div key={bu.id} className="group flex items-center justify-between rounded-lg bg-background-secondary p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{bu.name} {bu.status === "inactive" && <span className="text-2xs text-foreground-subtle">(inactive)</span>}</p>
                    <p className="text-xs text-foreground-muted">{bu._count.teams} teams{bu.description ? ` · ${bu.description}` : ""}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => { setBuEditId(bu.id); setBuForm({ name: bu.name, description: bu.description ?? "" }); setBuModalOpen(true); }}
                      className="rounded-md p-1 text-foreground-subtle hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setBuDeleteId(bu.id)} className="rounded-md p-1 text-foreground-subtle hover:text-error-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Teams */}
        <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Teams</h2>
            <button onClick={() => { setTeamEditId(null); setTeamForm({ businessUnitId: units.find((u) => u.status === "active")?.id ?? "", name: "", description: "" }); setTeamModalOpen(true); }}
              disabled={units.filter((u) => u.status === "active").length === 0}
              className="flex items-center gap-1 rounded-md bg-button-primary-bg px-2.5 py-1.5 text-xs font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {teams.length === 0 ? (
            <EmptyState title="No teams" icon={<Users className="h-8 w-8" />} />
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
                <div key={team.id} className={`group flex items-center justify-between rounded-lg p-3 transition-colors ${selectedTeamId === team.id ? "bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800" : "bg-background-secondary hover:bg-background-tertiary"}`}>
                  <button onClick={() => setSelectedTeamId(selectedTeamId === team.id ? null : team.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">{team.name}</p>
                    <p className="text-xs text-foreground-muted">{team.businessUnit?.name} · {team._count.members} members</p>
                  </button>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => { setTeamEditId(team.id); setTeamForm({ businessUnitId: team.businessUnitId, name: team.name, description: team.description ?? "" }); setTeamModalOpen(true); }}
                      className="rounded-md p-1 text-foreground-subtle hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team Members */}
      {selectedTeamId && (
        <div className="mt-6 rounded-xl border border-card-border bg-card p-5 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Team Members — {teams.find((t) => t.id === selectedTeamId)?.name}</h2>
          <div className="space-y-2">
            {teamMembers.map((m) => (
              <div key={m.userId} className="flex items-center justify-between rounded-lg bg-background-secondary p-3">
                <div className="flex items-center gap-2">
                  {m.user.picture ? <img src={m.user.picture} className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" alt="" /> :
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-accent text-2xs font-bold text-white">{(m.user.name ?? m.user.email ?? "?")[0].toUpperCase()}</div>}
                  <span className="text-sm text-foreground">{m.user.name ?? m.user.email}</span>
                </div>
                <button onClick={() => handleRemoveMember(m.userId)} className="text-xs text-error-500 transition-colors hover:text-error-700">Remove</button>
              </div>
            ))}
            {availableMembers.length > 0 && (
              <select onChange={(e) => { if (e.target.value) handleAddMember(e.target.value); e.target.value = ""; }} className={selectClass}>
                <option value="">Add member...</option>
                {availableMembers.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {/* BU Modal */}
      <FormModal open={buModalOpen} onClose={() => setBuModalOpen(false)} title={buEditId ? "Edit Business Unit" : "Create Business Unit"} onSubmit={handleSaveBU} submitLabel={buEditId ? "Save" : "Create"} submitting={buSubmitting}>
        <FormField label="Name" required><input type="text" value={buForm.name} onChange={(e) => setBuForm({ ...buForm, name: e.target.value })} className={inputClass} placeholder="e.g. Residential Division" /></FormField>
        <FormField label="Description"><input type="text" value={buForm.description} onChange={(e) => setBuForm({ ...buForm, description: e.target.value })} className={inputClass} /></FormField>
      </FormModal>

      {/* BU Delete Confirm */}
      <ConfirmModal open={!!buDeleteId} onClose={() => setBuDeleteId(null)} onConfirm={handleDeleteBU}
        title="Deactivate Business Unit" message="This will mark the business unit as inactive. Teams and data will be preserved." confirmLabel="Deactivate" destructive />

      {/* Team Modal */}
      <FormModal open={teamModalOpen} onClose={() => setTeamModalOpen(false)} title={teamEditId ? "Edit Team" : "Create Team"} onSubmit={handleSaveTeam} submitLabel={teamEditId ? "Save" : "Create"} submitting={teamSubmitting}>
        {!teamEditId && (
          <FormField label="Business Unit" required>
            <select value={teamForm.businessUnitId} onChange={(e) => setTeamForm({ ...teamForm, businessUnitId: e.target.value })} className={selectClass}>
              {units.filter((u) => u.status === "active").map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          </FormField>
        )}
        <FormField label="Team Name" required><input type="text" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} className={inputClass} /></FormField>
        <FormField label="Description"><input type="text" value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} className={inputClass} /></FormField>
      </FormModal>
    </>
  );
}

// ========== Custom Fields Tab ==========
const FIELD_TYPE_LABELS: Record<string, string> = { text: "Text", number: "Number", date: "Date", select: "Dropdown", checkbox: "Checkbox" };

function CustomFieldsTab() {
  const [entityType, setEntityType] = useState<"Lead" | "Contact" | "Opportunity">("Lead");
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", fieldType: "text", optionsText: "", required: false });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    try { setFields(await trpc.orgSettings.getCustomFields.query({ entityType })); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, [entityType]);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const openCreate = () => { setEditId(null); setForm({ label: "", fieldType: "text", optionsText: "", required: false }); setModalOpen(true); };
  const openEdit = (f: CustomField) => {
    setEditId(f.id);
    setForm({ label: f.label, fieldType: f.fieldType, optionsText: Array.isArray(f.options) ? f.options.join(", ") : "", required: f.required });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      const options = form.fieldType === "select" ? form.optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
      if (editId) {
        await trpc.orgSettings.updateCustomField.mutate({ id: editId, label: form.label.trim(), options, required: form.required });
      } else {
        await trpc.orgSettings.createCustomField.mutate({ entityType, label: form.label.trim(), fieldType: form.fieldType as "text" | "number" | "date" | "select" | "checkbox", options, required: form.required });
      }
      setModalOpen(false);
      fetchFields();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await trpc.orgSettings.deleteCustomField.mutate({ id: deleteId }); setDeleteId(null); fetchFields(); }
    catch (err) { console.error(err); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-input-border p-0.5">
          {(["Lead", "Contact", "Opportunity"] as const).map((t) => (
            <button key={t} onClick={() => setEntityType(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${entityType === t ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>
              {pluralizeEntity(t)}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
          <Plus className="h-3.5 w-3.5" /> Add Field
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
      ) : fields.length === 0 ? (
        <EmptyState title={`No custom fields for ${pluralizeEntity(entityType)}`} description="Add a field to start collecting extra data on these records" icon={<ListChecks className="h-10 w-10" />}
          action={<button onClick={openCreate} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Add Field</button>} />
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.id} className="group flex items-center justify-between rounded-xl border border-card-border bg-card p-4 shadow-card">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{f.label}</p>
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-2xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">{FIELD_TYPE_LABELS[f.fieldType] ?? f.fieldType}</span>
                  {f.required && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-2xs font-medium text-warning-700 dark:bg-warning-950 dark:text-warning-300">Required</span>}
                </div>
                {f.fieldType === "select" && Array.isArray(f.options) && (
                  <p className="mt-1 text-xs text-foreground-muted">Options: {(f.options as string[]).join(", ")}</p>
                )}
              </div>
              <div className="ml-3 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEdit(f)} className="rounded-md p-1.5 text-foreground-subtle hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => setDeleteId(f.id)} className="rounded-md p-1.5 text-foreground-subtle hover:text-error-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormModal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Custom Field" : `New Custom Field — ${entityType}`} onSubmit={handleSave} submitLabel={editId ? "Save" : "Create"} submitting={saving}>
        <FormField label="Label" required><input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} placeholder="e.g. Referral Source Detail" /></FormField>
        {!editId && (
          <FormField label="Field Type">
            <select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })} className={selectClass}>
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
        )}
        {form.fieldType === "select" && (
          <FormField label="Options" required>
            <input type="text" value={form.optionsText} onChange={(e) => setForm({ ...form, optionsText: e.target.value })} className={inputClass} placeholder="Option A, Option B, Option C" />
          </FormField>
        )}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} className="h-4 w-4 rounded border-input-border accent-primary-accent" />
          Required
        </label>
      </FormModal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Delete Custom Field" message="Are you sure you want to delete this custom field? Any values already saved on records will no longer be shown." confirmLabel="Delete" destructive />
    </>
  );
}

// ========== Templates Tab ==========
function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", channel: "Email", subject: "", body: "", category: "General" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await trpc.communications.getTemplates.query({})); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSave = async () => {
    if (!form.name || !form.body) return;
    setSaving(true);
    try {
      if (editId) {
        await trpc.communications.updateTemplate.mutate({ id: editId, name: form.name, subject: form.subject || null, body: form.body, category: form.category });
      } else {
        await trpc.communications.createTemplate.mutate({ name: form.name, channel: form.channel === "SMS" ? "SMS" : "Email", subject: form.subject || undefined, body: form.body, category: form.category });
      }
      setModalOpen(false); setEditId(null); setForm({ name: "", channel: "Email", subject: "", body: "", category: "General" }); fetchTemplates();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await trpc.communications.deleteTemplate.mutate({ id: deleteId }); setDeleteId(null); fetchTemplates(); } catch (err) { console.error(err); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-foreground-muted">Create templates for SMS and Email. Use {"{{firstName}}"}, {"{{lastName}}"}, {"{{propertyType}}"}, {"{{preferredArea}}"} for personalization.</p>
        <button onClick={() => { setEditId(null); setForm({ name: "", channel: "Email", subject: "", body: "", category: "General" }); setModalOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
          <Plus className="h-3.5 w-3.5" /> New Template
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : templates.length === 0 ? (
        <EmptyState title="No templates yet" description="Create your first message template" icon={<FileText className="h-10 w-10" />}
          action={<button onClick={() => setModalOpen(true)} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Create Template</button>} />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="group flex items-start justify-between rounded-xl border border-card-border bg-card p-4 shadow-card">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${t.channel === "SMS" ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300" : "bg-info-50 text-info-700 dark:bg-info-950 dark:text-info-300"}`}>{t.channel}</span>
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-2xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">{t.category}</span>
                </div>
                {t.subject && <p className="mt-1 text-xs text-foreground-muted">Subject: {t.subject}</p>}
                <p className="mt-1 truncate text-xs text-foreground-subtle">{t.body}</p>
              </div>
              <div className="ml-3 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => { setEditId(t.id); setForm({ name: t.name, channel: t.channel, subject: t.subject ?? "", body: t.body, category: t.category }); setModalOpen(true); }}
                  className="rounded-md p-1.5 text-foreground-subtle hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => setDeleteId(t.id)} className="rounded-md p-1.5 text-foreground-subtle hover:text-error-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormModal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit Template" : "Create Template"} onSubmit={handleSave} submitLabel={editId ? "Save" : "Create"} submitting={saving}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name" required><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Welcome Message" /></FormField>
          {!editId && (
            <FormField label="Channel">
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className={selectClass}>
                <option value="Email">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </FormField>
          )}
        </div>
        <FormField label="Category">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={selectClass}>
            {["Welcome", "FollowUp", "PropertyInfo", "SiteVisit", "General"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        {(form.channel === "Email" || editId) && (
          <FormField label="Subject"><input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputClass} placeholder="Welcome to {{propertyType}} listings" /></FormField>
        )}
        <FormField label="Body" required>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className={`${inputClass} resize-none`}
            placeholder="Hi {{firstName}}, thank you for your interest in..." />
        </FormField>
      </FormModal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Delete Template" message="Are you sure you want to delete this template?" confirmLabel="Delete" destructive />
    </>
  );
}

// ========== Roles Tab ==========
function RolesTab() {
  const [seedingRoles, setSeedingRoles] = useState(false);
  const [seedResult, setSeedResult] = useState<string[] | null>(null);

  const handleSeedRoles = async () => {
    setSeedingRoles(true);
    try {
      const result = await trpc.orgSettings.seedCrmRoles.mutate();
      setSeedResult(result.created);
    } catch (err) { console.error(err); } finally { setSeedingRoles(false); }
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">CRM Roles</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            Initialize or update the default CRM roles (Tenant Admin, Sales Manager, Agent, Viewer) with the latest permissions.
            Re-running this will update existing roles with any new scopes added since last initialization.
          </p>
          <div className="mt-3 space-y-1.5">
            <p className="text-xs text-foreground"><span className="font-medium">Tenant Admin:</span> Full CRM access + settings + compliance + reporting + AI</p>
            <p className="text-xs text-foreground"><span className="font-medium">Sales Manager:</span> Team lead/opportunity management + reports + AI + agent performance</p>
            <p className="text-xs text-foreground"><span className="font-medium">Agent:</span> Own leads/opportunities + communication + AI tools</p>
            <p className="text-xs text-foreground"><span className="font-medium">Viewer:</span> Read-only access to all CRM data + reports</p>
          </div>
        </div>
        <button onClick={handleSeedRoles} disabled={seedingRoles}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
          <ShieldCheck className="h-4 w-4" /> {seedingRoles ? "Updating..." : "Initialize / Update Roles"}
        </button>
      </div>
      {seedResult && (
        <div className="mt-3 rounded-lg bg-success-50 p-3 dark:bg-success-950">
          <p className="text-xs font-medium text-success-900 dark:text-success-100">Roles updated:</p>
          <ul className="mt-1 space-y-0.5">
            {seedResult.map((r, i) => <li key={i} className="text-xs text-success-700 dark:text-success-300">{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
