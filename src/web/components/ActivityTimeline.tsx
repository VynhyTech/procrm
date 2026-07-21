import React, { useState } from "react";
import {
  MessageSquare,
  Phone,
  Mail,
  CalendarDays,
  ArrowRightLeft,
  TrendingUp,
  UserPlus,
  Repeat2,
  Smartphone,
} from "lucide-react";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  Note: <MessageSquare className="h-3.5 w-3.5" />,
  Call: <Phone className="h-3.5 w-3.5" />,
  SMS: <Smartphone className="h-3.5 w-3.5" />,
  Email: <Mail className="h-3.5 w-3.5" />,
  Meeting: <CalendarDays className="h-3.5 w-3.5" />,
  StatusChange: <ArrowRightLeft className="h-3.5 w-3.5" />,
  StageChange: <TrendingUp className="h-3.5 w-3.5" />,
  Assignment: <UserPlus className="h-3.5 w-3.5" />,
  Conversion: <Repeat2 className="h-3.5 w-3.5" />,
};

const FILTER_TYPES = ["All", "Call", "SMS", "Email", "Note", "Meeting", "StatusChange", "Assignment"];

interface Activity {
  id: string;
  activityType: string;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null; picture: string | null };
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

interface ActivityTimelineProps {
  activities: Activity[];
  loading?: boolean;
  onAddNote?: (note: string) => void;
  addingNote?: boolean;
}

export function ActivityTimeline({ activities, loading, onAddNote, addingNote }: ActivityTimelineProps) {
  const [filter, setFilter] = useState("All");
  const [noteText, setNoteText] = useState("");

  const filtered = filter === "All" ? activities : activities.filter((a) => a.activityType === filter);

  const handleAddNote = () => {
    if (!noteText.trim() || !onAddNote) return;
    onAddNote(noteText.trim());
    setNoteText("");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="flex-1">
              <div className="skeleton skeleton-text mb-1 w-1/3" />
              <div className="skeleton skeleton-text w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Quick add note */}
      {onAddNote && (
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            placeholder="Add a quick note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
            className="flex-1 rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus"
          />
          <button onClick={handleAddNote} disabled={!noteText.trim() || addingNote}
            className="rounded-lg bg-button-primary-bg px-3 py-1.5 text-xs font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
            {addingNote ? "..." : "Add"}
          </button>
        </div>
      )}

      {/* Filter chips */}
      {activities.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {FILTER_TYPES.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`rounded-full px-2 py-0.5 text-2xs font-medium transition-colors ${filter === t ? "bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300" : "bg-background-secondary text-foreground-muted hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-foreground-muted">{filter === "All" ? "No activity yet" : `No ${filter} activity`}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((activity) => (
            <div key={activity.id} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background-secondary text-foreground-muted">
                {ACTIVITY_ICONS[activity.activityType] ?? <MessageSquare className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {activity.user.name ?? activity.user.email ?? "System"}
                  </span>
                  <span className="text-2xs text-foreground-subtle" title={new Date(activity.createdAt).toLocaleString()}>
                    {relativeTime(activity.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  <span className="font-medium">{activity.activityType}</span>
                  {activity.notes && ` — ${activity.notes}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
