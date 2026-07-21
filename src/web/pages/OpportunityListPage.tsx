import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { InlineEditCell } from "../components/InlineEditCell";
import { Search, TrendingUp, LayoutGrid, List, Trash2, RefreshCw, Plus } from "lucide-react";
import { BulkActionBar } from "../components/BulkActionBar";
import { ConfirmModal } from "../components/ConfirmModal";

type Opportunity = Awaited<ReturnType<typeof trpc.opportunities.getAllOpportunities.query>>["opportunities"][number];
type PipelineData = Awaited<ReturnType<typeof trpc.opportunities.getPipelineView.query>>;

export function OpportunityListPage() {
  const { scopes } = useAuth();
  const { basePath } = useApp();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");

  // Dev override: enable actions while DB/auth not available
  const canViewAll = true;
  const canViewTeam = true;
  const canEdit = true;
  const canDelete = true;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkStageOpen, setBulkStageOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState("InitialDiscussion");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (viewMode === "pipeline" && canViewAll) {
        const result = await trpc.opportunities.getPipelineView.query();
        setPipeline(result);
      } else {
        const params = { search: search || undefined, stage: stageFilter || undefined, limit: pageSize, offset: page * pageSize };
        let result;
        if (canViewAll) result = await trpc.opportunities.getAllOpportunities.query(params);
        else if (canViewTeam) result = await trpc.opportunities.getTeamOpportunities.query(params);
        else result = await trpc.opportunities.getMyOpportunities.query(params);
        setOpportunities(result.opportunities);
        setTotal(result.total);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [search, stageFilter, viewMode, canViewAll, canViewTeam, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selected.size === opportunities.length) setSelected(new Set());
    else setSelected(new Set(opportunities.map((o) => o.id)));
  };
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try { await trpc.opportunities.bulkDelete.mutate({ ids: Array.from(selected) }); setConfirmDeleteOpen(false); fetchData(); } catch (err) { console.error(err); } finally { setBulkDeleting(false); }
  };
  const handleBulkStage = async () => {
    try { await trpc.opportunities.bulkUpdateStage.mutate({ ids: Array.from(selected), stage: bulkStage }); setBulkStageOpen(false); fetchData(); } catch (err) { console.error(err); }
  };
  const bulkActions: Array<{ label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }> = [];
  if (canEdit) bulkActions.push({ label: "Update Stage", icon: <RefreshCw className="h-3 w-3" />, onClick: () => setBulkStageOpen(true) });
  if (canDelete) bulkActions.push({ label: "Delete", icon: <Trash2 className="h-3 w-3" />, onClick: () => setConfirmDeleteOpen(true), destructive: true });

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Opportunities</h1>
          {viewMode === "list" && <p className="text-xs text-foreground-muted">{total} total</p>}
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button onClick={() => navigate("/opportunities/new")} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              <Plus className="h-4 w-4" /> New Opportunity
            </button>
          )}
          {canViewAll && (
          <div className="flex items-center gap-1 rounded-lg border border-input-border p-0.5">
            <button onClick={() => setViewMode("list")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-background-secondary text-foreground" : "text-foreground-muted"}`}>
              <List className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("pipeline")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === "pipeline" ? "bg-background-secondary text-foreground" : "text-foreground-muted"}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        </div>
      </div>

      {viewMode === "list" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
              <input type="text" placeholder="Search opportunities..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus" />
            </div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
              className="rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
              <option value="">All Stages</option>
              {["LeadQualified","InitialDiscussion","PropertyShared","SiteVisitScheduled","SiteVisitCompleted","Interested","Negotiation","BookingIntent","AgreementDrafted","AgreementSigned","ClosedWon","ClosedLost"].map((s) => (
                <option key={s} value={s}>{s.replace(/([A-Z])/g, " $1").trim()}</option>
              ))}
            </select>
          </div>

          <BulkActionBar selectedCount={selected.size} onClearSelection={() => setSelected(new Set())} actions={bulkActions} />

          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          ) : opportunities.length === 0 ? (
            <EmptyState title="No opportunities found" icon={<TrendingUp className="h-10 w-10" />} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-card-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-background-secondary">
                    {(canDelete || canEdit) && (
                      <th className="w-10 px-3 py-3">
                        <input type="checkbox" checked={selected.size === opportunities.length && opportunities.length > 0} onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-input-border accent-primary-accent" />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Stage</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Prob.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Close Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Campaign</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Owner</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created By</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp) => (
                    <tr key={opp.id} className={`border-b border-border-subtle transition-colors hover:bg-background-secondary ${selected.has(opp.id) ? "bg-primary-50 dark:bg-primary-950" : ""}`}>
                      {(canDelete || canEdit) && (
                        <td className="w-10 px-3 py-3">
                          <input type="checkbox" checked={selected.has(opp.id)} onChange={() => toggleSelect(opp.id)}
                            className="h-4 w-4 rounded border-input-border accent-primary-accent" />
                        </td>
                      )}
                      <td className="px-4 py-3"><a href={`/opportunities/${opp.id}`} className="text-sm font-medium text-foreground hover:text-primary-text">{opp.name}</a></td>
                      <td className="px-4 py-3"><StatusBadge status={opp.stage} /></td>
                      <td className="px-4 py-3 text-right text-sm text-foreground-muted">{opp.amount != null ? `$${opp.amount.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3 text-right text-sm text-foreground-muted">{opp.probability != null ? `${opp.probability}%` : "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{opp.closeDate ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{opp.source ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        <InlineEditCell value={opp.campaignName} onSave={async (v) => { await trpc.opportunities.update.mutate({ id: opp.id, campaignName: v }); fetchData(); }} />
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{opp.owner?.name ?? opp.owner?.email ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{opp.createdByName ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(opp.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {viewMode === "list" && total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Previous</button>
          <span className="text-xs text-foreground-muted">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)} className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Next</button>
        </div>
      )}

      {viewMode === "pipeline" && (
        loading ? (
          <div className="flex gap-3 overflow-x-auto pb-4">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-64 w-64 shrink-0 rounded-xl" />)}</div>
        ) : pipeline ? (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {pipeline.pipeline.filter((s) => s.count > 0 || !["ClosedWon", "ClosedLost"].includes(s.stage)).map((stage) => (
              <div key={stage.stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground">{stage.stage.replace(/([A-Z])/g, " $1").trim()}</h3>
                  <span className="text-2xs text-foreground-muted">{stage.count}</span>
                </div>
                <div className="space-y-2">
                  {stage.opportunities.map((opp) => (
                    <div key={opp.id} onClick={() => navigate(`/opportunities/${opp.id}`)} className="cursor-pointer rounded-lg border border-card-border bg-card p-3 shadow-card transition-all hover:bg-card-hover">
                      <p className="text-sm font-medium text-foreground">{opp.name}</p>
                      {opp.amount != null && <p className="mt-1 text-xs font-medium text-foreground">${opp.amount.toLocaleString()}</p>}
                    </div>
                  ))}
                  {stage.count === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-foreground-subtle">No deals</p>}
                </div>
              </div>
            ))}
          </div>
        ) : null
      )}

      <ConfirmModal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} onConfirm={handleBulkDelete}
        title="Delete Selected Opportunities" message={`Are you sure you want to delete ${selected.size} opportunity${selected.size > 1 ? "ies" : "y"}?`}
        confirmLabel="Delete" destructive confirming={bulkDeleting} />

      {bulkStageOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setBulkStageOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Update Stage — {selected.size} opportunities</h3>
            <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}
              className="mb-4 w-full rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
              {["LeadQualified","InitialDiscussion","PropertyShared","SiteVisitScheduled","SiteVisitCompleted","Interested","Negotiation","BookingIntent","AgreementDrafted","AgreementSigned","ClosedWon","ClosedLost"].map((s) => (
                <option key={s} value={s}>{s.replace(/([A-Z])/g, " $1").trim()}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkStageOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleBulkStage} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
