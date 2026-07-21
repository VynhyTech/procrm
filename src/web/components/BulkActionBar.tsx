import React from "react";
import { Trash2, X } from "lucide-react";

interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
}

export function BulkActionBar({ selectedCount, onClearSelection, actions }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2.5 dark:border-primary-800 dark:bg-primary-950">
      <span className="text-sm font-medium text-primary-text">{selectedCount} selected</span>
      <button
        onClick={onClearSelection}
        className="rounded-md p-1 text-primary-text transition-colors hover:bg-primary-100 dark:hover:bg-primary-900"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="mx-1 h-4 w-px bg-primary-200 dark:bg-primary-800" />
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          disabled={action.disabled}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            action.destructive
              ? "bg-button-destructive-bg text-button-destructive-text hover:bg-button-destructive-hover"
              : "bg-button-secondary-bg text-button-secondary-text hover:bg-button-secondary-hover"
          }`}
        >
          {action.icon ?? (action.destructive ? <Trash2 className="h-3 w-3" /> : null)}
          {action.label}
        </button>
      ))}
    </div>
  );
}
