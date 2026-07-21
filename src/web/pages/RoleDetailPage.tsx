import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { ArrowLeft, Shield, Pencil, Trash2, Save } from "lucide-react";
import { OBJECT_CATEGORY_LABELS, scopeCategoryOf, isObjectCategory, categoryLabel } from "../constants/scopeCategories";

type Role = Awaited<ReturnType<typeof trpc.orgSettings.listRoles.query>>[number];
type Scope = Awaited<ReturnType<typeof trpc.orgSettings.listScopes.query>>[number];

interface RoleDetailPageProps { id: string; }

export function RoleDetailPage({ id }: RoleDetailPageProps) {
  const { basePath } = useApp();
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  const [role, setRole] = useState<Role | null>(null);
  const [allScopes, setAllScopes] = useState<Scope[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [savedScopeIds, setSavedScopeIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [savingDetails, setSavingDetails] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roles, scopes] = await Promise.all([
        trpc.orgSettings.listRoles.query(),
        trpc.orgSettings.listScopes.query(),
      ]);
      const found = roles.find((r) => r.id === id) ?? null;
      setRole(found);
      setAllScopes(scopes);
      const current = new Set((found?.scopes ?? []).map((s) => s.scopeId));
      setSelectedScopes(current);
      setSavedScopeIds(current);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId); else next.add(scopeId);
      return next;
    });
  };

  const isDirty = useMemo(() => {
    if (selectedScopes.size !== savedScopeIds.size) return true;
    for (const id of selectedScopes) if (!savedScopeIds.has(id)) return true;
    return false;
  }, [selectedScopes, savedScopeIds]);

  const handleSaveScopes = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await trpc.orgSettings.setRoleScopes.mutate({ roleId: role.id, scopeIds: [...selectedScopes] });
      setSavedScopeIds(new Set(selectedScopes));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const openEditDetails = () => {
    if (!role) return;
    setEditForm({ name: role.name, description: role.description ?? "" });
    setEditOpen(true);
  };

  const handleSaveDetails = async () => {
    if (!role || !editForm.name.trim()) return;
    setSavingDetails(true);
    try {
      await trpc.orgSettings.updateRole.mutate({ id: role.id, name: editForm.name.trim(), description: editForm.description || null });
      setEditOpen(false);
      fetchData();
    } catch (err) { console.error(err); } finally { setSavingDetails(false); }
  };

  const handleDelete = async () => {
    if (!role) return;
    setDeleting(true);
    try {
      await trpc.orgSettings.deleteRole.mutate({ id: role.id });
      navigate("/roles");
    } catch (err) { console.error(err); setDeleting(false); }
  };

  // Group all assignable scopes by category, splitting into object ("table") vs. system zones
  const objectGroups = new Map<string, Scope[]>();
  const systemGroups = new Map<string, Scope[]>();
  allScopes.forEach((s) => {
    const category = scopeCategoryOf(s.name);
    const target = isObjectCategory(category) ? objectGroups : systemGroups;
    if (!target.has(category)) target.set(category, []);
    target.get(category)?.push(s);
  });
  // Keep object cards in a stable, predictable order rather than however scopes happen to load
  const orderedObjectEntries = Object.keys(OBJECT_CATEGORY_LABELS)
    .filter((k) => objectGroups.has(k))
    .map((k) => [k, objectGroups.get(k) as Scope[]] as const);

  const permissionLabel = (scope: Scope) => scope.description || scope.name.split(":").slice(1).join(":");

  const renderCard = (category: string, scopes: Scope[]) => (
    <div key={category} className="rounded-xl border border-card-border bg-card p-4 shadow-card">
      <h3 className="mb-2.5 text-sm font-semibold text-foreground">{categoryLabel(category)}</h3>
      <div className="space-y-1.5">
        {scopes.map((scope) => (
          <label key={scope.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm transition-colors hover:bg-background-secondary">
            <input
              type="checkbox"
              checked={selectedScopes.has(scope.id)}
              onChange={() => toggleScope(scope.id)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-input-border accent-primary-accent"
            />
            <span className="text-foreground-muted">{permissionLabel(scope)}</span>
          </label>
        ))}
      </div>
    </div>
  );

  if (loading) return <div className="p-6"><div className="skeleton h-40 rounded-xl" /></div>;
  if (!role) return <div className="p-6"><EmptyState title="Role not found" description="It may have been deleted." icon={<Shield className="h-10 w-10" />} /></div>;

  return (
    <div className="p-6 pb-24">
      <button onClick={() => navigate("/roles")} className="mb-4 flex items-center gap-1 text-sm text-foreground-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Roles
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-text" />
            <h1 className="text-lg font-semibold text-foreground">{role.name}</h1>
            {role.isSystem && <span className="rounded-full bg-info-50 px-2 py-0.5 text-2xs font-medium text-info-700 dark:bg-info-950 dark:text-info-300">System</span>}
            {role.isDefault && <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-medium text-success-700 dark:bg-success-950 dark:text-success-300">Default</span>}
          </div>
          {role.description && <p className="mt-1 text-sm text-foreground-muted">{role.description}</p>}
          <p className="mt-1 text-xs text-foreground-subtle">{selectedScopes.size} permissions selected · {role._count.users} users assigned</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openEditDetails} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-semibold text-button-primary-text shadow-card transition-colors hover:bg-button-primary-hover">
            <Pencil className="h-3.5 w-3.5" /> Edit Details
          </button>
          {!role.isSystem && (
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-destructive-bg px-4 py-2 text-sm font-semibold text-button-destructive-text shadow-card transition-colors hover:bg-button-destructive-hover">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Object Permissions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderedObjectEntries.map(([category, scopes]) => renderCard(category, scopes))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">System Permissions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...systemGroups.entries()].map(([category, scopes]) => renderCard(category, scopes))}
        </div>
      </section>

      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-modal border-t border-border bg-modal-background p-4 shadow-modal">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <p className="text-sm text-foreground-muted">You have unsaved permission changes.</p>
            <div className="flex gap-3">
              <button onClick={() => setSelectedScopes(new Set(savedScopeIds))} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">
                Discard
              </button>
              <button onClick={handleSaveScopes} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {saved && !isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-modal border-t border-border bg-success-50 p-3 text-center text-sm font-medium text-success-700 dark:bg-success-950 dark:text-success-300">
          Permissions saved
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setEditOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Edit Role Details</h3>
            <div className="mb-3">
              <label className="mb-1.5 block text-sm font-medium text-foreground">Role Name</label>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus" autoFocus />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-foreground">Description</label>
              <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleSaveDetails} disabled={savingDetails || !editForm.name.trim()} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {savingDetails ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete}
        title="Delete Role" message={`Are you sure you want to delete "${role.name}"? All users with this role will lose its permissions.`}
        confirmLabel="Delete" destructive confirming={deleting} />
    </div>
  );
}
