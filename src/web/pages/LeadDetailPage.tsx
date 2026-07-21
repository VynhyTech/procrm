import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { FormModal, FormField } from "../components/FormModal";
import { LeadFormFields, EMPTY_LEAD_FORM, type LeadFieldsForm } from "../components/LeadFormFields";
import { Sparkles, Lightbulb, Phone, Mail, MessageCircle, Smartphone, UserPlus, Inbox, Check, Copy, Pencil, Trash2 } from "lucide-react";
import { InterestPanel } from "../components/InterestPanel";
import { AuditHistory } from "../components/AuditHistory";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { UnifiedTimeline } from "../components/UnifiedTimeline";
import { ConfirmModal } from "../components/ConfirmModal";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { CustomFieldsSection } from "../components/CustomFieldsSection";

type LeadData = Awaited<ReturnType<typeof trpc.leads.getById.query>>;
type LeadIntelligenceResult = Awaited<ReturnType<typeof trpc.aiFeatures.askLeadIntelligence.mutate>>;
const STATUS_STEPS = ["New", "Working", "Qualified", "Converted", "Disqualified"];

interface LeadDetailPageProps { id: string; }

export function LeadDetailPage({ id }: LeadDetailPageProps) {
  const { scopes } = useAuth();
  const { basePath } = useApp();
  const [lead, setLead] = useState<LeadData | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [interestsData, setInterestsData] = useState<Awaited<ReturnType<typeof trpc.interests.list.query>>>([]);
  const [campaignsData, setCampaignsData] = useState<Array<{ id: string; name: string }>>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<Array<{ action: string; reason: string; priority: string }>>([]);
  const [aiQuestion, setAiQuestion] = useState("Summarize this lead and show portfolio stats.");
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchResult, setAiSearchResult] = useState<LeadIntelligenceResult | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "interests" | "attachments">("details");
  const [sidebarTab, setSidebarTab] = useState<"timeline" | "history">("timeline");
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [interestOppNames, setInterestOppNames] = useState<Record<string, string>>({});
  const [disqualifyOpen, setDisqualifyOpen] = useState(false);
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [disqualifying, setDisqualifying] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<"agent" | "pool" | "">("");
  const [reassignUserId, setReassignUserId] = useState("");
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [reassigning, setReassigning] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState<LeadFieldsForm>(EMPTY_LEAD_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<LeadFieldsForm>(EMPTY_LEAD_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [creatingTask, setCreatingTask] = useState(false);

  const canEdit = scopes.includes("leads:edit");
  const canDelete = scopes.includes("leads:delete");
  const canAssign = scopes.includes("leads:assign");
  const canCreateTask = scopes.includes("tasks:edit");
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadData, interestsList, campaignsList] = await Promise.all([
        trpc.leads.getById.query({ id }),
        trpc.interests.list.query({ parentType: "Lead", parentId: id }),
        trpc.campaigns.list.query().then((r) => r.campaigns).catch(() => []),
      ]);
      setLead(leadData);
      setInterestsData(interestsList);
      setCampaignsData(campaignsList.map((c) => ({ id: c.id, name: c.name })));
      // Convert form state is now managed via selectedInterests + interestOppNames
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [id]);

  const loadAiInsights = useCallback(async () => {
    try {
      const [summary, recs] = await Promise.all([
        trpc.aiFeatures.generateSummary.query({ entityType: "Lead", entityId: id }).catch(() => null),
        trpc.aiFeatures.getFollowUpRecommendations.query({ entityType: "Lead", entityId: id }).catch(() => null),
      ]);
      if (summary) setAiSummary(summary.summary);
      if (recs) setAiRecommendations(recs.recommendations);
    } catch { /* ignore */ }
  }, [id]);

  const handleLeadAiSearch = async () => {
    const question = aiQuestion.trim();
    if (!question) return;
    setAiSearchLoading(true);
    try {
      const result = await trpc.aiFeatures.askLeadIntelligence.mutate({ leadId: id, question });
      setAiSearchResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setAiSearchLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { loadAiInsights(); }, [loadAiInsights]);

  const copyToClipboard = (text: string, field: string) => { navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); };
  const startFieldEdit = (field: string, value: string) => { if (!canEdit) return; setEditingField(field); setEditDraft(value); setEditError(null); };

  const saveFieldEdit = async () => {
    if (!editingField || !lead) return;
    // Validate email format on inline edit
    if (editingField === "email" && editDraft && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editDraft.trim())) {
      setEditError("Must include @ and domain (e.g. name@example.com)");
      return;
    }
    try {
      const val = editDraft || undefined;
      await trpc.leads.update.mutate({
        id,
        ...(editingField === "email" ? { email: val } : {}),
        ...(editingField === "phone" ? { phone: val } : {}),
        ...(editingField === "preferredContactMethod" ? { preferredContactMethod: val ?? null } : {}),
        ...(editingField === "source" ? { source: val } : {}),
        ...(editingField === "notes" ? { notes: val ?? null } : {}),
        ...(editingField === "firstName" ? { firstName: val } : {}),
        ...(editingField === "lastName" ? { lastName: val } : {}),
        ...(editingField === "campaignName" ? { campaignName: val ?? null } : {}),
      });
      setEditingField(null);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleStatusClick = async (targetStatus: string) => {
    if (!lead || !canEdit) return;
    if (targetStatus === "Disqualified") { setDisqualifyOpen(true); return; }
    if (targetStatus === "Converted") {
      const activeInts = interestsData.filter((i) => i.status === "Active");
      const names: Record<string, string> = {};
      activeInts.forEach((i) => { names[i.id] = [i.propertyType, i.locationArea].filter(Boolean).join(" - ") || "Property Deal"; });
      setInterestOppNames(names);
      setSelectedInterests(new Set());
      setConvertOpen(true);
      return;
    }
    const validOrder = ["New", "Working", "Qualified"];
    const currentIdx = validOrder.indexOf(lead.status);
    const targetIdx = validOrder.indexOf(targetStatus);
    if (targetIdx <= currentIdx || targetIdx > currentIdx + 1) return;
    setStatusActionError(null);
    try {
      if (targetStatus === "Qualified") await trpc.leads.qualify.mutate({ id });
      else await trpc.leads.update.mutate({ id, status: targetStatus });
      fetchData();
    } catch (err: unknown) { setStatusActionError(err instanceof Error ? err.message : String(err)); }
  };

  const handleDisqualify = async () => {
    setDisqualifying(true);
    setStatusActionError(null);
    try { await trpc.leads.disqualify.mutate({ id, reason: disqualifyReason || undefined }); setDisqualifyOpen(false); setDisqualifyReason(""); fetchData(); }
    catch (err: unknown) { setStatusActionError(err instanceof Error ? err.message : String(err)); }
    finally { setDisqualifying(false); }
  };

  const handleConvert = async () => {
    setConverting(true); setConvertError(null);
    try {
      // Convert lead to contact (with first selected interest as opportunity if any)
      const firstSelected = [...selectedInterests][0];
      const result = await trpc.leads.convert.mutate({
        id,
        opportunityName: firstSelected ? (interestOppNames[firstSelected] || undefined) : undefined,
      });

      // Create additional opportunities for remaining selected interests
      if (result?.contact?.id && selectedInterests.size > 1) {
        const remaining = [...selectedInterests].slice(1);
        for (const interestId of remaining) {
          try {
            await trpc.interests.convertToOpportunity.mutate({
              interestId,
              opportunityName: interestOppNames[interestId] || "Property Deal",
            });
          } catch { /* continue with others */ }
        }
      }

      setConvertOpen(false);
      if (result?.contact?.id) navigate(`/contacts/${result.contact.id}`);
      else fetchData();
    } catch (err: unknown) { setConvertError(err instanceof Error ? err.message : String(err)); } finally { setConverting(false); }
  };

  const handleLogActivity = async (type: "Call" | "Note" | "Meeting") => {
    try { await trpc.crmActivities.create.mutate({ relatedObjectType: "Lead", relatedObjectId: id, activityType: type, notes: `${type} logged` }); setTimelineKey((k) => k + 1); }
    catch (err) { console.error(err); }
  };

  const openTaskModal = () => {
    setTaskSubject(""); setTaskDescription(""); setTaskDueDate(""); setTaskPriority("Medium");
    setTaskModalOpen(true);
  };

  const handleCreateTask = async () => {
    if (!taskSubject.trim()) return;
    setCreatingTask(true);
    try {
      await trpc.tasks.create.mutate({
        relatedObjectType: "Lead",
        relatedObjectId: id,
        subject: taskSubject.trim(),
        description: taskDescription.trim() || undefined,
        dueDate: taskDueDate || undefined,
        priority: taskPriority,
      });
      setTaskModalOpen(false);
      setSidebarTab("timeline");
      setTimelineKey((k) => k + 1);
    } catch (err) { console.error(err); } finally { setCreatingTask(false); }
  };

  const openReassign = async () => {
    try { const members = await trpc.orgSettings.getOrgMembers.query(); setOrgMembers(members); setReassignTarget(""); setReassignUserId(""); setReassignOpen(true); }
    catch (err) { console.error(err); }
  };

  const handleReassign = async () => {
    setReassigning(true);
    try {
      if (reassignTarget === "pool") { await trpc.leads.sendToPool.mutate({ leadId: id }); setReassignOpen(false); navigate("/leads"); }
      else if (reassignTarget === "agent" && reassignUserId) { await trpc.leads.assign.mutate({ leadId: id, userId: reassignUserId }); setReassignOpen(false); fetchData(); }
    } catch (err) { console.error(err); } finally { setReassigning(false); }
  };

  const leadToForm = (l: NonNullable<typeof lead>): LeadFieldsForm => ({
    firstName: l.firstName, lastName: l.lastName, email: l.email ?? "", phone: l.phone ?? "",
    source: l.source ?? "", preferredContactMethod: l.preferredContactMethod ?? "",
    campaignName: l.campaignName ?? "", notes: l.notes ?? "",
  });

  const handleEditClick = () => {
    if (!lead) return;
    setEditForm(leadToForm(lead));
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setSavingEdit(true);
    try {
      await trpc.leads.update.mutate({
        id,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        phone: editForm.phone,
        source: editForm.source,
        preferredContactMethod: editForm.preferredContactMethod || null,
        campaignName: editForm.campaignName || null,
        notes: editForm.notes || null,
      });
      setEditOpen(false);
      fetchData();
    } catch (err) { console.error(err); } finally { setSavingEdit(false); }
  };

  const openClone = () => {
    if (!lead) return;
    setCloneForm({ ...leadToForm(lead), firstName: lead.firstName, lastName: lead.lastName });
    setCloneOpen(true);
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const cloned = await trpc.leads.clone.mutate({
        id,
        overrides: {
          firstName: cloneForm.firstName,
          lastName: cloneForm.lastName,
          email: cloneForm.email || null,
          phone: cloneForm.phone || null,
          source: cloneForm.source || undefined,
          preferredContactMethod: cloneForm.preferredContactMethod || null,
          campaignName: cloneForm.campaignName || null,
          notes: cloneForm.notes || null,
        },
      });
      setCloneOpen(false);
      navigate(`/leads/${cloned.id}`);
    } catch (err) { console.error(err); } finally { setCloning(false); }
  };

  const handleDeleteLead = async () => {
    setDeleting(true);
    try {
      await trpc.leads.delete.mutate({ id });
      navigate("/leads");
    } catch (err) { console.error(err); setDeleting(false); }
  };

  if (loading) return <div className="p-6"><div className="skeleton h-8 w-48 rounded" /><div className="skeleton mt-4 h-12 w-full rounded" /></div>;
  if (!lead) return <div className="p-6 text-foreground-muted">Lead not found</div>;

  const isTerminal = ["Converted", "Disqualified", "Merged"].includes(lead.status);
  const currentStepIdx = STATUS_STEPS.indexOf(lead.status);
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

  // Editable field row (label left, value right-aligned)
  const fieldRow = (label: string, field: string, value: string | null, options?: string[]) => {
    if (editingField === field) {
      return (
        <div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground-muted">{label}</span>
            <div className="flex items-center gap-1">
              {options ? (
                <select value={editDraft} onChange={(e) => { setEditDraft(e.target.value); setEditError(null); }} autoFocus onBlur={saveFieldEdit} className="rounded border border-input-borderFocus bg-input-bg px-2 py-1 text-sm text-input-text outline-none text-right">
                  {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                </select>
              ) : (
                <input type="text" value={editDraft} onChange={(e) => { setEditDraft(e.target.value); setEditError(null); }} onKeyDown={(e) => { if (e.key === "Enter") saveFieldEdit(); if (e.key === "Escape") setEditingField(null); }} autoFocus className={`rounded border bg-input-bg px-2 py-1 text-sm text-input-text outline-none text-right ${editError ? "border-error-500" : "border-input-borderFocus"}`} />
              )}
              <button onClick={saveFieldEdit} className="text-success-500"><Check className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {editError && <p className="text-right text-2xs text-error-500 -mt-1 pb-1">{editError}</p>}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-foreground-muted">{label}</span>
        <div className="flex items-center gap-1.5">
          <span onDoubleClick={() => startFieldEdit(field, value ?? "")} className={`text-sm font-medium text-foreground ${canEdit ? "cursor-pointer hover:text-primary-text" : ""}`} title={canEdit ? "Double-click to edit" : undefined}>
            {value || "—"}
          </span>
          {value && (field === "email" || field === "phone") && (
            <button onClick={() => copyToClipboard(value, field)} className="text-foreground-subtle hover:text-foreground">
              {copiedField === field ? <Check className="h-3 w-3 text-success-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* ====== HEADER ====== */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{lead.firstName} {lead.lastName}</h1>
            <div className="mt-0.5 flex items-center gap-1 text-sm text-foreground-muted">
              <span>Lead</span>
              <span>·</span>
              <span>owned by {lead.owner?.name ?? lead.owner?.email ?? "Unassigned"}</span>
              {canAssign && <button onClick={openReassign} className="text-primary-text hover:underline text-xs ml-1">(reassign)</button>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button onClick={handleEditClick} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-semibold text-button-primary-text shadow-card transition-colors hover:bg-button-primary-hover">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {canEdit && (
              <button
                onClick={openClone}
                className="flex items-center gap-1.5 rounded-lg border-2 border-primary-accent px-4 py-2 text-sm font-semibold text-primary-text shadow-card transition-colors hover:bg-primary-50 dark:hover:bg-primary-950"
              >
                <Copy className="h-3.5 w-3.5" /> Clone
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDeleteConfirmOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-destructive-bg px-4 py-2 text-sm font-semibold text-button-destructive-text shadow-card transition-colors hover:bg-button-destructive-hover">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ====== STATUS STEPPER ====== */}
      <div className="flex border-b border-border bg-card">
        {STATUS_STEPS.map((step) => {
          const isCurrent = lead.status === step;
          const isPast = currentStepIdx >= STATUS_STEPS.indexOf(step);
          const isDisqualified = step === "Disqualified";
          return (
            <button key={step} onClick={() => handleStatusClick(step)}
              disabled={isTerminal && !isDisqualified}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                isCurrent ? (isDisqualified ? "border-error-500 bg-error-50 text-error-700 dark:bg-error-950 dark:text-error-300" : "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300") :
                isPast ? "border-success-400 bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300" :
                "border-transparent text-foreground-muted hover:bg-background-secondary"
              }`}>
              {step}
            </button>
          );
        })}
      </div>
      {statusActionError && (
        <div className="mx-4 mt-3 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300">{statusActionError}</div>
      )}

      {/* ====== ALERTS ====== */}
      {lead.matchedLeadId && lead.matchStrength && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 dark:border-warning-800 dark:bg-warning-950">
          <div className="flex items-center gap-2">
            <span className="text-warning-600">⚠</span>
            <span className="text-sm text-warning-900 dark:text-warning-100">Possible duplicate — a contact with this email already exists.</span>
          </div>
          <button onClick={async () => { navigate(`/leads/${lead.matchedLeadId}`); }}
            className="rounded-md border border-warning-300 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background-secondary dark:border-warning-700">Review</button>
        </div>
      )}

      {isTerminal && lead.status === "Converted" && lead.convertedContactId && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-800 dark:bg-success-950">
          <span className="text-sm text-success-900 dark:text-success-100">This lead has been converted.</span>
          <a href={`/contacts/${lead.convertedContactId}`} className="text-sm font-medium text-primary-text hover:underline">View Contact →</a>
        </div>
      )}

      {/* AI Summary */}
      {aiSummary && (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 dark:border-accent-800 dark:bg-accent-950">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" />
          <div>
            <p className="text-xs text-accent-800 dark:text-accent-200">{aiSummary}</p>
            {aiRecommendations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {aiRecommendations.map((r, i) => <span key={i} className="rounded-full border border-accent-200 bg-background px-2 py-0.5 text-2xs text-foreground-muted dark:border-accent-800"><Lightbulb className="mr-0.5 inline h-2.5 w-2.5" />{r.action}</span>)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-6 mt-4 rounded-xl border border-accent-200 bg-accent-50/70 p-4 dark:border-accent-800 dark:bg-accent-950/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">AI lead intelligence</p>
            <p className="text-xs text-foreground-muted">Ask for a concise summary of this lead, related objects, and lead portfolio stats.</p>
          </div>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleLeadAiSearch(); } }}
            placeholder="Summarize this lead and show portfolio stats"
            className="flex-1 rounded-lg border border-accent-300 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent-500"
          />
          <button
            onClick={() => void handleLeadAiSearch()}
            disabled={aiSearchLoading || !aiQuestion.trim()}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiSearchLoading ? "Searching..." : "Search"}
          </button>
        </div>
        {aiSearchResult && (
          <div className="mt-4 space-y-3 rounded-lg border border-accent-200 bg-background/70 p-3 dark:border-accent-800">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">Answer</p>
              <p className="mt-1 text-sm text-foreground">{aiSearchResult.answer}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-background-secondary p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Lead snapshot</p>
                <p className="mt-1 text-sm text-foreground">{aiSearchResult.leadSnapshot}</p>
              </div>
              <div className="rounded-lg border border-border bg-background-secondary p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Portfolio snapshot</p>
                <p className="mt-1 text-sm text-foreground">{aiSearchResult.portfolioSnapshot}</p>
              </div>
            </div>
            {aiSearchResult.relatedObjects.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Related objects</p>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {aiSearchResult.relatedObjects.map((item, index) => <li key={index} className="rounded-md border border-border bg-background-secondary px-2 py-1">{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== TWO-COLUMN BODY ====== */}
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-5">

        {/* LEFT COLUMN — Tabs */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-card-border bg-card shadow-card">
            {/* Tab bar */}
            <div className="flex border-b border-border">
              {(["details", "interests", "attachments"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5">
              {activeTab === "details" && (
                <div className="space-y-6">
                  {/* Lead information */}
                  <CollapsibleSection title="Lead information">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Email", "email", lead.email)}
                      {fieldRow("Phone", "phone", lead.phone)}
                      {fieldRow("Preferred", "preferredContactMethod", lead.preferredContactMethod, ["", "Email", "Phone", "SMS", "WhatsApp"])}
                    </div>
                  </CollapsibleSection>

                  {/* Origin */}
                  <CollapsibleSection title="Origin">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Source", "source", lead.source, ["", "Manual", "Referral", "Walk-in", "Open House", "Sphere", "Phone", "Website", "Facebook", "Google", "API", "Import"])}
                      {fieldRow("Campaign", "campaignName", lead.campaignName)}
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-foreground-muted">Intake</span>
                        <span className="text-sm font-medium text-foreground">{lead.intakeMode}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-foreground-muted">Created</span>
                        <span className="text-sm font-medium text-foreground">{new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-foreground-muted">Created by</span>
                        <span className="text-sm font-medium text-foreground">{lead.createdByUser?.name ?? lead.createdByUser?.email ?? "—"}</span>
                      </div>
                    </div>
                  </CollapsibleSection>

                  {/* Notes */}
                  <CollapsibleSection title="Notes">
                    {editingField === "notes" ? (
                      <div className="flex flex-col gap-1">
                        <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }} autoFocus rows={3} className="w-full rounded border border-input-borderFocus bg-input-bg px-3 py-2 text-sm text-input-text outline-none resize-none" />
                        <div className="flex gap-2"><button onClick={saveFieldEdit} className="text-xs text-success-500">Save</button><button onClick={() => setEditingField(null)} className="text-xs text-foreground-muted">Cancel</button></div>
                      </div>
                    ) : (
                      <p onDoubleClick={() => startFieldEdit("notes", lead.notes ?? "")} className={`text-sm text-foreground ${canEdit ? "cursor-pointer hover:bg-background-secondary rounded px-1 py-0.5" : ""}`} title={canEdit ? "Double-click to edit" : undefined}>
                        {lead.notes || (canEdit ? "Double-click to add notes..." : "—")}
                      </p>
                    )}
                  </CollapsibleSection>

                  {lead.status === "Disqualified" && lead.disqualifyReason && (
                    <CollapsibleSection title="Disqualification">
                      <p className="text-sm text-error-600 dark:text-error-400">Reason: {lead.disqualifyReason}</p>
                    </CollapsibleSection>
                  )}

                  <CustomFieldsSection entityType="Lead" recordId={id} values={lead.customFields} canEdit={canEdit} onSaved={fetchData} />
                </div>
              )}

              {activeTab === "interests" && (
                <InterestPanel parentType="Lead" parentId={id} initialInterests={interestsData} initialCampaigns={campaignsData} onRefresh={fetchData} />
              )}


              {activeTab === "attachments" && (
                <AttachmentsPanel parentType="Lead" parentId={id} />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Fixed sidebar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Communicate */}
          <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
            <p className="mb-3 text-xs font-medium text-foreground-subtle uppercase tracking-wide">Communicate</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => lead.phone && navigate(`/leads/${id}?tab=whatsapp`)} disabled={!lead.phone}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${lead.phone ? "border-success-300 bg-success-50 text-success-700 hover:bg-success-100 dark:border-success-700 dark:bg-success-950 dark:text-success-300" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <MessageCircle className="mx-auto mb-1 h-4 w-4" />WhatsApp
              </button>
              <button onClick={() => lead.phone && navigate(`/leads/${id}?tab=sms`)} disabled={!lead.phone}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${lead.phone ? "border-input-border bg-card text-foreground hover:bg-background-secondary" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <Smartphone className="mx-auto mb-1 h-4 w-4" />SMS
              </button>
              <button onClick={() => lead.email && navigate(`/leads/${id}?tab=email`)} disabled={!lead.email}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${lead.email ? "border-input-border bg-card text-foreground hover:bg-background-secondary" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <Mail className="mx-auto mb-1 h-4 w-4" />Email
              </button>
            </div>
          </div>

          {/* Log & schedule */}
          <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
            <p className="mb-3 text-xs font-medium text-foreground-subtle uppercase tracking-wide">Log & schedule</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => handleLogActivity("Call")} className="rounded-lg border border-input-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background-secondary">
                <Phone className="mx-auto mb-1 h-4 w-4" />Call
              </button>
              <button onClick={() => handleLogActivity("Note")} className="rounded-lg border border-input-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background-secondary">
                <Mail className="mx-auto mb-1 h-4 w-4" />Note
              </button>
              <button onClick={openTaskModal} disabled={!canCreateTask}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${canCreateTask ? "border-input-border bg-card text-foreground hover:bg-background-secondary" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <Check className="mx-auto mb-1 h-4 w-4" />Task
              </button>
            </div>
          </div>

          {/* Timeline / History */}
          <div className="rounded-xl border border-card-border bg-card shadow-card">
            <div className="flex border-b border-border">
              <button onClick={() => setSidebarTab("timeline")} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${sidebarTab === "timeline" ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>Activity</button>
              <button onClick={() => setSidebarTab("history")} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${sidebarTab === "history" ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>History</button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {sidebarTab === "timeline" ? (
                <UnifiedTimeline key={timelineKey} objectType="Lead" objectId={id} />
              ) : (
                <AuditHistory entityType="Lead" entityId={id} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====== MODALS ====== */}
      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Lead" onSubmit={handleEditSave} submitLabel="Save Changes" submitting={savingEdit}>
        <LeadFormFields form={editForm} onChange={setEditForm} />
      </FormModal>

      <FormModal open={cloneOpen} onClose={() => setCloneOpen(false)} title="Clone Lead" onSubmit={handleClone} submitLabel="Create Clone" submitting={cloning}>
        <LeadFormFields form={cloneForm} onChange={setCloneForm} />
        <p className="text-xs text-foreground-muted">Owner and team are copied from the original lead — use Reassign afterward to change them.</p>
      </FormModal>

      <FormModal open={disqualifyOpen} onClose={() => { setDisqualifyOpen(false); setDisqualifyReason(""); }} title="Disqualify Lead" onSubmit={handleDisqualify} submitLabel="Disqualify" submitting={disqualifying}>
        <FormField label="Reason">
          <select value={disqualifyReason} onChange={(e) => setDisqualifyReason(e.target.value)} className={inputClass}>
            <option value="">Select a reason...</option>
            <option value="Bad contact info">Bad contact info</option>
            <option value="Not interested">Not interested</option>
            <option value="Wrong area">Wrong area</option>
            <option value="Bought elsewhere">Bought elsewhere</option>
            <option value="Duplicate">Duplicate</option>
            <option value="Unresponsive">Unresponsive</option>
            <option value="Other">Other</option>
          </select>
        </FormField>
      </FormModal>

      {/* Convert modal with interest selection */}
      {convertOpen && (
        <div className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay" onClick={() => { setConvertOpen(false); setConvertError(null); }}>
          <div className="mx-4 w-full max-w-lg animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-semibold text-foreground">Convert Lead to Contact</h3>
            <p className="mb-4 text-xs text-foreground-muted">This will create a contact from this lead. Select any interests you want to create as opportunities:</p>

            {convertError && <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300">{convertError}</div>}

            {interestsData.filter((i) => i.status === "Active").length > 0 ? (
              <div className="mb-4 space-y-2">
                {interestsData.filter((i) => i.status === "Active").map((interest) => {
                  const isSelected = selectedInterests.has(interest.id);
                  const preview = [interest.propertyType, interest.budgetMax ? `$${interest.budgetMax.toLocaleString()}` : null, interest.locationArea].filter(Boolean).join(", ");
                  return (
                    <div key={interest.id} className={`rounded-lg border p-3 transition-colors ${isSelected ? "border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-950" : "border-card-border bg-card hover:bg-background-secondary"}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={isSelected}
                          onChange={() => {
                            setSelectedInterests((prev) => {
                              const next = new Set(prev);
                              if (next.has(interest.id)) next.delete(interest.id); else next.add(interest.id);
                              return next;
                            });
                          }}
                          className="mt-1 h-4 w-4 rounded border-input-border accent-primary-accent" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{preview || "Interest"}</p>
                          {interest.bedrooms && <span className="text-xs text-foreground-muted">{interest.bedrooms} BR</span>}
                          {isSelected && (
                            <div className="mt-2">
                              <label className="text-2xs text-foreground-subtle">Opportunity name</label>
                              <input type="text" value={interestOppNames[interest.id] ?? ""} onChange={(e) => setInterestOppNames((prev) => ({ ...prev, [interest.id]: e.target.value }))}
                                className="mt-0.5 w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm text-input-text outline-none focus:border-input-borderFocus" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mb-4 rounded-lg bg-background-secondary px-4 py-3 text-sm text-foreground-muted">
                No active interests. The lead will be converted to a contact without creating any opportunities.
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={() => { setConvertOpen(false); setConvertError(null); }} className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover">Cancel</button>
              <button onClick={handleConvert} disabled={converting}
                className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50">
                {converting ? "Converting..." : selectedInterests.size > 0 ? `Convert + Create ${selectedInterests.size} Opportunity${selectedInterests.size > 1 ? "ies" : ""}` : "Convert to Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      <FormModal open={reassignOpen} onClose={() => { setReassignOpen(false); setReassignTarget(""); setReassignUserId(""); }} title="Reassign Lead" onSubmit={handleReassign} submitLabel={reassignTarget === "pool" ? "Send to Pool" : "Reassign"} submitting={reassigning}>
        <FormField label="Reassign to">
          <div className="flex gap-2">
            <button type="button" onClick={() => { setReassignTarget("agent"); setReassignUserId(""); }}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${reassignTarget === "agent" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300" : "border-input-border bg-input-bg text-foreground-muted hover:bg-background-secondary"}`}>
              <UserPlus className="mx-auto mb-1 h-5 w-5" />Agent
            </button>
            <button type="button" onClick={() => setReassignTarget("pool")}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${reassignTarget === "pool" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300" : "border-input-border bg-input-bg text-foreground-muted hover:bg-background-secondary"}`}>
              <Inbox className="mx-auto mb-1 h-5 w-5" />Pool
            </button>
          </div>
        </FormField>
        {reassignTarget === "agent" && (
          <FormField label="Select agent">
            <select value={reassignUserId} onChange={(e) => setReassignUserId(e.target.value)} className={inputClass}>
              <option value="">Select agent...</option>
              {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
            </select>
          </FormField>
        )}
        {reassignTarget === "pool" && <p className="text-xs text-foreground-muted">Remove the owner and return this lead to the shared pool.</p>}
      </FormModal>

      <ConfirmModal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} onConfirm={handleDeleteLead}
        title="Delete Lead" message="Are you sure you want to delete this lead? This cannot be undone."
        confirmLabel="Delete" destructive confirming={deleting} />

      <FormModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="New Task" onSubmit={handleCreateTask} submitLabel="Create Task" submitting={creatingTask}>
        <FormField label="Subject" required>
          <input type="text" value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)} className={inputClass} placeholder="e.g. Follow up on financing" autoFocus />
        </FormField>
        <FormField label="Description">
          <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} rows={3} className={`resize-none ${inputClass}`} placeholder="Optional details..." />
        </FormField>
        <FormField label="Due date">
          <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Priority">
          <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)} className={inputClass}>
            {["Low", "Medium", "High"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FormField>
      </FormModal>
    </div>
  );
}
