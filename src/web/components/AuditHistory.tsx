import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";

type AuditEntry = Awaited<ReturnType<typeof trpc.audit.getEntityHistory.query>>[number];

interface AuditHistoryProps {
  entityType: string;
  entityId: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AuditHistory({ entityType, entityId }: AuditHistoryProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await trpc.audit.getEntityHistory.query({ entityType, entityId });
      setEntries(data);
    } catch { /* ignore — user may not have audit:view scope */ }
    finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (loading) return <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-10 rounded" />)}</div>;

  if (entries.length === 0) return <p className="text-sm text-foreground-muted text-center py-4">No changes recorded</p>;

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const changes = entry.changes ? JSON.parse(entry.changes) : [];
        return (
          <div key={entry.id} className="border-b border-border-subtle pb-2 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{entry.user?.name ?? entry.user?.email ?? "System"}</span>
              <span className="text-2xs text-foreground-subtle" title={new Date(entry.createdAt).toLocaleString()}>{relativeTime(entry.createdAt)}</span>
            </div>
            <p className="text-xs text-foreground-muted mt-0.5">
              <span className="font-medium">{entry.action}</span>
            </p>
            {Array.isArray(changes) && changes.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {changes.map((c: { field: string; oldValue: string | null; newValue: string | null }, i: number) => (
                  <div key={i} className="text-2xs text-foreground-subtle">
                    <span className="font-medium">{c.field}</span>: <span className="line-through text-error-500">{c.oldValue ?? "empty"}</span> → <span className="text-success-600">{c.newValue ?? "empty"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
