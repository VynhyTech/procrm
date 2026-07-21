import React, { useCallback, useEffect, useState } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { ChartWrapper } from "../components/ChartWrapper";
import { FormModal, FormField } from "../components/FormModal";
import { EmptyState } from "../components/EmptyState";
import { ArrowLeft, Plus, Trash2, LayoutDashboard, Save } from "lucide-react";

type DashboardDef = Awaited<ReturnType<typeof trpc.dashboards.getById.query>>;
type FolderDef = Awaited<ReturnType<typeof trpc.dashboards.listFolders.query>>[number];
type WidgetDef = DashboardDef["widgets"][number];
type WidgetResult = { rows: Record<string, unknown>[]; total: number; chartData: { labels: string[]; values: number[] } | null };

const ENTITY_TYPES = ["Lead", "Contact", "Opportunity"];
const CHART_TYPES = ["table", "bar", "line", "pie", "doughnut"] as const;
const OPERATORS = ["equals", "contains", "gt", "lt"] as const;

interface DashboardFilter {
  entityType: string;
  field: string;
  operator: "equals" | "contains" | "gt" | "lt";
  value: string;
}

interface DashboardBuilderPageProps {
  id?: string;
}

export function DashboardBuilderPage({ id }: DashboardBuilderPageProps) {
  const { basePath } = useApp();
  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const [dashboardId, setDashboardId] = useState<string | undefined>(id);
  const [loading, setLoading] = useState(!!id);
  const [folders, setFolders] = useState<FolderDef[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [filters, setFilters] = useState<DashboardFilter[]>([]);
  const [filterEntityType, setFilterEntityType] = useState("Lead");
  const [filterField, setFilterField] = useState("");
  const [filterOperator, setFilterOperator] = useState<DashboardFilter["operator"]>("equals");
  const [filterValue, setFilterValue] = useState("");
  const [filterFields, setFilterFields] = useState<string[]>([]);

  const [widgets, setWidgets] = useState<WidgetDef[]>([]);
  const [results, setResults] = useState<Record<string, WidgetResult>>({});
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [widgetEntityType, setWidgetEntityType] = useState("Lead");
  const [widgetChartType, setWidgetChartType] = useState<typeof CHART_TYPES[number]>("bar");
  const [widgetGroupBy, setWidgetGroupBy] = useState("");
  const [widgetAggregation, setWidgetAggregation] = useState<"count" | "sum" | "avg">("count");
  const [widgetFields, setWidgetFields] = useState<string[]>([]);
  const [addingWidget, setAddingWidget] = useState(false);

  useEffect(() => {
    trpc.dashboards.listFolders.query().then(setFolders).catch(console.error);
  }, []);

  useEffect(() => {
    trpc.reports.getEntityFields.query({ entityType: "Lead" }).then((r) => {
      setFilterFields(r.fields);
      setFilterField(r.fields[0] ?? "");
    }).catch(console.error);
    trpc.reports.getEntityFields.query({ entityType: "Lead" }).then((r) => {
      setWidgetFields(r.fields);
      setWidgetGroupBy(r.fields[0] ?? "");
    }).catch(console.error);
  }, []);

  const handleFilterEntityChange = async (entityType: string) => {
    setFilterEntityType(entityType);
    try {
      const r = await trpc.reports.getEntityFields.query({ entityType });
      setFilterFields(r.fields);
      setFilterField(r.fields[0] ?? "");
    } catch (err) { console.error(err); }
  };

  const handleWidgetEntityChange = async (entityType: string) => {
    setWidgetEntityType(entityType);
    try {
      const r = await trpc.reports.getEntityFields.query({ entityType });
      setWidgetFields(r.fields);
      setWidgetGroupBy(r.fields[0] ?? "");
    } catch (err) { console.error(err); }
  };

  const runWidget = useCallback(async (widget: WidgetDef, currentFilters: DashboardFilter[]) => {
    try {
      const result = await trpc.dashboards.executeWidget.query({
        entityType: widget.entityType,
        groupBy: widget.groupBy ?? undefined,
        aggregation: (widget.aggregation as "count" | "sum" | "avg" | undefined) ?? undefined,
        dashboardFilters: currentFilters,
      });
      setResults((prev) => ({ ...prev, [widget.id]: result }));
    } catch (err) { console.error(err); }
  }, []);

  const runAllWidgets = useCallback((widgetList: WidgetDef[], currentFilters: DashboardFilter[]) => {
    widgetList.forEach((w) => runWidget(w, currentFilters));
  }, [runWidget]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dashboard = await trpc.dashboards.getById.query({ id });
        if (cancelled) return;
        setDashboardId(dashboard.id);
        setName(dashboard.name);
        setDescription(dashboard.description ?? "");
        setIsShared(dashboard.isShared);
        setFolderId(dashboard.folderId ?? "");
        const parsedFilters: DashboardFilter[] = JSON.parse(dashboard.filters || "[]");
        setFilters(parsedFilters);
        setWidgets(dashboard.widgets);
        runAllWidgets(dashboard.widgets, parsedFilters);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (dashboardId) {
        await trpc.dashboards.update.mutate({
          id: dashboardId, name, description: description || undefined, isShared, folderId: folderId || null, filters,
        });
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
        runAllWidgets(widgets, filters);
      } else {
        const created = await trpc.dashboards.create.mutate({
          name, description: description || undefined, isShared, folderId: folderId || null, filters,
        });
        setDashboardId(created.id);
      }
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const addFilter = () => {
    if (!filterField) return;
    const next = [...filters, { entityType: filterEntityType, field: filterField, operator: filterOperator, value: filterValue }];
    setFilters(next);
    setFilterValue("");
    runAllWidgets(widgets, next);
  };

  const removeFilter = (idx: number) => {
    const next = filters.filter((_, i) => i !== idx);
    setFilters(next);
    runAllWidgets(widgets, next);
  };

  const handleAddWidget = async () => {
    if (!dashboardId) return;
    setAddingWidget(true);
    try {
      const widget = await trpc.dashboards.addWidget.mutate({
        dashboardId,
        entityType: widgetEntityType,
        chartType: widgetChartType,
        groupBy: widgetGroupBy || undefined,
        aggregation: widgetAggregation,
      });
      setWidgets((prev) => [...prev, widget]);
      runWidget(widget, filters);
      setAddWidgetOpen(false);
    } catch (err) { console.error(err); } finally { setAddingWidget(false); }
  };

  const handleRemoveWidget = async (widgetId: string) => {
    try {
      await trpc.dashboards.removeWidget.mutate({ id: widgetId });
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    } catch (err) { console.error(err); }
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = inputClass;

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboards")} className="rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-background-secondary hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-foreground">{name || "New Dashboard"}</h1>
              {description && <p className="text-xs text-foreground-subtle">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {justSaved && <span className="text-xs font-medium text-success-600">Saved</span>}
            <button onClick={handleSave} disabled={saving || !name.trim()} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {dashboardId ? "Save" : "Create Dashboard"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Sales Overview" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="What's this dashboard for?" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Folder</label>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={selectClass}>
              <option value="">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} className="h-4 w-4 rounded border-input-border accent-primary-accent" />
              Share with organization
            </label>
          </div>
        </div>

        {!dashboardId ? (
          <EmptyState
            title="Save your dashboard to start adding widgets"
            description="Give it a name above, then click Create Dashboard"
            icon={<LayoutDashboard className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* Filters */}
            <div className="mb-6 rounded-xl border border-card-border bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Filters ({filters.length})</h2>
              </div>
              {filters.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  {filters.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-background-secondary px-2.5 py-1.5">
                      <span className="text-xs text-foreground">
                        <span className="font-medium">{f.entityType}</span>: {f.field} {f.operator} {f.value}
                      </span>
                      <button onClick={() => removeFilter(idx)} className="text-foreground-subtle transition-colors hover:text-error-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={filterEntityType} onChange={(e) => handleFilterEntityChange(e.target.value)} className={selectClass + " w-28"}>
                  {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterField} onChange={(e) => setFilterField(e.target.value)} className={selectClass + " w-32"}>
                  {filterFields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={filterOperator} onChange={(e) => setFilterOperator(e.target.value as DashboardFilter["operator"])} className={selectClass + " w-28"}>
                  {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <input type="text" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} placeholder="Value..." className={inputClass + " w-32"} />
                <button onClick={addFilter} className="flex items-center gap-1 rounded-md bg-button-ghost-bg px-2 py-1.5 text-xs font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">
                  <Plus className="h-3 w-3" /> Add Filter
                </button>
              </div>
              <p className="mt-2 text-2xs text-foreground-subtle">Filters only apply to widgets matching their entity type.</p>
            </div>

            {/* Widgets */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Widgets ({widgets.length})</h2>
              <button onClick={() => setAddWidgetOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-sm font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover">
                <Plus className="h-3.5 w-3.5" /> Add Widget
              </button>
            </div>

            {widgets.length === 0 ? (
              <EmptyState title="No widgets yet" description="Add a widget to start visualizing data" icon={<LayoutDashboard className="h-10 w-10" />} />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {widgets.map((w) => {
                  const result = results[w.id];
                  return (
                    <div key={w.id} className="rounded-xl border border-card-border bg-card p-4 shadow-card">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{w.entityType}{w.groupBy ? ` by ${w.groupBy}` : ""}</p>
                          <p className="text-2xs text-foreground-subtle">{w.chartType} · {w.aggregation ?? "count"}</p>
                        </div>
                        <button onClick={() => handleRemoveWidget(w.id)} className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-950">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {!result ? (
                        <div className="skeleton h-40 rounded-lg" />
                      ) : result.chartData && w.chartType !== "table" ? (
                        <ChartWrapper
                          type={w.chartType === "bar" || w.chartType === "line" || w.chartType === "pie" || w.chartType === "doughnut" ? w.chartType : "bar"}
                          labels={result.chartData.labels}
                          values={result.chartData.values}
                          label={w.aggregation === "sum" ? "Amount" : "Count"}
                          height={220}
                        />
                      ) : (
                        <p className="text-sm text-foreground-muted">{result.total} records</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <FormModal open={addWidgetOpen} onClose={() => setAddWidgetOpen(false)} title="Add Widget" onSubmit={handleAddWidget} submitLabel="Add" submitting={addingWidget}>
        <FormField label="Entity" required>
          <select value={widgetEntityType} onChange={(e) => handleWidgetEntityChange(e.target.value)} className={selectClass}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Chart Type">
          <select value={widgetChartType} onChange={(e) => setWidgetChartType(e.target.value as typeof CHART_TYPES[number])} className={selectClass}>
            {CHART_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </FormField>
        <FormField label="Group By">
          <select value={widgetGroupBy} onChange={(e) => setWidgetGroupBy(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {widgetFields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </FormField>
        <FormField label="Aggregation">
          <select value={widgetAggregation} onChange={(e) => setWidgetAggregation(e.target.value as "count" | "sum" | "avg")} className={selectClass}>
            <option value="count">Count</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
          </select>
        </FormField>
      </FormModal>
    </div>
  );
}
