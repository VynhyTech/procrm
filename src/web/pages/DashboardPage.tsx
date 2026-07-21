import React, { useCallback, useEffect, useState } from "react";
import { trpc } from "../trpc";
import { useAuth, useApp } from "../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ChartWrapper } from "../components/ChartWrapper";
import { FormModal, FormField } from "../components/FormModal";
import { pluralizeEntity } from "../constants/entityLabels";
import {
  CheckSquare, Square, Activity, LayoutGrid, Plus, X, Pencil,
  BarChart3, Table2,
} from "lucide-react";

const ADMIN_SCOPES = ["businessUnits:manage", "teams:manage"];

type LayoutBlock = Awaited<ReturnType<typeof trpc.homepage.getLayout.query>>[number];
type TodaysTasks = Awaited<ReturnType<typeof trpc.homepage.todaysTasks.query>>;
type RecentActivity = Awaited<ReturnType<typeof trpc.homepage.recentActivityData.query>>;
type ReportSummary = Awaited<ReturnType<typeof trpc.reports.list.query>>[number];
type DashboardSummary = Awaited<ReturnType<typeof trpc.dashboards.list.query>>[number];

const RELATED_URL: Record<string, string> = {
  Lead: "/leads",
  Contact: "/contacts",
  Opportunity: "/opportunities",
};

const LIST_VIEW_ENTITIES = ["Lead", "Contact", "Opportunity"] as const;

const BLOCK_TYPE_LABELS: Record<string, string> = {
  report: "Report",
  dashboard: "Dashboard",
  listView: "List View",
  myTasks: "My Tasks",
  recentActivity: "Recent Activity",
};

const TODAY = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// Column span within the 3-column Homepage grid (md breakpoint and up; always full-width below that).
const SIZE_COL_SPAN: Record<string, string> = {
  small: "md:col-span-1",
  medium: "md:col-span-2",
  large: "md:col-span-3",
};

export function DashboardPage() {
  const { user, scopes } = useAuth();
  const { basePath } = useApp();
  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const isAdmin = ADMIN_SCOPES.some((s) => scopes.includes(s));

  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    try { setBlocks(await trpc.homepage.getLayout.query()); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([trpc.reports.list.query(), trpc.dashboards.list.query()])
      .then(([r, d]) => { setReports(r); setDashboards(d); })
      .catch(() => {});
  }, [isAdmin]);

  const handleRemoveBlock = async (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    try { await trpc.homepage.removeBlock.mutate({ id }); } catch (err) { console.error(err); fetchLayout(); }
  };

  const persistOrder = async (next: LayoutBlock[]) => {
    setBlocks(next);
    try { await trpc.homepage.reorderBlocks.mutate({ orderedIds: next.map((b) => b.id) }); }
    catch (err) { console.error(err); fetchLayout(); }
  };

  const handleDropOnBlock = (targetId: string) => {
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }
    const next = [...blocks];
    const fromIndex = next.findIndex((b) => b.id === draggedId);
    const toIndex = next.findIndex((b) => b.id === targetId);
    setDraggedId(null);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persistOrder(next);
  };

  const handleChangeSize = async (id: string, size: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, size } : b)));
    try { await trpc.homepage.updateBlockSize.mutate({ id, size: size as "small" | "medium" | "large" }); }
    catch (err) { console.error(err); fetchLayout(); }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Homepage</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">Welcome back, {user?.name ?? "there"}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-foreground-subtle">{TODAY}</p>
          {isAdmin && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium shadow-card transition-colors ${
                editMode ? "bg-button-primary-bg text-button-primary-text hover:bg-button-primary-hover" : "border-2 border-primary-accent text-primary-text hover:bg-primary-50 dark:hover:bg-primary-950"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" /> {editMode ? "Done Customizing" : "Customize Homepage"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-40 rounded-xl" />)}</div>
      ) : blocks.length === 0 ? (
        <EmptyState
          title={isAdmin ? "Your homepage is empty" : "Nothing has been added to your homepage yet"}
          description={isAdmin ? "Click Customize Homepage to add reports, dashboards, list views, and more." : "Check back once your admin sets it up."}
          icon={<LayoutGrid className="h-10 w-10" />}
          action={isAdmin ? (
            <button onClick={() => { setEditMode(true); setAddOpen(true); }} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              Add Your First Block
            </button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {blocks.map((block) => (
            <div
              key={block.id}
              draggable={editMode}
              onDragStart={editMode ? (e) => { setDraggedId(block.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
              onDragEnd={editMode ? () => { setDraggedId(null); setDragOverId(null); } : undefined}
              onDragOver={editMode ? (e) => { e.preventDefault(); if (dragOverId !== block.id) setDragOverId(block.id); } : undefined}
              onDragLeave={editMode ? () => setDragOverId((prev) => (prev === block.id ? null : prev)) : undefined}
              onDrop={editMode ? (e) => { e.preventDefault(); handleDropOnBlock(block.id); } : undefined}
              className={`rounded-xl border bg-card p-4 shadow-card transition-colors ${SIZE_COL_SPAN[block.size] ?? "md:col-span-2"} ${
                dragOverId === block.id && draggedId && draggedId !== block.id ? "border-primary-accent bg-primary-50 dark:bg-primary-950" : "border-card-border"
              } ${draggedId === block.id ? "opacity-40" : ""} ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
                  {block.title || block.report?.name || block.dashboard?.name || BLOCK_TYPE_LABELS[block.type]}
                </h2>
                {editMode && (
                  <div draggable={false} onDragStart={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1">
                    <select
                      value={block.size}
                      onChange={(e) => handleChangeSize(block.id, e.target.value)}
                      title="Width"
                      className="rounded-md border border-input-border bg-input-bg py-1 pl-2 pr-6 text-2xs text-input-text outline-none"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                    <button onClick={() => handleRemoveBlock(block.id)} className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-950"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
              <div className={editMode ? "pointer-events-none" : undefined}>
                <BlockContent block={block} navigate={navigate} />
              </div>
            </div>
          ))}

          {editMode && (
            <button onClick={() => setAddOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-input-border py-4 text-sm font-medium text-foreground-muted transition-colors hover:border-primary-accent hover:text-primary-text md:col-span-3">
              <Plus className="h-4 w-4" /> Add Block
            </button>
          )}
        </div>
      )}

      <AddBlockModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        reports={reports}
        dashboards={dashboards}
        onAdded={() => { setAddOpen(false); fetchLayout(); }}
      />
    </div>
  );
}

function BlockContent({ block, navigate }: { block: LayoutBlock; navigate: (path: string) => void }) {
  if (block.type === "myTasks") return <MyTasksBlock navigate={navigate} />;
  if (block.type === "recentActivity") return <RecentActivityBlock />;
  if (block.type === "listView" && block.entityType) return <ListViewBlock entityType={block.entityType} navigate={navigate} />;
  if (block.type === "report") {
    if (!block.report) return <p className="py-4 text-center text-xs text-foreground-muted">This report no longer exists.</p>;
    return <ReportBlock report={block.report} />;
  }
  if (block.type === "dashboard") {
    if (!block.dashboard) return <p className="py-4 text-center text-xs text-foreground-muted">This dashboard no longer exists.</p>;
    return <DashboardBlock dashboardId={block.dashboard.id} />;
  }
  return null;
}

function ReportBlock({ report }: { report: NonNullable<LayoutBlock["report"]> }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof trpc.reports.execute.query>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const config = JSON.parse(report.config);
    trpc.reports.execute.query({ entityType: report.entityType, config })
      .then(setResult).catch(console.error).finally(() => setLoading(false));
  }, [report.id, report.config, report.entityType]);

  if (loading) return <div className="skeleton h-48 rounded-lg" />;
  if (!result || result.rows.length === 0) return <EmptyState title="No data" icon={<BarChart3 className="h-8 w-8" />} />;

  const config = JSON.parse(report.config);
  if (result.chartData && config.chartType !== "table") {
    const chartType = ["bar", "line", "pie", "doughnut"].includes(config.chartType) ? config.chartType : "bar";
    return <ChartWrapper type={chartType} labels={result.chartData.labels} values={result.chartData.values} label={config.aggregation === "sum" ? "Amount" : "Count"} height={220} />;
  }

  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background-secondary">
          <tr>
            {Object.keys(result.rows[0]).filter((k) => k !== "org" && k !== "orgId").slice(0, 5).map((key) => (
              <th key={key} className="px-3 py-2 text-left text-2xs font-medium text-foreground-muted">{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 8).map((row, i) => (
            <tr key={i} className="border-t border-border-subtle">
              {Object.entries(row).filter(([k]) => k !== "org" && k !== "orgId").slice(0, 5).map(([key, val]) => (
                <td key={key} className="px-3 py-2 text-xs text-foreground-muted">{val && typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardBlock({ dashboardId }: { dashboardId: string }) {
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof trpc.dashboards.getById.query>> | null>(null);
  const [results, setResults] = useState<Record<string, Awaited<ReturnType<typeof trpc.dashboards.executeWidget.query>>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    trpc.dashboards.getById.query({ id: dashboardId }).then(async (d) => {
      if (cancelled) return;
      setDashboard(d);
      const filters = JSON.parse(d.filters || "[]");
      const entries = await Promise.all(d.widgets.map(async (w) => {
        const r = await trpc.dashboards.executeWidget.query({ entityType: w.entityType, groupBy: w.groupBy ?? undefined, aggregation: (w.aggregation as "count" | "sum" | "avg") ?? undefined, dashboardFilters: filters });
        return [w.id, r] as const;
      }));
      if (!cancelled) setResults(Object.fromEntries(entries));
    }).catch(console.error).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dashboardId]);

  if (loading) return <div className="skeleton h-48 rounded-lg" />;
  if (!dashboard || dashboard.widgets.length === 0) return <EmptyState title="This dashboard has no widgets yet" icon={<BarChart3 className="h-8 w-8" />} />;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {dashboard.widgets.map((w) => {
        const r = results[w.id];
        return (
          <div key={w.id} className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-2xs font-medium text-foreground-muted">{w.entityType}{w.groupBy ? ` by ${w.groupBy}` : ""}</p>
            {!r ? <div className="skeleton h-32 rounded-lg" /> : r.chartData ? (
              <ChartWrapper type={["bar", "line", "pie", "doughnut"].includes(w.chartType) ? (w.chartType as "bar" | "line" | "pie" | "doughnut") : "bar"} labels={r.chartData.labels} values={r.chartData.values} height={160} />
            ) : (
              <p className="text-sm text-foreground-muted">{r.total} records</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListViewBlock({ entityType, navigate }: { entityType: string; navigate: (path: string) => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof trpc.homepage.listViewData.query>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trpc.homepage.listViewData.query({ entityType: entityType as typeof LIST_VIEW_ENTITIES[number] }).then(setRows).catch(console.error).finally(() => setLoading(false));
  }, [entityType]);

  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>;
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-foreground-muted">No {entityType.toLowerCase()} records yet</p>;

  return (
    <div className="space-y-1">
      {rows.map((row: Record<string, unknown>) => {
        const label = entityType === "Opportunity" ? String(row.name) : `${row.firstName} ${row.lastName}`;
        const sub = entityType === "Lead" ? String(row.status ?? "") : entityType === "Contact" ? String(row.lifecycleStage ?? "") : String(row.stage ?? "");
        return (
          <button key={String(row.id)} onClick={() => navigate(`${RELATED_URL[entityType]}/${row.id}`)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-background-secondary">
            <span className="truncate text-sm text-foreground">{label}</span>
            <span className="shrink-0 text-2xs text-foreground-subtle">{sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function MyTasksBlock({ navigate }: { navigate: (path: string) => void }) {
  const [tasksData, setTasksData] = useState<TodaysTasks | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(() => {
    trpc.homepage.todaysTasks.query().then(setTasksData).catch(console.error).finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggleTask = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Completed" ? "Open" : "Completed";
    setTasksData((prev) => (prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)) } : prev));
    await trpc.tasks.update.mutate({ id, status: nextStatus });
  };

  if (loading || !tasksData) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>;

  return (
    <>
      {tasksData.tasks.length === 0 ? (
        <p className="py-4 text-center text-xs text-foreground-muted">No tasks due today</p>
      ) : (
        <div className="space-y-1">
          {tasksData.tasks.map((t) => {
            const done = t.status === "Completed";
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-background-secondary">
                <button onClick={() => toggleTask(t.id, t.status)} className="shrink-0 text-foreground-subtle transition-colors hover:text-primary-accent">
                  {done ? <CheckSquare className="h-4 w-4 text-success-500" /> : <Square className="h-4 w-4" />}
                </button>
                <button onClick={() => navigate(`${RELATED_URL[t.relatedObjectType] ?? ""}/${t.relatedObjectId}`)} className={`min-w-0 flex-1 truncate text-left text-sm ${done ? "text-foreground-subtle line-through" : "text-foreground"}`}>
                  {t.subject}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => navigate("/tasks")} className="mt-3 w-full rounded-lg border border-input-border py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-background-secondary">
        View All ({tasksData.totalOpen} Tasks)
      </button>
    </>
  );
}

function RecentActivityBlock() {
  const [activities, setActivities] = useState<RecentActivity>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trpc.homepage.recentActivityData.query().then(setActivities).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>;
  if (activities.length === 0) return <p className="py-4 text-center text-xs text-foreground-muted">No recent activity yet</p>;

  return (
    <div className="space-y-1.5">
      {activities.map((a) => (
        <a key={a.id} href={`${RELATED_URL[a.relatedObjectType] ?? ""}/${a.relatedObjectId}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-background-secondary">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">
              <span className="font-medium">{a.activityType}</span>
              {a.relatedName && <span className="text-foreground-muted"> · {a.relatedName}</span>}
            </p>
            {a.notes && <p className="truncate text-xs text-foreground-muted">{a.notes}</p>}
          </div>
          <span className="shrink-0 text-2xs text-foreground-subtle">{new Date(a.createdAt).toLocaleDateString()}</span>
        </a>
      ))}
    </div>
  );
}

function AddBlockModal({ open, onClose, reports, dashboards, onAdded }: {
  open: boolean;
  onClose: () => void;
  reports: ReportSummary[];
  dashboards: DashboardSummary[];
  onAdded: () => void;
}) {
  const [type, setType] = useState<"report" | "dashboard" | "listView" | "myTasks" | "recentActivity">("report");
  const [title, setTitle] = useState("");
  const [reportId, setReportId] = useState("");
  const [dashboardId, setDashboardId] = useState("");
  const [entityType, setEntityType] = useState<string>("Lead");
  const [size, setSize] = useState<"small" | "medium" | "large">("large");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setType("report"); setTitle(""); setReportId(""); setDashboardId(""); setEntityType("Lead"); setSize("large"); }
  }, [open]);

  const handleTypeChange = (next: typeof type) => {
    setType(next);
    // Sensible starting width per type — admin can still override below.
    setSize(next === "myTasks" || next === "recentActivity" ? "small" : next === "listView" ? "medium" : "large");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await trpc.homepage.addBlock.mutate({
        type,
        title: title || undefined,
        reportId: type === "report" ? reportId : undefined,
        dashboardId: type === "dashboard" ? dashboardId : undefined,
        entityType: type === "listView" ? (entityType as typeof LIST_VIEW_ENTITIES[number]) : undefined,
        size,
      });
      onAdded();
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const canSubmit = type === "myTasks" || type === "recentActivity" || (type === "report" && !!reportId) || (type === "dashboard" && !!dashboardId) || (type === "listView" && !!entityType);
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <FormModal open={open} onClose={onClose} title="Add Block" onSubmit={handleSubmit} submitLabel="Add to Homepage" submitting={submitting}>
      <FormField label="Type">
        <select value={type} onChange={(e) => handleTypeChange(e.target.value as typeof type)} className={selectClass}>
          <option value="report">Report</option>
          <option value="dashboard">Dashboard</option>
          <option value="listView">List View</option>
          <option value="myTasks">My Tasks</option>
          <option value="recentActivity">Recent Activity</option>
        </select>
      </FormField>

      {type === "report" && (
        <FormField label="Report" required>
          <select value={reportId} onChange={(e) => setReportId(e.target.value)} className={selectClass}>
            <option value="">Select a report...</option>
            {reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {reports.length === 0 && <p className="mt-1 text-2xs text-foreground-subtle">No shared reports available yet — create or share one from the Reports tab first.</p>}
        </FormField>
      )}
      {type === "dashboard" && (
        <FormField label="Dashboard" required>
          <select value={dashboardId} onChange={(e) => setDashboardId(e.target.value)} className={selectClass}>
            <option value="">Select a dashboard...</option>
            {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {dashboards.length === 0 && <p className="mt-1 text-2xs text-foreground-subtle">No shared dashboards available yet — create or share one from the Dashboards tab first.</p>}
        </FormField>
      )}
      {type === "listView" && (
        <FormField label="Entity" required>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className={selectClass}>
            {LIST_VIEW_ENTITIES.map((e) => <option key={e} value={e}>{pluralizeEntity(e)}</option>)}
          </select>
        </FormField>
      )}

      <FormField label="Width">
        <select value={size} onChange={(e) => setSize(e.target.value as typeof size)} className={selectClass}>
          <option value="small">Small (1/3 width)</option>
          <option value="medium">Medium (2/3 width)</option>
          <option value="large">Large (full width)</option>
        </select>
      </FormField>

      <FormField label="Custom Title (optional)">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Leave blank to use the default name" />
      </FormField>

      {!canSubmit && (type === "report" || type === "dashboard" || type === "listView") && (
        <p className="text-2xs text-foreground-subtle flex items-center gap-1"><Table2 className="h-3 w-3" /> Pick an option above to continue.</p>
      )}
    </FormModal>
  );
}
