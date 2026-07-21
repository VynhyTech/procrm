import React from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtitle?: string;
}

export function MetricCard({ label, value, icon, subtitle }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-5 shadow-card transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-foreground-muted">{subtitle}</p>}
        </div>
        {icon && (
          <div className="rounded-lg bg-background-secondary p-2 text-foreground-muted">{icon}</div>
        )}
      </div>
    </div>
  );
}
