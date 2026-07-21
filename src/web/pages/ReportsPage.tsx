import React, { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";
import { useAuth, useApp } from "../lib/auth";
import { FormModal, FormField } from "../components/FormModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { FolderTree, type FolderTreeFolder, type FolderTreeItem } from "../components/FolderTree";
import { Plus, FolderPlus, Search, Globe, Lock, BarChart3, LayoutGrid, Users, Trash2 } from "lucide-react";

type FolderDef = Awaited<ReturnType<typeof trpc.reports.listFolders.query>>[number];
type ReportDef = Awaited<ReturnType<typeof trpc.reports.list.query>>[number];
type OrgMember = Awaited<ReturnType<typeof trpc.orgSettings.getOrgMembers.query>>[number];
type Team = Awaited<ReturnType<typeof trpc.orgSettings.getTeams.query>>[number];
type ShareTarget = { targetType: "user" | "team"; targetId: string; name: string };

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

export function ReportsPage() {
  const { user } = useAuth();
  const { basePath } = useApp();

  const [folders, setFolders] = useState<FolderDef[]>([]);
  const [reports, setReports] = useState<ReportDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderDef | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParentId, setFolderParentId] = useState("");
  const [folderShared, setFolderShared] = useState(false);
  const [folderShares, setFolderShares] = useState<ShareTarget[]>([]);
  const [shareType, setShareType] = useState<"user" | "team">("user");
  const [shareTargetId, setShareTargetId] = useState("");
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
      const [f, r] = await Promise.all([trpc.reports.listFolders.query(), trpc.reports.list.query()]);
      setFolders(f);
      setReports(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    trpc.orgSettings.getOrgMembers.query().then(setOrgMembers).catch(console.error);
    trpc.orgSettings.getTeams.query().then(setTeams).catch(console.error);
  }, []);

  const toFolderTreeFolder = (f: FolderDef): FolderTreeFolder => ({
    ...f,
    _count: { items: f._count.reports, children: f._count.children },
  });
  const toFolderTreeItem = (r: ReportDef): FolderTreeItem => ({ id: r.id, name: r.name, meta: r.entityType, folderId: r.folderId });

  const sharedFolders: FolderTreeFolder[] = useMemo(() => folders.filter((f) => f.isShared || f.shares.length > 0).map(toFolderTreeFolder), [folders]);
  const sharedReports: FolderTreeItem[] = useMemo(() => reports.filter((r) => r.isShared).map(toFolderTreeItem), [reports]);
  const myFolders: FolderTreeFolder[] = useMemo(() => folders.filter((f) => f.creatorId === user?.id).map(toFolderTreeFolder), [folders, user]);
  const myReports: FolderTreeItem[] = useMemo(() => reports.filter((r) => r.creatorId === user?.id).map(toFolderTreeItem), [reports, user]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return reports.filter((r) => r.name.toLowerCase().includes(q));
  }, [search, reports]);

  const openCreateFolder = () => {
    setEditingFolder(null);
    setFolderName("");
    setFolderParentId("");
    setFolderShared(false);
    setFolderShares([]);
    setShareTargetId("");
    setFolderModalOpen(true);
  };

  const openEditFolder = (folder: FolderTreeFolder) => {
    const full = folders.find((f) => f.id === folder.id);
    if (!full) return;
    setEditingFolder(full);
    setFolderName(full.name);
    setFolderParentId(full.parentId ?? "");
    setFolderShared(full.isShared);
    setFolderShares(full.shares.map((s) => ({ targetType: s.targetType as "user" | "team", targetId: s.targetId, name: s.name })));
    setShareTargetId("");
    setFolderModalOpen(true);
  };

  const addShare = () => {
    if (!shareTargetId) return;
    if (folderShares.some((s) => s.targetType === shareType && s.targetId === shareTargetId)) return;
    const pool = shareType === "user" ? orgMembers : teams;
    const target = pool.find((p) => p.id === shareTargetId);
    if (!target) return;
    const name = shareType === "user" ? ((target as OrgMember).name ?? (target as OrgMember).email ?? "Unknown") : (target as Team).name;
    setFolderShares((prev) => [...prev, { targetType: shareType, targetId: shareTargetId, name }]);
    setShareTargetId("");
  };

  const removeShare = (targetType: "user" | "team", targetId: string) => {
    setFolderShares((prev) => prev.filter((s) => !(s.targetType === targetType && s.targetId === targetId)));
  };

  const handleSaveFolder = async () => {
    if (!folderName.trim()) return;
    setSavingFolder(true);
    try {
      let folderId: string;
      if (editingFolder) {
        await trpc.reports.updateFolder.mutate({
          id: editingFolder.id,
          name: folderName,
          isShared: folderShared,
          parentId: folderParentId || null,
        });
        folderId = editingFolder.id;

        const original = editingFolder.shares.map((s) => ({ targetType: s.targetType as "user" | "team", targetId: s.targetId }));
        const toAdd = folderShares.filter((s) => !original.some((o) => o.targetType === s.targetType && o.targetId === s.targetId));
        const toRemove = original.filter((o) => !folderShares.some((s) => s.targetType === o.targetType && s.targetId === o.targetId));
        await Promise.all([
          ...toAdd.map((s) => trpc.reports.shareFolder.mutate({ folderId, targetType: s.targetType, targetId: s.targetId })),
          ...toRemove.map((s) => trpc.reports.unshareFolder.mutate({ folderId, targetType: s.targetType, targetId: s.targetId })),
        ]);
      } else {
        const created = await trpc.reports.createFolder.mutate({
          name: folderName,
          isShared: folderShared,
          parentId: folderParentId || null,
        });
        folderId = created.id;
        await Promise.all(folderShares.map((s) => trpc.reports.shareFolder.mutate({ folderId, targetType: s.targetType, targetId: s.targetId })));
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
      await trpc.reports.deleteFolder.mutate({ id: deleteFolder.id });
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
          <h1 className="text-lg font-semibold text-foreground">Reports</h1>
          <p className="text-xs text-foreground-subtle">{reports.length} reports · {folders.length} folders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/reports/templates")} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-sm font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover">
            <LayoutGrid className="h-3.5 w-3.5" /> Templates
          </button>
          <button onClick={openCreateFolder} className="flex items-center gap-1.5 rounded-lg border border-button-outline-border px-3 py-1.5 text-sm font-medium text-button-outline-text transition-colors hover:bg-button-outline-hover">
            <FolderPlus className="h-3.5 w-3.5" /> New Folder
          </button>
          <button onClick={() => navigate("/reports/new")} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-1.5 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
            <Plus className="h-3.5 w-3.5" /> Create Report
          </button>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports..."
          className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-3 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus"
        />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : search.trim() ? (
        <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Search Results</h2>
          {searchResults.length === 0 ? (
            <EmptyState title="No reports match your search" />
          ) : (
            <div className="space-y-0.5">
              {searchResults.map((r) => (
                <button key={r.id} onClick={() => navigate(`/reports/${r.id}`)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-background-secondary">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.name}</span>
                  <span className="shrink-0 text-2xs text-foreground-subtle">{r.entityType}</span>
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
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Shared Reports</h2>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-2 shadow-card">
              {sharedFolders.length === 0 && sharedReports.length === 0 ? (
                <p className="px-2 py-3 text-xs text-foreground-muted">No shared reports yet</p>
              ) : (
                <FolderTree
                  folders={sharedFolders}
                  items={sharedReports}
                  parentId={null}
                  onOpenItem={(id) => navigate(`/reports/${id}`)}
                  onEditFolder={openEditFolder}
                  onDeleteFolder={(f) => setDeleteFolder(folders.find((x) => x.id === f.id) ?? null)}
                />
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-foreground-subtle" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">My Reports</h2>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-2 shadow-card">
              {myFolders.length === 0 && myReports.length === 0 ? (
                <p className="px-2 py-3 text-xs text-foreground-muted">No private reports yet</p>
              ) : (
                <FolderTree
                  folders={myFolders}
                  items={myReports}
                  parentId={null}
                  onOpenItem={(id) => navigate(`/reports/${id}`)}
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
          <input type="text" value={folderName} onChange={(e) => setFolderName(e.target.value)} className={inputClass} placeholder="Q1 Reports" />
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

        <FormField label="Share with specific people or teams">
          <div className="flex items-center gap-1.5">
            <select value={shareType} onChange={(e) => { setShareType(e.target.value as "user" | "team"); setShareTargetId(""); }} className={inputClass + " w-28 shrink-0"}>
              <option value="user">Person</option>
              <option value="team">Team</option>
            </select>
            <select value={shareTargetId} onChange={(e) => setShareTargetId(e.target.value)} className={inputClass}>
              <option value="">Select {shareType === "user" ? "a person" : "a team"}...</option>
              {(shareType === "user" ? orgMembers : teams).map((p) => (
                <option key={p.id} value={p.id}>{shareType === "user" ? ((p as OrgMember).name ?? (p as OrgMember).email) : (p as Team).name}</option>
              ))}
            </select>
            <button type="button" onClick={addShare} className="shrink-0 rounded-lg bg-button-ghost-bg px-2.5 py-1.5 text-xs font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">
              Add
            </button>
          </div>
          {folderShares.length > 0 && (
            <div className="mt-2 space-y-1">
              {folderShares.map((s) => (
                <div key={`${s.targetType}-${s.targetId}`} className="flex items-center justify-between rounded-lg bg-background-secondary px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-xs text-foreground">
                    <Users className="h-3 w-3 text-foreground-subtle" /> {s.name}
                    <span className="text-2xs text-foreground-subtle">{s.targetType === "team" ? "(team)" : ""}</span>
                  </span>
                  <button type="button" onClick={() => removeShare(s.targetType, s.targetId)} className="text-foreground-subtle transition-colors hover:text-error-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormField>
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
