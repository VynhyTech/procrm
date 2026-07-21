import React, { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";
import { useAuth, useApp } from "../lib/auth";
import { FormModal, FormField } from "../components/FormModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { FolderTree, type FolderTreeFolder, type FolderTreeItem } from "../components/FolderTree";
import { Plus, FolderPlus, Search, Globe, Lock, LayoutDashboard } from "lucide-react";

type FolderDef = Awaited<ReturnType<typeof trpc.dashboards.listFolders.query>>[number];
type DashboardDef = Awaited<ReturnType<typeof trpc.dashboards.list.query>>[number];

function getDescendantIds(folderId: string, folders: FolderDef[]): Set<string> {
  const ids = new Set<string>();
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const f of folders) {
      if (f.parentId === current && !ids.has(f.id)) {
        ids.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return ids;
}

export function DashboardsPage() {
  const { user } = useAuth();
  const { basePath } = useApp();

  const [folders, setFolders] = useState<FolderDef[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderDef | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParentId, setFolderParentId] = useState("");
  const [folderShared, setFolderShared] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);

  const [deleteFolder, setDeleteFolder] = useState<FolderDef | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [f, d] = await Promise.all([trpc.dashboards.listFolders.query(), trpc.dashboards.list.query()]);
      setFolders(f);
      setDashboards(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toFolderTreeFolder = (f: FolderDef): FolderTreeFolder => ({
    ...f,
    _count: { items: f._count.dashboards, children: f._count.children },
  });
  const toFolderTreeItem = (d: DashboardDef): FolderTreeItem => ({ id: d.id, name: d.name, meta: `${d._count.widgets} widgets`, folderId: d.folderId });

  const sharedFolders: FolderTreeFolder[] = useMemo(() => folders.filter((f) => f.isShared).map(toFolderTreeFolder), [folders]);
  const sharedDashboards: FolderTreeItem[] = useMemo(() => dashboards.filter((d) => d.isShared).map(toFolderTreeItem), [dashboards]);
  const myFolders: FolderTreeFolder[] = useMemo(() => folders.filter((f) => f.creatorId === user?.id).map(toFolderTreeFolder), [folders, user]);
  const myDashboards: FolderTreeItem[] = useMemo(() => dashboards.filter((d) => d.creatorId === user?.id).map(toFolderTreeItem), [dashboards, user]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return dashboards.filter((d) => d.name.toLowerCase().includes(q));
  }, [search, dashboards]);

  const openCreateFolder = () => {
    setEditingFolder(null);
    setFolderName("");
    setFolderParentId("");
    setFolderShared(false);
    setFolderModalOpen(true);
  };

  const openEditFolder = (folder: FolderTreeFolder) => {
    const full = folders.find((f) => f.id === folder.id);
    if (!full) return;
    setEditingFolder(full);
    setFolderName(full.name);
    setFolderParentId(full.parentId ?? "");
    setFolderShared(full.isShared);
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async () => {
    if (!folderName.trim()) return;
    setSavingFolder(true);
    try {
      if (editingFolder) {
        await trpc.dashboards.updateFolder.mutate({
          id: editingFolder.id,
          name: folderName,
          isShared: folderShared,
          parentId: folderParentId || null,
        });
      } else {
        await trpc.dashboards.createFolder.mutate({
          name: folderName,
          isShared: folderShared,
          parentId: folderParentId || null,
        });
      }
      setFolderModalOpen(false);
      fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolder) return;
    setDeletingFolder(true);
    setDeleteError(null);
    try {
      await trpc.dashboards.deleteFolder.mutate({ id: deleteFolder.id });
      setDeleteFolder(null);
      fetchAll();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete folder");
    } finally {
      setDeletingFolder(false);
    }
  };

  const excludedParentIds = editingFolder ? getDescendantIds(editingFolder.id, folders) : new Set<string>();
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboards</h1>
          <p className="text-xs text-foreground-subtle">{dashboards.length} dashboards · {folders.length} folders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openCreateFolder} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-sm font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover">
            <FolderPlus className="h-3.5 w-3.5" /> New Folder
          </button>
          <button onClick={() => navigate("/dashboards/new")} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
            <Plus className="h-3.5 w-3.5" /> Create Dashboard
          </button>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dashboards..."
          className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-3 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus"
        />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : search.trim() ? (
        <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Search Results</h2>
          {searchResults.length === 0 ? (
            <EmptyState title="No dashboards match your search" />
          ) : (
            <div className="space-y-0.5">
              {searchResults.map((d) => (
                <button key={d.id} onClick={() => navigate(`/dashboards/${d.id}`)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-background-secondary">
                  <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{d.name}</span>
                  <span className="shrink-0 text-2xs text-foreground-subtle">{d._count.widgets} widgets</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-foreground-subtle" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Shared Dashboards</h2>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-2 shadow-card">
              {sharedFolders.length === 0 && sharedDashboards.length === 0 ? (
                <p className="px-2 py-3 text-xs text-foreground-muted">No shared dashboards yet</p>
              ) : (
                <FolderTree
                  folders={sharedFolders}
                  items={sharedDashboards}
                  parentId={null}
                  onOpenItem={(id) => navigate(`/dashboards/${id}`)}
                  onEditFolder={openEditFolder}
                  onDeleteFolder={(f) => setDeleteFolder(folders.find((x) => x.id === f.id) ?? null)}
                />
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-foreground-subtle" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">My Dashboards</h2>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-2 shadow-card">
              {myFolders.length === 0 && myDashboards.length === 0 ? (
                <p className="px-2 py-3 text-xs text-foreground-muted">No private dashboards yet</p>
              ) : (
                <FolderTree
                  folders={myFolders}
                  items={myDashboards}
                  parentId={null}
                  onOpenItem={(id) => navigate(`/dashboards/${id}`)}
                  onEditFolder={openEditFolder}
                  onDeleteFolder={(f) => setDeleteFolder(folders.find((x) => x.id === f.id) ?? null)}
                />
              )}
            </div>
          </section>
        </div>
      )}

      <FormModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title={editingFolder ? "Edit Folder" : "New Folder"}
        onSubmit={handleSaveFolder}
        submitLabel="Save"
        submitting={savingFolder}
      >
        <FormField label="Name" required>
          <input type="text" value={folderName} onChange={(e) => setFolderName(e.target.value)} className={inputClass} placeholder="Sales Dashboards" />
        </FormField>
        <FormField label="Parent Folder">
          <select value={folderParentId} onChange={(e) => setFolderParentId(e.target.value)} className={inputClass}>
            <option value="">No parent (top level)</option>
            {folders.filter((f) => f.id !== editingFolder?.id && !excludedParentIds.has(f.id)).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </FormField>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={folderShared} onChange={(e) => setFolderShared(e.target.checked)} className="h-4 w-4 rounded border-input-border accent-primary-accent" />
          Share with organization
        </label>
      </FormModal>

      <ConfirmModal
        open={!!deleteFolder}
        onClose={() => { setDeleteFolder(null); setDeleteError(null); }}
        onConfirm={handleDeleteFolder}
        title="Delete Folder"
        message={deleteError ?? `Delete "${deleteFolder?.name}"? This can't be undone.`}
        confirmLabel="Delete"
        destructive
        confirming={deletingFolder}
      />
    </div>
  );
}
