import React, { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "../trpc";
import { useAuth } from "../lib/auth";
import { Search, X } from "lucide-react";

export type ParentType = "Lead" | "Contact";

interface ParentPickerProps {
  parentType: ParentType;
  onParentTypeChange: (t: ParentType) => void;
  parentId: string;
  parentLabel: string;
  onSelect: (id: string, label: string) => void;
}

export function ParentPicker({ parentType, onParentTypeChange, parentId, parentLabel, onSelect }: ParentPickerProps) {
  const { scopes } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; label: string; sub?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      if (parentType === "Lead") {
        const canViewAll = scopes.includes("leads:viewAll");
        const res = canViewAll
          ? await trpc.leads.getAllLeads.query({ search: q, limit: 8 })
          : await trpc.leads.getMyLeads.query({ search: q, limit: 8 });
        setResults(res.leads.map((l) => ({ id: l.id, label: `${l.firstName} ${l.lastName}`, sub: l.email ?? l.phone ?? undefined })));
      } else {
        const res = await trpc.contacts.getAll.query({ search: q, limit: 8 });
        setResults(res.contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sub: c.email ?? c.phone ?? undefined })));
      }
    } catch (err) { console.error(err); } finally { setSearching(false); }
  }, [parentType, scopes]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, runSearch]);

  useEffect(() => { setQuery(""); setResults([]); }, [parentType]);

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        {(["Lead", "Contact"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { onParentTypeChange(t); onSelect("", ""); }}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
              parentType === t
                ? "border-primary-accent bg-primary-50 text-primary-text dark:bg-primary-950"
                : "border-input-border text-foreground-muted hover:bg-background-secondary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {parentId ? (
        <div className="flex items-center justify-between rounded-lg border border-input-border bg-background-secondary px-4 py-2">
          <span className="text-sm font-medium text-foreground">{parentLabel}</span>
          <button type="button" onClick={() => { onSelect("", ""); setOpen(true); }} className="text-foreground-subtle transition-colors hover:text-error-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={`Search ${parentType.toLowerCase()}s by name...`}
            className={inputClass + " pl-9"}
          />
          {open && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-card-border bg-card shadow-card">
              {searching ? (
                <p className="px-3 py-2 text-xs text-foreground-muted">Searching...</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-foreground-muted">No {parentType.toLowerCase()}s found</p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { onSelect(r.id, r.label); setOpen(false); }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-background-secondary"
                  >
                    <span className="text-sm text-foreground">{r.label}</span>
                    {r.sub && <span className="text-2xs text-foreground-subtle">{r.sub}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
