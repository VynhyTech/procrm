import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { FormModal, FormField } from "../components/FormModal";
import { CheckSquare, Plus } from "lucide-react";

type Task = Awaited<ReturnType<typeof trpc.tasks.getMyTasks.query>>["tasks"][number];

export function TaskListPage() {
  const { scopes } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Create task
  const [createOpen, setCreateOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ subject: "", description: "", relatedObjectType: "Lead", relatedObjectId: "", dueDate: "", priority: "Medium" });
  const [creating, setCreating] = useState(false);

  const canViewAll = scopes.includes("tasks:viewAll");
  const canEdit = scopes.includes("tasks:edit");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter || undefined, priority: priorityFilter || undefined, limit: pageSize, offset: page * pageSize };
      const result = canViewAll
        ? await trpc.tasks.getAllTasks.query(params)
        : await trpc.tasks.getMyTasks.query(params);
      setTasks(result.tasks);
      setTotal(result.total);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [statusFilter, priorityFilter, canViewAll, page]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleStatusToggle = async (task: Task) => {
    const newStatus = task.status === "Open" ? "InProgress" : task.status === "InProgress" ? "Completed" : "Open";
    try {
      await trpc.tasks.update.mutate({ id: task.id, status: newStatus });
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (err) { console.error(err); }
  };

  const handleCreateTask = async () => {
    if (!taskForm.subject || !taskForm.relatedObjectId) return;
    setCreating(true);
    try {
      await trpc.tasks.create.mutate({
        subject: taskForm.subject,
        description: taskForm.description || undefined,
        relatedObjectType: taskForm.relatedObjectType,
        relatedObjectId: taskForm.relatedObjectId,
        dueDate: taskForm.dueDate || undefined,
        priority: taskForm.priority,
      });
      setCreateOpen(false);
      setTaskForm({ subject: "", description: "", relatedObjectType: "Lead", relatedObjectId: "", dueDate: "", priority: "Medium" });
      fetchTasks();
    } catch (err) { console.error(err); } finally { setCreating(false); }
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate || task.status === "Completed" || task.status === "Cancelled") return false;
    return task.dueDate < new Date().toISOString().split("T")[0];
  };

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";
  const selectClass = "w-full rounded-lg border border-input-border bg-input-bg pl-4 pr-10 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Tasks</h1>
          <p className="text-xs text-foreground-muted">{total} total</p>
        </div>
        {canEdit && (
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-3.5 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">
            <Plus className="h-4 w-4" /> New Task
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
          <option value="">All Statuses</option>
          {["Open", "InProgress", "Completed", "Cancelled"].map((s) => <option key={s} value={s}>{s === "InProgress" ? "In Progress" : s}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-input-border bg-input-bg py-2 pl-4 pr-10 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus">
          <option value="">All Priorities</option>
          {["Low", "Medium", "High"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks found" icon={<CheckSquare className="h-10 w-10" />}
          action={canEdit ? <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover">Create Task</button> : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background-secondary">
                <th className="w-10 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Related To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className={`border-b border-border-subtle transition-colors hover:bg-background-secondary ${isOverdue(task) ? "bg-error-50 dark:bg-error-950" : ""}`}>
                  <td className="w-10 px-3 py-3">
                    <button onClick={() => handleStatusToggle(task)}
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${task.status === "Completed" ? "border-success-500 bg-success-500 text-white" : "border-input-border hover:border-primary-accent"}`}>
                      {task.status === "Completed" && <CheckSquare className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-sm font-medium ${task.status === "Completed" ? "text-foreground-muted line-through" : "text-foreground"}`}>{task.subject}</p>
                    {task.description && <p className="mt-0.5 text-2xs text-foreground-subtle truncate max-w-xs">{task.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{task.relatedObjectType}</td>
                  <td className="px-4 py-3"><StatusBadge status={task.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">
                    {task.dueDate ? (
                      <span className={isOverdue(task) ? "font-medium text-error-500" : ""}>{task.dueDate}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{task.owner?.name ?? task.owner?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted">{task.createdByName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(task.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}
            className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Previous</button>
          <span className="text-xs text-foreground-muted">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}
            className="rounded-lg bg-button-ghost-bg px-3 py-1.5 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Create Task Modal */}
      <FormModal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Task" onSubmit={handleCreateTask} submitLabel="Create" submitting={creating}>
        <FormField label="Subject" required>
          <input type="text" value={taskForm.subject} onChange={(e) => setTaskForm({ ...taskForm, subject: e.target.value })} className={inputClass} placeholder="Follow up with client" />
        </FormField>
        <FormField label="Description">
          <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Related To">
            <select value={taskForm.relatedObjectType} onChange={(e) => setTaskForm({ ...taskForm, relatedObjectType: e.target.value })} className={selectClass}>
              {["Lead", "Account", "Contact", "Opportunity"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Record ID" required>
            <input type="text" value={taskForm.relatedObjectId} onChange={(e) => setTaskForm({ ...taskForm, relatedObjectId: e.target.value })} className={inputClass} placeholder="Paste record ID" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Due Date">
            <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} />
          </FormField>
          <FormField label="Priority">
            <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className={selectClass}>
              {["Low", "Medium", "High"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormField>
        </div>
      </FormModal>
    </div>
  );
}
