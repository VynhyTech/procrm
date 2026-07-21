import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { Phone, Mail, MessageSquare, MessageCircle, Smartphone, ArrowRightLeft, UserPlus, Repeat2, CalendarDays, CheckSquare } from "lucide-react";

type TimelineEntry = Awaited<ReturnType<typeof trpc.crmActivities.getUnifiedTimeline.query>>[number];

const ICONS: Record<string, React.ReactNode> = {
  Call: <Phone className="h-3.5 w-3.5" />,
  Email: <Mail className="h-3.5 w-3.5" />,
  SMS: <Smartphone className="h-3.5 w-3.5" />,
  WhatsApp: <MessageCircle className="h-3.5 w-3.5" />,
  Chat: <MessageSquare className="h-3.5 w-3.5" />,
  Note: <MessageSquare className="h-3.5 w-3.5" />,
  Meeting: <CalendarDays className="h-3.5 w-3.5" />,
  StatusChange: <ArrowRightLeft className="h-3.5 w-3.5" />,
  Assignment: <UserPlus className="h-3.5 w-3.5" />,
  Conversion: <Repeat2 className="h-3.5 w-3.5" />,
  Task: <CheckSquare className="h-3.5 w-3.5" />,
};

const TYPE_COLORS: Record<string, string> = {
  SMS: "bg-success-50 dark:bg-success-950 text-success-500",
  WhatsApp: "bg-success-50 dark:bg-success-950 text-success-500",
  Email: "bg-info-50 dark:bg-info-950 text-info-500",
  Call: "bg-warning-50 dark:bg-warning-950 text-warning-500",
  Chat: "bg-accent-50 dark:bg-accent-950 text-accent-500",
  Task: "bg-accent-50 dark:bg-accent-950 text-accent-500",
};

function relativeTime(dateStr: string | Date): string {
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

interface UnifiedTimelineProps {
  objectType: string;
  objectId: string;
}

export function UnifiedTimeline({ objectType, objectId }: UnifiedTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    try { setEntries(await trpc.crmActivities.getUnifiedTimeline.query({ objectType, objectId })); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, [objectType, objectId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  if (loading) return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="flex gap-3"><div className="skeleton h-8 w-8 rounded-full" /><div className="flex-1"><div className="skeleton skeleton-text w-2/3" /></div></div>)}</div>;

  if (entries.length === 0) return <p className="text-sm text-foreground-muted text-center py-4">No activity yet</p>;

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const icon = ICONS[entry.subType] ?? <MessageSquare className="h-3.5 w-3.5" />;
        const colorClass = TYPE_COLORS[entry.subType] ?? "bg-background-secondary text-foreground-muted";
        const isMessage = entry.type === "message";

        return (
          <div key={entry.id} className="flex gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{entry.user?.name ?? entry.user?.email ?? "System"}</span>
                <span className="text-2xs text-foreground-subtle" title={new Date(entry.createdAt).toLocaleString()}>{relativeTime(entry.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-xs text-foreground-muted">
                {isMessage && <span className="font-medium text-foreground">{entry.subType} · </span>}
                {!isMessage && <span className="font-medium">{entry.subType} · </span>}
                {entry.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
