import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { ConfirmModal } from "../components/ConfirmModal";
import { Plus, Trash2, Shield, ChevronRight, Users, UserPlus, Copy, Check, RefreshCw } from "lucide-react";

type Role = Awaited<ReturnType<typeof trpc.orgSettings.listRoles.query>>[number];
type UserWithRoles = Awaited<ReturnType<typeof trpc.orgSettings.listUserRoles.query>>[number];

export function RoleManagementPage() {
  const { basePath } = useApp();
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);

  // Role create
  const [createOpen, setCreateOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // User role assignment
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [assignRoleId, setAssignRoleId] = useState("");

  // Invite user
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [claimLink, setClaimLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, usersData] = await Promise.all([
        trpc.orgSettings.listRoles.query(),
        trpc.orgSettings.listUserRoles.query().catch(() => []),
      ]);
      setRoles(rolesData);
      setUsers(usersData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setRoleForm({ name: "", description: "" });
    setCreateOpen(true);
  };

  const handleCreateRole = async () => {
    if (!roleForm.name.trim()) return;
    setSaving(true);
    try {
      const role = await trpc.orgSettings.createRole.mutate({ name: roleForm.name.trim(), description: roleForm.description || undefined, scopeIds: [] });
      setCreateOpen(false);
      navigate(`/roles/${role.id}`);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDeleteRole = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await trpc.orgSettings.deleteRole.mutate({ id: deleteId }); setDeleteId(null); fetchData(); }
    catch (err) { console.error(err); } finally { setDeleting(false); }
  };

  const handleAssignRole = async () => {
    if (!assignUserId || !assignRoleId) return;
    try { await trpc.orgSettings.assignRoleToUser.mutate({ userId: assignUserId, roleId: assignRoleId }); setAssignUserId(null); setAssignRoleId(""); fetchData(); }
    catch (err) { console.error(err); }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    try { await trpc.orgSettings.removeRoleFromUser.mutate({ userId, roleId }); fetchData(); }
    catch (err) { console.error(err); }
  };

  const openInvite = () => {
    setInviteEmail("");
    setInviteRoleId(roles.find((r) => r.isDefault)?.id ?? "");
    setInviteError(null);
    setClaimLink(null);
    setInviteOpen(true);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const result = await trpc.orgSettings.inviteMember.mutate({ email: inviteEmail.trim(), roleId: inviteRoleId || undefined });
      if (result.status === "invited") {
        setClaimLink({ email: inviteEmail.trim(), url: `${basePath}${result.claimUrl}` });
      } else {
        setInviteOpen(false);
      }
      fetchData();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite user");
    } finally { setInviting(false); }
  };

  const handleResendInvite = async (userId: string) => {
    setResendingId(userId);
    try {
      const result = await trpc.orgSettings.resendInvite.mutate({ userId });
      const user = users.find((u) => u.id === userId);
      setClaimLink({ email: user?.email ?? "", url: `${basePath}${result.claimUrl}` });
      setInviteOpen(true);
    } catch (err) { console.error(err); } finally { setResendingId(null); }
  };

  const handleCopyLink = async () => {
    if (!claimLink) return;
    await navigator.clipboard.writeText(claimLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  if (loading) return <div className="p-6"><div className="skeleton h-40 rounded-xl" /></div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Roles & Permissions</h1>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-input-border p-0.5">
            <button onClick={() => setActiveTab("roles")} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "roles" ? "bg-background-secondary text-foreground" : "text-foreground-muted"}`}>Roles</button>
            <button onClick={() => setActiveTab("users")} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "users" ? "bg-background-secondary text-foreground" : "text-foreground-muted"}`}>Users</button>
          </div>
          {activeTab === "roles" && (
            <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              <Plus className="h-4 w-4" /> New Role
            </button>
          )}
          {activeTab === "users" && (
            <button onClick={openInvite} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
              <UserPlus className="h-4 w-4" /> Invite User
            </button>
          )}
        </div>
      </div>

      {/* ROLES TAB */}
      {activeTab === "roles" && (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} onClick={() => navigate(`/roles/${role.id}`)}
              className="flex cursor-pointer items-start justify-between rounded-xl border border-card-border bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary-text" />
                  <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
                  {role.isSystem && <span className="rounded-full bg-info-50 px-2 py-0.5 text-2xs font-medium text-info-700 dark:bg-info-950 dark:text-info-300">System</span>}
                  {role.isDefault && <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-medium text-success-700 dark:bg-success-950 dark:text-success-300">Default</span>}
                </div>
                {role.description && <p className="mt-0.5 text-xs text-foreground-muted">{role.description}</p>}
                <p className="mt-1 text-2xs text-foreground-subtle">{role.scopes.length} permissions · {role._count.users} users</p>
              </div>
              <div className="flex items-center gap-1">
                {!role.isSystem && (
                  <button onClick={(e) => { e.stopPropagation(); setDeleteId(role.id); }} className="rounded-md p-1.5 text-foreground-muted hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-950">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <ChevronRight className="h-4 w-4 text-foreground-subtle" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === "users" && (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Roles</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.picture && <img src={u.picture} className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" alt="" />}
                      <span className="text-sm font-medium text-foreground">{u.name ?? "—"}</span>
                      {u.status === "pending" && (
                        <span className="rounded-full bg-warning-50 px-2 py-0.5 text-2xs font-medium text-warning-700 dark:bg-warning-950 dark:text-warning-300">Pending</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{u.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span key={r.id} className="flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-2xs font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                          {r.name}
                          <button onClick={() => handleRemoveRole(u.id, r.id)} className="text-primary-400 hover:text-error-500" title="Remove role">×</button>
                        </span>
                      ))}
                      {u.roles.length === 0 && <span className="text-2xs text-foreground-subtle">No roles</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {u.status === "pending" && (
                        <button onClick={() => handleResendInvite(u.id)} disabled={resendingId === u.id} className="text-xs text-primary-text hover:underline disabled:opacity-50">
                          <RefreshCw className="mr-0.5 inline h-3 w-3" /> {resendingId === u.id ? "..." : "Copy Invite Link"}
                        </button>
                      )}
                      <button onClick={() => { setAssignUserId(u.id); setAssignRoleId(""); }} className="text-xs text-primary-text hover:underline">
                        <Users className="mr-0.5 inline h-3 w-3" /> Assign Role
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create role modal — just name/description; permissions are configured on the role's own page */}
      {createOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Create Role</h3>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-foreground">Role Name</label>
              <input type="text" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className={inputClass} placeholder="Sales Manager" autoFocus />
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
              <input type="text" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} className={inputClass} placeholder="Team lead with access to reports" />
            </div>
            <p className="mb-4 text-2xs text-foreground-subtle">You'll pick permissions on the next screen.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleCreateRole} disabled={saving || !roleForm.name.trim()}
                className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {saving ? "Creating..." : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign role modal */}
      {assignUserId && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setAssignUserId(null)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-foreground">Assign Role</h3>
            <p className="mb-3 text-xs text-foreground-muted">User: {users.find((u) => u.id === assignUserId)?.name ?? users.find((u) => u.id === assignUserId)?.email}</p>
            <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)} className={`mb-4 ${inputClass}`}>
              <option value="">Select role...</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setAssignUserId(null)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleAssignRole} disabled={!assignRoleId} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">Assign</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDeleteRole}
        title="Delete Role" message={`Are you sure you want to delete "${roles.find((r) => r.id === deleteId)?.name}"? All users with this role will lose its permissions.`}
        confirmLabel="Delete" destructive confirming={deleting} />

      {/* Invite user modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => setInviteOpen(false)}>
          <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            {claimLink ? (
              <>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Invite Link Ready</h3>
                <p className="mb-3 text-xs text-foreground-muted">
                  There's no email delivery set up yet — share this link with <span className="font-medium text-foreground">{claimLink.email}</span> so they can set a password and join.
                </p>
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-input-border bg-background-secondary p-2">
                  <input readOnly value={claimLink.url} className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none" onFocus={(e) => e.target.select()} />
                  <button onClick={handleCopyLink} className="shrink-0 rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground">
                    {copied ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setInviteOpen(false)} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Done</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-4 text-lg font-semibold text-foreground">Invite User</h3>
                {inviteError && <div className="mb-3 rounded-lg border border-error-200 bg-error-50 p-2.5 text-xs text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300">{inviteError}</div>}
                <div className="mb-3">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} placeholder="colleague@company.com" autoFocus />
                </div>
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
                  <select value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)} className={inputClass}>
                    <option value="">No role yet</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <p className="mt-1 text-2xs text-foreground-subtle">Determines what they can see and do — you can change this later from the Users tab.</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setInviteOpen(false)} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
                  <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                    {inviting ? "Inviting..." : "Send Invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
