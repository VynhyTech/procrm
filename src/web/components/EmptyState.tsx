import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 text-foreground-subtle">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <p className="text-sm font-medium text-foreground-muted">{title}</p>
      {description && <p className="mt-1 text-xs text-foreground-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
