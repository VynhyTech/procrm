import React from "react";
import { useApp } from "../lib/auth";
import { REPORT_TEMPLATES } from "../constants/reportTemplates";
import { ArrowLeft } from "lucide-react";

export function ReportTemplatesPage() {
  const { basePath } = useApp();

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const categories = Array.from(new Set(REPORT_TEMPLATES.map((t) => t.category)));

  return (
    <div className="p-6">
      <button onClick={() => navigate("/reports")} className="mb-4 inline-flex items-center gap-1 text-sm text-primary-text hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Reports
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Templates</h1>
        <p className="text-xs text-foreground-subtle">Start from a template and customize</p>
      </div>

      {categories.map((category) => (
        <div key={category} className="mb-6">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-foreground-subtle">{category}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_TEMPLATES.filter((t) => t.category === category).map((t) => (
              <button
                key={t.key}
                onClick={() => navigate(`/reports/new?template=${t.key}`)}
                className="rounded-xl border border-card-border bg-card p-4 text-left shadow-card transition-colors hover:border-primary-accent"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950">
                  <t.icon className="h-4 w-4 text-primary-text" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                <p className="mt-1 text-xs text-foreground-muted">{t.description}</p>
                <div className="mt-3 flex gap-1.5">
                  {t.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-background-secondary px-2 py-0.5 text-2xs text-foreground-muted">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
