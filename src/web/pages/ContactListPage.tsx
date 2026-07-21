import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { EmptyState } from "../components/EmptyState";
import { BulkActionBar } from "../components/BulkActionBar";
import { ConfirmModal } from "../components/ConfirmModal";
import { Search, Contact, Trash2, Plus } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";

type ContactItem = Awaited<ReturnType<typeof trpc.contacts.getAll.query>>["contacts"][number];

export function ContactListPage() {
  const { scopes } = useAuth();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const canDelete = scopes.includes("contacts:delete");

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.contacts.getAll.query({ search: search || undefined, limit: pageSize, offset: page * pageSize });
      setContacts(result.contacts);
      setTotal(result.total);
      setSelected(new Set());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await trpc.contacts.bulkDelete.mutate({ ids: Array.from(selected) });
      setConfirmDeleteOpen(false);
      fetchContacts();
    } catch (err) { console.error(err); } finally { setBulkDeleting(false); }
  };

  const bulkActions: Array<{ label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }> = [];
  if (canDelete) bulkActions.push({ label: "Delete", icon: <Trash2 className="h-3 w-3" />, onClick: () => setConfirmDeleteOpen(true), destructive: true });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
          <p className="text-xs text-foreground-muted">{total} total</p>
        </div>
        {scopes.includes("contacts:edit") && (
          <a href="/contacts/new" className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
            <Plus className="h-4 w-4" /> New Contact
          </a>
        )}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <input type="text" placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus" />
      </div>

      <BulkActionBar selectedCount={selected.size} onClearSelection={() => setSelected(new Set())} actions={bulkActions} />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : contacts.length === 0 ? (
        <EmptyState title="No contacts found" icon={<Contact className="h-10 w-10" />} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                {canDelete && (
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-input-border accent-primary-accent" />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Lifecycle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Engagement</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className={`border-b border-border-subtle transition-colors hover:bg-background-secondary ${selected.has(contact.id) ? "bg-primary-50 dark:bg-primary-950" : ""}`}>
                  {canDelete && (
                    <td className="w-10 px-3 py-3">
                      <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)}
                        className="h-4 w-4 rounded border-input-border accent-primary-accent" />
                    </td>
                  )}
                  <td className="px-4 py-3"><a href={`/contacts/${contact.id}`} className="text-sm font-medium text-foreground hover:text-primary-text">{contact.firstName} {contact.lastName}</a></td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{contact.email ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{contact.phone ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={contact.lifecycleStage} /></td>
                  <td className="px-4 py-3"><StatusBadge status={contact.engagementStatus} /></td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{contact.contactType}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{contact.source ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{contact.owner?.name ?? contact.owner?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(contact.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Previous</button>
          <span className="text-xs text-foreground-muted">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)} className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Next</button>
        </div>
      )}

      <ConfirmModal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} onConfirm={handleBulkDelete}
        title="Delete Selected Contacts" message={`Are you sure you want to delete ${selected.size} contact${selected.size > 1 ? "s" : ""}?`}
        confirmLabel="Delete" destructive confirming={bulkDeleting} />
    </div>
  );
}
