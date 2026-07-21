import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { trpc } from "../trpc";
import { useApp } from "../lib/auth";
import { ChartWrapper } from "../components/ChartWrapper";
import { FormModal, FormField } from "../components/FormModal";
import { EmptyState } from "../components/EmptyState";
import { REPORT_TEMPLATES } from "../constants/reportTemplates";
import { ArrowLeft, Plus, Play, Save, Trash2, BarChart3 } from "lucide-react";

type ReportDef = Pick<Awaited<ReturnType<typeof trpc.reports.getById.query>>, "id" | "name" | "description" | "entityType" | "config" | "isShared" | "folderId">;
type FolderDef = Awaited<ReturnType<typeof trpc.reports.listFolders.query>>[number];

const ENTITY_TYPES = ["Lead", "Contact", "Opportunity"];
const CHART_TYPES = ["table", "bar", "line", "pie", "doughnut"] as const;
const OPERATORS = ["equals", "contains", "gt", "lt"] as const;

interface ReportConfig {
  fields: string[];
  filters: Array<{ field: string; operator: string; value: string }>;
  chartType: string;
  groupBy?: string;
  sortBy?: string;
  sortOrder?: string;
  aggregation?: string;
}

function normalizeConfig(raw: unknown): ReportConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { fields: [], filters: [], chartType: "table", aggregation: "count" };
  }
  const obj = Object.fromEntries(Object.entries(raw));
  return {
    fields: Array.isArray(obj.fields) ? (obj.fields as unknown[]).map(String) : [],
    filters: Array.isArray(obj.filters) ? (obj.filters as unknown[]).map((item) => {
      const f = item && typeof item === "object" ? Object.fromEntries(Object.entries(item)) : {};
      return { field: String(f.field ?? ""), operator: String(f.operator ?? "equals"), value: String(f.value ?? "") };
    }) : [],
    chartType: typeof obj.chartType === "string" ? obj.chartType : "table",
    groupBy: typeof obj.groupBy === "string" ? obj.groupBy : undefined,
    sortBy: typeof obj.sortBy === "string" ? obj.sortBy : undefined,
    sortOrder: typeof obj.sortOrder === "string" ? obj.sortOrder : undefined,
    aggregation: typeof obj.aggregation === "string" ? obj.aggregation : "count",
  };
}

interface ReportBuilderPageProps {
  id?: string;
}

export function ReportBuilderPage({ id }: ReportBuilderPageProps) {
  const { basePath } = useApp();
  const [searchParams] = useSearchParams();
  const templateKey = searchParams.get("template");

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const [loadedReport, setLoadedReport] = useState<ReportDef | null>(null);
  const [loadingReport, setLoadingReport] = useState(!!id);
  const [folders, setFolders] = useState<FolderDef[]>([]);

  const [entityType, setEntityType] = useState("Lead");
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [config, setConfig] = useState<ReportConfig>({
    fields: [], filters: [], chartType: "table", groupBy: undefined, aggregation: "count",
  });
  const [results, setResults] = useState<{ rows: Record<string, unknown>[]; total: number; chartData: { labels: string[]; values: number[] } | null } | null>(null);
  const [running, setRunning] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveFolderId, setSaveFolderId] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const fetchFieldsFor = useCallback(async (et: string) => {
    const r = await trpc.reports.getEntityFields.query({ entityType: et });
    setAvailableFields(r.fields);
    return r.fields;
  }, []);

  useEffect(() => {
    trpc.reports.listFolders.query().then(setFolders).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingReport(!!id);
      try {
        if (id) {
          const report = await trpc.reports.getById.query({ id });
          if (cancelled) return;
          await fetchFieldsFor(report.entityType);
          if (cancelled) return;
          setEntityType(report.entityType);
          setConfig(normalizeConfig(JSON.parse(report.config)));
          setLoadedReport(report);
          setSaveName(report.name);
          setSaveDescription(report.description ?? "");
          setIsShared(report.isShared);
          setSaveFolderId(report.folderId ?? "");
        } else if (templateKey) {
          const template = REPORT_TEMPLATES.find((t) => t.key === templateKey);
          if (template) {
            await fetchFieldsFor(template.entityType);
            if (cancelled) return;
            setEntityType(template.entityType);
            setConfig({ ...template.config });
            setSaveName(template.name);
            setSaveDescription(template.description);
          } else {
            await fetchFieldsFor(entityType);
          }
        } else {
          const fields = await fetchFieldsFor(entityType);
          if (cancelled) return;
          setConfig((c) => ({ ...c, fields: fields.slice(0, 3), groupBy: fields[0] }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    })();
    return () => { cancelled = true; };
    // Only re-run when navigating to a different report id — entityType/templateKey are read once at init.
  }, [id]);

  const handleEntityChange = async (et: string) => {
    setEntityType(et);
    const fields = await fetchFieldsFor(et);
    setConfig((c) => ({ ...c, fields: fields.slice(0, 3), groupBy: fields[0] }));
  };

  const buildConfig = (): {
    fields: string[];
    filters: Array<{ field: string; operator: "equals" | "contains" | "gt" | "lt" | "between" | "in"; value: string }>;
    chartType: "table" | "bar" | "line" | "pie" | "doughnut";
    groupBy?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    aggregation?: "count" | "sum" | "avg";
  } => {
    const opMap: Record<string, "equals" | "contains" | "gt" | "lt"> = { equals: "equals", contains: "contains", gt: "gt", lt: "lt" };
    const chartMap: Record<string, "table" | "bar" | "line" | "pie" | "doughnut"> = { table: "table", bar: "bar", line: "line", pie: "pie", doughnut: "doughnut" };
    return {
      fields: config.fields,
      filters: config.filters.map((f) => ({
        field: f.field,
        operator: opMap[f.operator] ?? "equals",
        value: f.value,
      })),
      chartType: chartMap[config.chartType] ?? "table",
      groupBy: config.groupBy,
      sortBy: config.sortBy,
      sortOrder: config.sortOrder === "asc" || config.sortOrder === "desc" ? config.sortOrder : undefined,
      aggregation: config.aggregation === "count" || config.aggregation === "sum" || config.aggregation === "avg" ? config.aggregation : undefined,
    };
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await trpc.reports.execute.query({ entityType, config: buildConfig() });
      setResults(result);
    } catch (err) { console.error(err); } finally { setRunning(false); }
  };

  const handleSaveClick = () => {
    if (loadedReport) {
      handleUpdateExisting();
    } else {
      setSaveOpen(true);
    }
  };

  const handleUpdateExisting = async () => {
    if (!loadedReport) return;
    setSaving(true);
    try {
      const updated = await trpc.reports.update.mutate({ id: loadedReport.id, config: buildConfig() });
      setLoadedReport({ ...loadedReport, ...updated });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleSaveNew = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const created = await trpc.reports.create.mutate({
        name: saveName,
        description: saveDescription || undefined,
        entityType,
        config: buildConfig(),
        isShared,
        folderId: saveFolderId || undefined,
      });
      setSaveOpen(false);
      setLoadedReport(created);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const addFilter = () => {
    setConfig((c) => ({
      ...c,
      filters: [...c.filters, { field: availableFields[0] ?? "", operator: "equals", value: "" }],
    }));
  };

  const removeFilter = (idx: number) => {
    setConfig((c) => ({ ...c, filters: c.filters.filter((_, i) => i !== idx) }));
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-3 pr-8 py-1.5 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  if (loadingReport) {
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
            <button onClick={() => navigate("/reports")} className="rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-background-secondary hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-foreground">{loadedReport ? loadedReport.name : (saveName || "New Report")}</h1>
              <p className="text-xs text-foreground-subtle">{entityType} report</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {justSaved && <span className="text-xs font-medium text-success-600">Saved</span>}
            <button onClick={handleSaveClick} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-sm font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <button onClick={handleRun} disabled={running} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
              <Play className="h-3.5 w-3.5" /> {running ? "Running..." : "Run Report"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Config rail */}
        <div className="lg:border-r lg:border-border lg:pr-6">
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Entity</label>
            <select value={entityType} onChange={(e) => handleEntityChange(e.target.value)} className={selectClass}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Chart</label>
              <select value={config.chartType} onChange={(e) => setConfig({ ...config, chartType: e.target.value })} className={selectClass}>
                {CHART_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Aggregation</label>
              <select value={config.aggregation ?? "count"} onChange={(e) => setConfig({ ...config, aggregation: e.target.value })} className={selectClass}>
                <option value="count">Count</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
              </select>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Group By</label>
              <select value={config.groupBy ?? ""} onChange={(e) => setConfig({ ...config, groupBy: e.target.value || undefined })} className={selectClass}>
                <option value="">None</option>
                {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground-subtle">Sort By</label>
              <select
                value={config.sortBy ?? ""}
                onChange={(e) => setConfig({ ...config, sortBy: e.target.value || undefined, sortOrder: e.target.value ? "desc" : undefined })}
                className={selectClass}
              >
                <option value="">Default</option>
                {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Filters ({config.filters.length})</h3>
              <button onClick={addFilter} className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-background-secondary hover:text-foreground">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {config.filters.length === 0 ? (
              <p className="text-xs text-foreground-subtle">No filters applied</p>
            ) : (
              config.filters.map((filter, idx) => (
                <div key={idx} className="mb-2 space-y-1.5 rounded-lg border border-border-subtle p-2">
                  <div className="flex items-center gap-1.5">
                    <select value={filter.field} onChange={(e) => {
                      const filters = [...config.filters];
                      filters[idx] = { ...filter, field: e.target.value };
                      setConfig({ ...config, filters });
                    }} className={selectClass + " flex-1"}>
                      {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button onClick={() => removeFilter(idx)} className="shrink-0 p-1 text-foreground-subtle transition-colors hover:text-error-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select value={filter.operator} onChange={(e) => {
                      const filters = [...config.filters];
                      filters[idx] = { ...filter, operator: e.target.value };
                      setConfig({ ...config, filters });
                    }} className={selectClass + " flex-1"}>
                      {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input type="text" value={filter.value} onChange={(e) => {
                      const filters = [...config.filters];
                      filters[idx] = { ...filter, value: e.target.value };
                      setConfig({ ...config, filters });
                    }} className={inputClass + " flex-1"} placeholder="Value..." />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Results */}
        <div>
          {running && (
            <div className="flex items-center justify-center py-24">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-primary-accent" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-primary-accent" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-primary-accent" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {!running && results && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Results ({results.total} records)</h2>
              </div>

              {results.chartData && config.chartType !== "table" && (
                <div className="mb-4">
                  <ChartWrapper
                    type={config.chartType === "bar" || config.chartType === "line" || config.chartType === "pie" || config.chartType === "doughnut" ? config.chartType : "bar"}
                    labels={results.chartData.labels}
                    values={results.chartData.values}
                    label={config.aggregation === "sum" ? "Amount" : "Count"}
                    height={280}
                  />
                </div>
              )}

              {results.rows.length > 0 && (
                <div className="max-h-96 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background-secondary">
                      <tr>
                        {Object.keys(results.rows[0]).filter((k) => k !== "org" && k !== "orgId").slice(0, 8).map((key) => (
                          <th key={key} className="px-3 py-2 text-left text-2xs font-medium text-foreground-muted">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.rows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t border-border-subtle">
                          {Object.entries(row).filter(([k]) => k !== "org" && k !== "orgId").slice(0, 8).map(([key, val]) => (
                            <td key={key} className="px-3 py-2 text-xs text-foreground-muted">
                              {val && typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {results.rows.length === 0 && (
                <EmptyState title="No data matches your filters" icon={<BarChart3 className="h-8 w-8" />} />
              )}
            </div>
          )}

          {!running && !results && (
            <div className="flex min-h-[420px] items-center justify-center">
              <EmptyState
                title="Configure and run your report"
                description="Set your entity, filters, and chart type, then click Run Report"
                icon={<BarChart3 className="h-10 w-10" />}
              />
            </div>
          )}
        </div>
      </div>

      <FormModal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save Report" onSubmit={handleSaveNew} submitLabel="Save" submitting={saving}>
        <FormField label="Report Name" required>
          <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} className={inputClass} placeholder="Monthly Lead Analysis" />
        </FormField>
        <FormField label="Description">
          <input type="text" value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Folder">
          <select value={saveFolderId} onChange={(e) => setSaveFolderId(e.target.value)} className={inputClass}>
            <option value="">No folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </FormField>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} className="h-4 w-4 rounded border-input-border accent-primary-accent" />
          Share with organization
        </label>
      </FormModal>
    </div>
  );
}
