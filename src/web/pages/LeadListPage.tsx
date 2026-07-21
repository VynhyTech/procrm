import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { BulkActionBar } from "../components/BulkActionBar";
import { ConfirmModal } from "../components/ConfirmModal";
import { Plus, Search, Users, Smartphone, Mail, MessageSquare, Trash2, RefreshCw, UserPlus, Send, Globe, ThumbsUp, Repeat2, AlertTriangle, Tag, Phone, MessageCircle, Pencil, Copy, Upload } from "lucide-react";
import { InlineEditCell } from "../components/InlineEditCell";

interface LeadResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string;
  preferredContactMethod: string | null;
  campaignName: string | null;
  matchStrength: string | null;
  matchedLeadId: string | null;
  createdAt: string;
  owner: { id: string; name: string | null; email: string | null; picture: string | null } | null;
  interest: { propertyType: string | null; budgetMax: number | null; locationArea: string | null } | null;
}

const STATUSES = ["", "New", "Working", "Qualified"];
const SOURCES = ["", "Manual", "Referral", "Walk-in", "Open House", "Sphere", "Phone", "Website", "Facebook", "Google", "API", "Import"];

const STATUS_ROW_BORDER: Record<string, string> = {
  New: "border-l-info-400",
  Working: "border-l-warning-400",
  Qualified: "border-l-success-400",
  Disqualified: "border-l-error-400",
  Converted: "border-l-accent-400",
  Merged: "border-l-neutral-400",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

const CSV_FIELD_ALIASES: Record<string, string> = {
  firstname: "firstName", "first name": "firstName", "first_name": "firstName",
  lastname: "lastName", "last name": "lastName", "last_name": "lastName",
  email: "email", "email address": "email",
  phone: "phone", "phone number": "phone", mobile: "phone",
  source: "source",
  campaign: "campaignName", campaignname: "campaignName", "campaign name": "campaignName",
};

function csvToLeadRows(text: string): Array<{ firstName?: string; lastName?: string; email?: string; phone?: string; source?: string; campaignName?: string }> {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => CSV_FIELD_ALIASES[h.trim().toLowerCase()] ?? h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (r[i] !== undefined && r[i] !== "") obj[h] = r[i].trim(); });
    return obj;
  });
}

function relativeAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function contactMethodIcon(method: string | null) {
  if (!method) return null;
  const cls = "h-3 w-3";
  switch (method) {
    case "WhatsApp": return <MessageCircle className={`${cls} text-success-500`} />;
    case "SMS": return <Smartphone className={`${cls} text-success-500`} />;
    case "Phone": return <Phone className={`${cls} text-info-500`} />;
    case "Email": return <Mail className={`${cls} text-info-500`} />;
    default: return null;
  }
}

function interestPreview(interest: { propertyType: string | null; budgetMax: number | null; locationArea: string | null } | null): string | null {
  if (!interest) return null;
  const parts: string[] = [];
  if (interest.propertyType) parts.push(interest.propertyType);
  if (interest.budgetMax != null) parts.push(`$${interest.budgetMax.toLocaleString()}`);
  if (interest.locationArea) parts.push(interest.locationArea);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function LeadListPage() {
  const { scopes } = useAuth();
  const { basePath } = useApp();
  const [viewTab, setViewTab] = useState<"my" | "pool" | "all">("my");
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Working");
  const [bulkSourceOpen, setBulkSourceOpen] = useState(false);
  const [bulkSource, setBulkSource] = useState("Manual");
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignTarget, setBulkAssignTarget] = useState<"agent" | "pool" | "">("");
  const [bulkAssignUserId, setBulkAssignUserId] = useState("");
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [rowReassignId, setRowReassignId] = useState<string | null>(null);
  const [rowReassignTarget, setRowReassignTarget] = useState<"agent" | "pool" | "">("");
  const [rowReassignUserId, setRowReassignUserId] = useState("");
  const [rowReassigning, setRowReassigning] = useState(false);
  const [massMessageOpen, setMassMessageOpen] = useState(false);
  const [massChannel, setMassChannel] = useState<"SMS" | "Email">("Email");
  const [massSubject, setMassSubject] = useState("");
  const [massBody, setMassBody] = useState("");
  const [massSending, setMassSending] = useState(false);
  const [quickConvertLeadId, setQuickConvertLeadId] = useState<string | null>(null);
  const [quickConvertName, setQuickConvertName] = useState("");
  const [quickConverting, setQuickConverting] = useState(false);
  const [stats, setStats] = useState({ pool: 0, working: 0, qualified: 0, total: 0 });
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingSingle, setDeletingSingle] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: Array<{ row: number; message: string }> } | null>(null);

  // Dev override: enable actions while DB/auth not available
  const canViewAll = true;
  const canEdit = true;
  const canDelete = true;
  const canAssign = true;
  const canSendMsg = true;

  const fetchStats = useCallback(async () => {
    try {
      const s = await trpc.leads.getLeadStats.query();
      setStats(s);
    } catch { /* ignore */ }
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search: search || undefined, status: statusFilter || undefined, source: sourceFilter || undefined, limit: pageSize, offset: page * pageSize };
      let result;
      if (viewTab === "pool") result = await trpc.leads.getPool.query(params);
      else if (viewTab === "all" && canViewAll) result = await trpc.leads.getAllLeads.query(params);
      else result = await trpc.leads.getMyLeads.query(params);
      setLeads(result.leads.map((l) => ({
        id: l.id, firstName: l.firstName, lastName: l.lastName,
        email: l.email, phone: l.phone, status: l.status, source: l.source,
        preferredContactMethod: l.preferredContactMethod, campaignName: l.campaignName,
        matchStrength: l.matchStrength, matchedLeadId: l.matchedLeadId,
        createdAt: l.createdAt, owner: l.owner,
        interest: l.interest ?? null,
      })));
      setTotal(result.total);
      setSelected(new Set());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [search, statusFilter, sourceFilter, canViewAll, page, viewTab]);

  const handleDeleteLead = async () => {
    if (!deleteTargetId) return;
    setDeletingSingle(true);
    try {
      await trpc.leads.delete.mutate({ id: deleteTargetId });
      setDeleteTargetId(null);
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); } finally { setDeletingSingle(false); }
  };

  const handleCloneLead = async (leadId: string) => {
    setCloningId(leadId);
    try {
      await trpc.leads.clone.mutate({ id: leadId });
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); } finally { setCloningId(null); }
  };

  const handleImportCsv = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      const rows = csvToLeadRows(text);
      if (rows.length === 0) {
        setImportResult({ created: 0, skipped: 0, errors: [{ row: 0, message: "No data rows found in file" }] });
        return;
      }
      const result = await trpc.leads.bulkImport.mutate({ rows });
      setImportResult(result);
      fetchLeads(); fetchStats();
    } catch (err) {
      setImportResult({ created: 0, skipped: 0, errors: [{ row: 0, message: err instanceof Error ? err.message : "Import failed" }] });
    } finally { setImporting(false); }
  };

  const closeImportModal = () => { setImportOpen(false); setImportFile(null); setImportResult(null); };

  const handleClaim = async (leadId: string) => {
    setClaiming(leadId);
    setClaimError(null);
    try {
      await trpc.leads.claim.mutate({ leadId });
      fetchLeads();
      fetchStats();
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : String(err));
    } finally { setClaiming(null); }
  };

  useEffect(() => { fetchLeads(); fetchStats(); }, [fetchLeads, fetchStats]);

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await trpc.leads.bulkDelete.mutate({ ids: Array.from(selected) });
      setConfirmDeleteOpen(false);
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); } finally { setBulkDeleting(false); }
  };

  const handleBulkStatus = async () => {
    try {
      await trpc.leads.bulkUpdateStatus.mutate({ ids: Array.from(selected), status: bulkStatus });
      setBulkStatusOpen(false);
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); }
  };

  const handleBulkSource = async () => {
    try {
      await trpc.leads.bulkUpdateSource.mutate({ ids: Array.from(selected), source: bulkSource });
      setBulkSourceOpen(false);
      fetchLeads();
    } catch (err) { console.error(err); }
  };

  const handleBulkAssign = async () => {
    setBulkAssigning(true);
    try {
      if (bulkAssignTarget === "pool") {
        for (const leadId of selected) {
          await trpc.leads.sendToPool.mutate({ leadId });
        }
      } else if (bulkAssignTarget === "agent" && bulkAssignUserId) {
        await trpc.leads.bulkAssign.mutate({ ids: Array.from(selected), userId: bulkAssignUserId });
      }
      setBulkAssignOpen(false);
      setBulkAssignTarget("");
      setBulkAssignUserId("");
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); } finally { setBulkAssigning(false); }
  };

  const openRowReassign = async (leadId: string) => {
    try {
      const members = await trpc.orgSettings.getOrgMembers.query();
      setOrgMembers(members);
      setRowReassignId(leadId);
      setRowReassignTarget("");
      setRowReassignUserId("");
    } catch (err) { console.error(err); }
  };

  const handleRowReassign = async () => {
    if (!rowReassignId) return;
    setRowReassigning(true);
    try {
      if (rowReassignTarget === "pool") {
        await trpc.leads.sendToPool.mutate({ leadId: rowReassignId });
      } else if (rowReassignTarget === "agent" && rowReassignUserId) {
        await trpc.leads.assign.mutate({ leadId: rowReassignId, userId: rowReassignUserId });
      }
      setRowReassignId(null);
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); } finally { setRowReassigning(false); }
  };

  const handleMassSend = async () => {
    if (!massBody.trim()) return;
    setMassSending(true);
    try {
      await trpc.leads.bulkSendMessage.mutate({
        ids: Array.from(selected),
        channel: massChannel,
        subject: massChannel === "Email" ? massSubject : undefined,
        body: massBody,
      });
      setMassMessageOpen(false);
      setMassBody("");
      setMassSubject("");
      fetchLeads();
    } catch (err) { console.error(err); } finally { setMassSending(false); }
  };

  const openBulkAssign = async () => {
    try {
      const members = await trpc.orgSettings.getOrgMembers.query();
      setOrgMembers(members);
      setBulkAssignTarget("");
      setBulkAssignUserId("");
      setBulkAssignOpen(true);
    } catch (err) { console.error(err); }
  };

  const handleBulkQualify = async () => {
    try {
      await trpc.leads.bulkQualify.mutate({ ids: Array.from(selected) });
      fetchLeads(); fetchStats();
    } catch (err) { console.error(err); }
  };

  const bulkActions: Array<{ label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }> = [];
  if (canEdit) {
    bulkActions.push({ label: "Qualify", icon: <ThumbsUp className="h-3 w-3" />, onClick: handleBulkQualify });
    bulkActions.push({ label: "Status", icon: <RefreshCw className="h-3 w-3" />, onClick: () => setBulkStatusOpen(true) });
    bulkActions.push({ label: "Source", icon: <Globe className="h-3 w-3" />, onClick: () => setBulkSourceOpen(true) });
  }
  if (canAssign) {
    bulkActions.push({ label: "Reassign", icon: <UserPlus className="h-3 w-3" />, onClick: openBulkAssign });
  }
  if (canSendMsg) {
    bulkActions.push({ label: "Mass Email", icon: <Mail className="h-3 w-3" />, onClick: () => { setMassChannel("Email"); setMassMessageOpen(true); } });
    bulkActions.push({ label: "Mass SMS", icon: <Smartphone className="h-3 w-3" />, onClick: () => { setMassChannel("SMS"); setMassMessageOpen(true); } });
  }
  if (canDelete) {
    bulkActions.push({ label: "Delete", icon: <Trash2 className="h-3 w-3" />, onClick: () => setConfirmDeleteOpen(true), destructive: true });
  }

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Leads</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-input-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background-secondary">
              <Upload className="h-4 w-4" /> Import CSV
            </button>
            <button onClick={() => navigate("/leads/new")} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              <Plus className="h-4 w-4" /> New Lead
            </button>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button onClick={() => { setViewTab("pool"); setPage(0); }} className={`rounded-xl border p-3 text-left transition-colors ${viewTab === "pool" ? "border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-950" : "border-card-border bg-card hover:bg-background-secondary"}`}>
          <p className="text-xl font-bold text-foreground">{stats.pool}</p>
          <p className="text-2xs font-medium text-foreground-muted">In Pool</p>
        </button>
        <button onClick={() => { setViewTab("my"); setStatusFilter("Working"); setPage(0); }} className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === "Working" ? "border-warning-300 bg-warning-50 dark:border-warning-700 dark:bg-warning-950" : "border-card-border bg-card hover:bg-background-secondary"}`}>
          <p className="text-xl font-bold text-foreground">{stats.working}</p>
          <p className="text-2xs font-medium text-foreground-muted">Working</p>
        </button>
        <button onClick={() => { setViewTab("my"); setStatusFilter("Qualified"); setPage(0); }} className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === "Qualified" ? "border-success-300 bg-success-50 dark:border-success-700 dark:bg-success-950" : "border-card-border bg-card hover:bg-background-secondary"}`}>
          <p className="text-xl font-bold text-foreground">{stats.qualified}</p>
          <p className="text-2xs font-medium text-foreground-muted">Qualified</p>
        </button>
        <div className="rounded-xl border border-card-border bg-card p-3">
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
          <p className="text-2xs font-medium text-foreground-muted">Total</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex gap-1 rounded-lg border border-input-border p-0.5">
        <button onClick={() => { setViewTab("my"); setStatusFilter(""); setPage(0); }} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewTab === "my" ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>My Leads</button>
        <button onClick={() => { setViewTab("pool"); setStatusFilter(""); setPage(0); }} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewTab === "pool" ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>Pool</button>
        {canViewAll && (
          <button onClick={() => { setViewTab("all"); setStatusFilter(""); setPage(0); }} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewTab === "all" ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>All Leads</button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <input type="text" placeholder="Search leads..." value={searchInput} onChange={(e) => { setSearchInput(e.target.value); clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setSearch(e.target.value); setPage(0); }, 300); }}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus" />
        </div>
        {viewTab !== "pool" && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
            <option value="">All Statuses</option>
            {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
          <option value="">All Sources</option>
          {SOURCES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {claimError && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300">{claimError}</div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar selectedCount={selected.size} onClearSelection={() => setSelected(new Set())} actions={bulkActions} />

      {/* Content */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : leads.length === 0 ? (
        <EmptyState title="No leads found" description={search || statusFilter || sourceFilter ? "Try adjusting your filters" : "Create your first lead"} icon={<Users className="h-10 w-10" />}
          action={canEdit ? <button onClick={() => navigate("/leads/new")} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Create Lead</button> : undefined} />
      ) : viewTab === "pool" ? (
        /* ====== Pool: Table layout (same as lead list) ====== */
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Interest</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Campaign</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Age</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const preview = interestPreview(lead.interest);
                return (
                  <tr key={lead.id} className={`border-b border-l-4 border-border-subtle transition-colors hover:bg-background-secondary ${STATUS_ROW_BORDER[lead.status] ?? "border-l-neutral-300"}`}>
                    <td className="px-4 py-3">
                      <a href={`/leads/${lead.id}`} className="text-sm font-medium text-foreground hover:text-primary-text">{lead.firstName} {lead.lastName}</a>
                      {lead.matchStrength && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-2xs font-bold text-warning-700 dark:bg-warning-950 dark:text-warning-300">
                          <AlertTriangle className="h-2.5 w-2.5" /> Dup
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.email && <p className="text-xs text-foreground-muted">{lead.email}</p>}
                      {lead.phone && <p className="text-xs text-foreground-muted">{lead.phone}</p>}
                      {lead.preferredContactMethod && (
                        <div className="mt-0.5 flex items-center gap-1">
                          {contactMethodIcon(lead.preferredContactMethod)}
                          <span className="text-2xs text-foreground-subtle">{lead.preferredContactMethod}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                    <td className="px-4 py-3 text-xs text-foreground-muted">{preview ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{lead.source}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      <InlineEditCell value={lead.campaignName} onSave={async (v) => { await trpc.leads.update.mutate({ id: lead.id, campaignName: v }); fetchLeads(); }} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-foreground-muted">{relativeAge(lead.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleClaim(lead.id)} disabled={claiming === lead.id}
                          className="rounded-md bg-button-primary-bg px-3 py-1 text-xs font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                          {claiming === lead.id ? "..." : "Claim"}
                        </button>
                        {canEdit && (
                          <button onClick={() => navigate(`/leads/${lead.id}`)} title="Edit"
                            className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => handleCloneLead(lead.id)} disabled={cloningId === lead.id} title="Clone"
                            className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground disabled:opacity-50">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteTargetId(lead.id)} title="Delete"
                            className="rounded-md p-1.5 text-error-500 transition-colors hover:bg-error-50 dark:hover:bg-error-950">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ====== Table: Enriched rows ====== */
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                {(canDelete || canEdit || canAssign) && (
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-input-border accent-primary-accent" />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Owner</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Age</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const preview = interestPreview(lead.interest);
                return (
                  <tr key={lead.id} className={`border-b border-l-4 border-border-subtle transition-colors hover:bg-background-secondary ${STATUS_ROW_BORDER[lead.status] ?? "border-l-neutral-300"} ${selected.has(lead.id) ? "bg-primary-50 dark:bg-primary-950" : ""}`}>
                    {(canDelete || canEdit || canAssign) && (
                      <td className="w-10 px-3 py-3">
                        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)}
                          className="h-4 w-4 rounded border-input-border accent-primary-accent" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <a href={`/leads/${lead.id}`} className="text-sm font-medium text-foreground hover:text-primary-text">{lead.firstName} {lead.lastName}</a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {preview && <span className="text-2xs text-foreground-muted">{preview}</span>}
                        {lead.campaignName && (
                          <span className="flex items-center gap-0.5 rounded-full bg-info-50 px-1.5 py-0.5 text-2xs font-medium text-info-700 dark:bg-info-950 dark:text-info-300">
                            <Tag className="h-2.5 w-2.5" /> {lead.campaignName}
                          </span>
                        )}
                        {lead.matchStrength && (
                          <span className="flex items-center gap-0.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-2xs font-bold text-warning-700 dark:bg-warning-950 dark:text-warning-300">
                            <AlertTriangle className="h-2.5 w-2.5" /> Dup
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {lead.email && <p className="text-xs text-foreground-muted">{lead.email}</p>}
                      {lead.phone && <p className="text-xs text-foreground-muted">{lead.phone}</p>}
                      {lead.preferredContactMethod && (
                        <div className="mt-0.5 flex items-center gap-1">
                          {contactMethodIcon(lead.preferredContactMethod)}
                          <span className="text-2xs text-foreground-subtle">{lead.preferredContactMethod}</span>
                        </div>
                      )}
                      {!lead.email && !lead.phone && <span className="text-xs text-foreground-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{lead.source}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      <InlineEditCell value={lead.campaignName} onSave={async (v) => { await trpc.leads.update.mutate({ id: lead.id, campaignName: v }); fetchLeads(); }} />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{lead.owner?.name ?? lead.owner?.email ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-xs text-foreground-muted">{relativeAge(lead.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {lead.status === "Working" && lead.owner && (
                          <button onClick={async (e) => { e.stopPropagation(); try { await trpc.leads.qualify.mutate({ id: lead.id }); fetchLeads(); fetchStats(); } catch (err) { console.error(err); } }}
                            title="Qualify" className="rounded-md p-1.5 text-success-500 transition-colors hover:bg-success-50 dark:hover:bg-success-950">
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {lead.status === "Qualified" && lead.owner && (
                          <button onClick={(e) => { e.stopPropagation(); setQuickConvertLeadId(lead.id); setQuickConvertName(`${lead.firstName} ${lead.lastName} - Property Deal`); }}
                            title="Convert" className="rounded-md p-1.5 text-accent-500 transition-colors hover:bg-accent-50 dark:hover:bg-accent-950">
                            <Repeat2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => navigate(`/leads/${lead.id}?tab=sms`)} disabled={!lead.phone} title={lead.phone ? `SMS ${lead.phone}` : "No phone"}
                          className={`rounded-md p-1.5 transition-colors ${lead.phone ? "text-success-500 hover:bg-success-50 dark:hover:bg-success-950" : "cursor-not-allowed text-foreground-subtle opacity-40"}`}>
                          <Smartphone className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => navigate(`/leads/${lead.id}?tab=email`)} disabled={!lead.email} title={lead.email ? `Email ${lead.email}` : "No email"}
                          className={`rounded-md p-1.5 transition-colors ${lead.email ? "text-info-500 hover:bg-info-50 dark:hover:bg-info-950" : "cursor-not-allowed text-foreground-subtle opacity-40"}`}>
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => navigate(`/leads/${lead.id}?tab=chat`)} title="Internal notes"
                          className="rounded-md p-1.5 text-accent-500 transition-colors hover:bg-accent-50 dark:hover:bg-accent-950">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        {canAssign && lead.owner && lead.status !== "Converted" && lead.status !== "Disqualified" && lead.status !== "Merged" && (
                          <button onClick={(e) => { e.stopPropagation(); openRowReassign(lead.id); }} title="Reassign"
                            className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }} title="Edit"
                            className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={(e) => { e.stopPropagation(); handleCloneLead(lead.id); }} disabled={cloningId === lead.id} title="Clone"
                            className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground disabled:opacity-50">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(lead.id); }} title="Delete"
                            className="rounded-md p-1.5 text-error-500 transition-colors hover:bg-error-50 dark:hover:bg-error-950">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}
            className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">
            Previous
          </button>
          <span className="text-xs text-foreground-muted">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}
            className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">
            Next
          </button>
        </div>
      )}

      {/* Confirm bulk delete */}
      <ConfirmModal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} onConfirm={handleBulkDelete}
        title="Delete Selected Leads" message={`Are you sure you want to delete ${selected.size} lead${selected.size > 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel="Delete" destructive confirming={bulkDeleting} />

      {/* Confirm single delete */}
      <ConfirmModal open={!!deleteTargetId} onClose={() => setDeleteTargetId(null)} onConfirm={handleDeleteLead}
        title="Delete Lead" message="Are you sure you want to delete this lead? This cannot be undone."
        confirmLabel="Delete" destructive confirming={deletingSingle} />

      {/* Bulk status update modal */}
      {bulkStatusOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setBulkStatusOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Update Status — {selected.size} leads</h3>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}
              className="mb-4 w-full rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
              {["New", "Working", "Qualified"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkStatusOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleBulkStatus} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk source update modal */}
      {bulkSourceOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setBulkSourceOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Update Source — {selected.size} leads</h3>
            <select value={bulkSource} onChange={(e) => setBulkSource(e.target.value)}
              className="mb-4 w-full rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
              {["Manual", "Referral", "Walk-in", "Open House", "Sphere", "Phone", "Website", "Facebook", "Google", "API", "Import"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkSourceOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleBulkSource} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk reassign modal */}
      {bulkAssignOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setBulkAssignOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Reassign — {selected.size} leads</h3>
            <div className="mb-4 flex gap-2">
              <button onClick={() => { setBulkAssignTarget("agent"); setBulkAssignUserId(""); }}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${bulkAssignTarget === "agent" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300" : "border-input-border bg-input-bg text-foreground-muted hover:bg-background-secondary"}`}>
                <UserPlus className="mx-auto mb-1 h-5 w-5" />Agent
              </button>
              <button onClick={() => setBulkAssignTarget("pool")}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${bulkAssignTarget === "pool" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300" : "border-input-border bg-input-bg text-foreground-muted hover:bg-background-secondary"}`}>
                <Users className="mx-auto mb-1 h-5 w-5" />Pool
              </button>
            </div>
            {bulkAssignTarget === "agent" && (
              <select value={bulkAssignUserId} onChange={(e) => setBulkAssignUserId(e.target.value)}
                className="mb-4 w-full rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
                <option value="">Select agent...</option>
                {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
              </select>
            )}
            {bulkAssignTarget === "pool" && (
              <p className="mb-4 text-xs text-foreground-muted">Remove owners and send all selected leads back to the shared pool.</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkAssignOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleBulkAssign} disabled={bulkAssigning || !bulkAssignTarget || (bulkAssignTarget === "agent" && !bulkAssignUserId)}
                className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {bulkAssigning ? "..." : bulkAssignTarget === "pool" ? "Send to Pool" : "Reassign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row reassign modal */}
      {rowReassignId && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setRowReassignId(null)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Reassign Lead</h3>
            <div className="mb-4 flex gap-2">
              <button onClick={() => { setRowReassignTarget("agent"); setRowReassignUserId(""); }}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${rowReassignTarget === "agent" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300" : "border-input-border bg-input-bg text-foreground-muted hover:bg-background-secondary"}`}>
                <UserPlus className="mx-auto mb-1 h-5 w-5" />Agent
              </button>
              <button onClick={() => setRowReassignTarget("pool")}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${rowReassignTarget === "pool" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300" : "border-input-border bg-input-bg text-foreground-muted hover:bg-background-secondary"}`}>
                <Users className="mx-auto mb-1 h-5 w-5" />Pool
              </button>
            </div>
            {rowReassignTarget === "agent" && (
              <select value={rowReassignUserId} onChange={(e) => setRowReassignUserId(e.target.value)}
                className="mb-4 w-full rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
                <option value="">Select agent...</option>
                {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
              </select>
            )}
            {rowReassignTarget === "pool" && (
              <p className="mb-4 text-xs text-foreground-muted">Remove the owner and return this lead to the shared pool.</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setRowReassignId(null)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleRowReassign} disabled={rowReassigning || !rowReassignTarget || (rowReassignTarget === "agent" && !rowReassignUserId)}
                className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {rowReassigning ? "..." : rowReassignTarget === "pool" ? "Send to Pool" : "Reassign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mass message modal */}
      {massMessageOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setMassMessageOpen(false)}>
          <div className="mx-4 w-full max-w-lg animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-foreground">Mass {massChannel} — {selected.size} leads</h3>
            <p className="mb-4 text-xs text-foreground-muted">Leads without {massChannel === "Email" ? "email" : "phone"} will be skipped. Use {"{{firstName}}"} for personalization.</p>
            {massChannel === "Email" && (
              <input type="text" value={massSubject} onChange={(e) => setMassSubject(e.target.value)} placeholder="Subject..." className={`mb-3 ${inputClass}`} />
            )}
            <textarea value={massBody} onChange={(e) => setMassBody(e.target.value)} rows={4}
              placeholder={`Type your ${massChannel.toLowerCase()} message...`}
              className={`mb-4 resize-none ${inputClass}`} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setMassMessageOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleMassSend} disabled={massSending || !massBody.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> {massSending ? "Sending..." : `Send to ${selected.size} leads`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick convert modal */}
      {quickConvertLeadId && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setQuickConvertLeadId(null)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Convert Lead</h3>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-foreground">Opportunity Name (optional)</label>
              <input type="text" value={quickConvertName} onChange={(e) => setQuickConvertName(e.target.value)}
                className={inputClass} placeholder="Leave blank to convert without an opportunity" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setQuickConvertLeadId(null)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button disabled={quickConverting} onClick={async () => {
                setQuickConverting(true);
                try {
                  const result = await trpc.leads.convert.mutate({ id: quickConvertLeadId, opportunityName: quickConvertName || undefined });
                  setQuickConvertLeadId(null);
                  if (result.opportunity?.id) {
                    navigate(`/opportunities/${result.opportunity.id}`);
                  } else if (result.contact?.id) {
                    navigate(`/contacts/${result.contact.id}`);
                  } else {
                    fetchLeads();
                  }
                } catch (err) { console.error(err); } finally { setQuickConverting(false); }
              }} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {quickConverting ? "Converting..." : "Convert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV modal */}
      {importOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={closeImportModal}>
          <div className="mx-4 w-full max-w-lg animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-foreground">Import Leads from CSV</h3>
            <p className="mb-4 text-xs text-foreground-muted">Columns: First Name, Last Name (required), Email or Phone (at least one), Source, Campaign.</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
              className="mb-4 w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-button-secondary-bg file:px-3 file:py-2 file:text-sm file:font-medium file:text-button-secondary-text hover:file:bg-button-secondary-hover" />
            {importResult && (
              <div className="mb-4 rounded-lg border border-input-border bg-background-secondary p-3 text-xs">
                <p className="font-medium text-foreground">{importResult.created} created, {importResult.skipped} skipped</p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-foreground-muted">
                    {importResult.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={closeImportModal} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">
                {importResult ? "Close" : "Cancel"}
              </button>
              <button onClick={handleImportCsv} disabled={!importFile || importing}
                className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {importing ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
