import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { EmptyState } from "../components/EmptyState";
import { Shield, ChevronDown, ChevronUp, Download } from "lucide-react";

type AuditEntry = Awaited<ReturnType<typeof trpc.audit.getLogs.query>>["logs"][number];

const ENTITY_TYPES = ["", "Lead", "Contact", "Opportunity", "CrmTask", "User", "Role", "DeletionRequest", "DataExport", "Interest", "Campaign"];
const ACTIONS = ["", "create", "update", "delete", "login", "permission_change", "export", "deletion_request"];

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    trpc.orgSettings.getOrgMembers.query().then(setOrgMembers).catch(console.error);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.audit.getLogs.query({
        entityType: entityType || undefined,
        action: action || undefined,
        userId: userFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 50,
        offset,
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [entityType, action, userFilter, startDate, endDate, offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const selectClass = "rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";
  const dateClass = "rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus [color-scheme:light] dark:[color-scheme:dark]";

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Audit Log</h1>
          <p className="text-xs text-foreground-muted">{total} entries</p>
        </div>
        {logs.length > 0 && (
          <button onClick={() => {
            const csv = ["Timestamp,User,Entity,Action,Changes"]
              .concat(logs.map((l) => `"${new Date(l.createdAt).toISOString()}","${l.user?.name ?? l.user?.email ?? ""}","${l.entityType}","${l.action}","${(l.changes ?? "").replace(/"/g, '""')}"`))
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`; a.click();
            URL.revokeObjectURL(url);
          }} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-xs font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setOffset(0); }} className={selectClass}>
          <option value="">All Entities</option>
          {ENTITY_TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} className={selectClass}>
          <option value="">All Actions</option>
          {ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setOffset(0); }} className={selectClass}>
          <option value="">All Users</option>
          {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setOffset(0); }} className={dateClass} />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setOffset(0); }} className={dateClass} />
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
      ) : logs.length === 0 ? (
        <EmptyState title="No audit logs found" description="Adjust your filters or check back later" icon={<Shield className="h-10 w-10" />} />
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = log.changes ? JSON.parse(log.changes) : [];

            return (
              <div key={log.id} className="rounded-lg border border-card-border bg-card transition-all">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="flex w-full items-center justify-between p-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
                      log.action === "create" ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300" :
                      log.action === "update" ? "bg-info-50 text-info-700 dark:bg-info-950 dark:text-info-300" :
                      log.action === "delete" ? "bg-error-50 text-error-700 dark:bg-error-950 dark:text-error-300" :
                      "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                    }`}>
                      {log.action}
                    </span>
                    <div>
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{log.user?.name ?? log.user?.email ?? "System"}</span>
                        {" "}{log.action}d {log.entityType}
                        {log.entityId && <span className="text-foreground-muted"> ({log.entityId.slice(0, 8)}...)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-foreground-subtle">
                      {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    {changes.length > 0 && (isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-foreground-subtle" /> : <ChevronDown className="h-3.5 w-3.5 text-foreground-subtle" />)}
                  </div>
                </button>

                {isExpanded && changes.length > 0 && (
                  <div className="border-t border-border px-3 pb-3 pt-2">
                    <div className="rounded-lg bg-background-secondary p-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="pb-1 text-left font-medium text-foreground-subtle">Field</th>
                            <th className="pb-1 text-left font-medium text-foreground-subtle">Old Value</th>
                            <th className="pb-1 text-left font-medium text-foreground-subtle">New Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((c, i) => (
                            <tr key={i} className="border-t border-border-subtle">
                              <td className="py-1 font-medium text-foreground">{c.field}</td>
                              <td className="py-1 text-error-500">{c.oldValue ?? "—"}</td>
                              <td className="py-1 text-success-500">{c.newValue ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}
            className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">
            Previous
          </button>
          <span className="text-xs text-foreground-muted">{offset + 1}–{Math.min(offset + 50, total)} of {total}</span>
          <button disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}
            className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
