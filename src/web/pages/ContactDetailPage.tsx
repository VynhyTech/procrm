import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { InterestPanel } from "../components/InterestPanel";
import { AuditHistory } from "../components/AuditHistory";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { UnifiedTimeline } from "../components/UnifiedTimeline";
import { FormModal, FormField } from "../components/FormModal";
import { ContactFormFields, EMPTY_CONTACT_FORM, type ContactFieldsForm } from "../components/ContactFormFields";
import { ConfirmModal } from "../components/ConfirmModal";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { CustomFieldsSection } from "../components/CustomFieldsSection";
import { Phone, Mail, MessageCircle, Smartphone, Check, Copy, Pencil, Trash2 } from "lucide-react";

type ContactData = Awaited<ReturnType<typeof trpc.contacts.getById.query>>;


const LIFECYCLE_STAGES = ["Prospect", "Customer"];
const ENGAGEMENT_STATUSES = ["Active", "Inactive"];
const CONTACT_TYPES = ["Individual", "Developer", "Investor"];
const CONTACT_METHODS = ["", "Email", "Phone", "SMS", "WhatsApp"];
const CONSENT_OPTIONS = ["", "opt-in", "opt-out"];

interface ContactDetailPageProps { id: string; }

export function ContactDetailPage({ id }: ContactDetailPageProps) {
  const { scopes } = useAuth();
  const { basePath } = useApp();
  const [contact, setContact] = useState<ContactData | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"details" | "interests" | "attachments">("details");
  const [sidebarTab, setSidebarTab] = useState<"timeline" | "history">("timeline");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignUserId, setReassignUserId] = useState("");
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [reassigning, setReassigning] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState<ContactFieldsForm>(EMPTY_CONTACT_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ContactFieldsForm>(EMPTY_CONTACT_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [creatingTask, setCreatingTask] = useState(false);

  // Dev override: enable actions while DB/auth not available
  const canEdit = true;
  const canDelete = true;
  const canAssign = true;
  const canCreateTask = true;
  const navigate = (path: string) => { window.history.pushState({}, "", basePath.concat(path)); window.dispatchEvent(new PopStateEvent("popstate")); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const contactData = await trpc.contacts.getById.query({ id });
      setContact(contactData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyToClipboard = (text: string, field: string) => { navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); };
  const startFieldEdit = (field: string, value: string) => { if (!canEdit) return; setEditingField(field); setEditDraft(value); setEditError(null); };

  const saveFieldEdit = async () => {
    if (!editingField || !contact) return;
    if ((editingField === "email" || editingField === "secondaryEmail") && editDraft && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editDraft.trim())) {
      setEditError("Must include @ and domain (e.g. name@example.com)"); return;
    }
    try {
      const val = editDraft || undefined;
      await trpc.contacts.update.mutate({
        id,
        ...(editingField === "email" ? { email: val ?? null } : {}),
        ...(editingField === "phone" ? { phone: val ?? null } : {}),
        ...(editingField === "secondaryEmail" ? { secondaryEmail: val ?? null } : {}),
        ...(editingField === "secondaryPhone" ? { secondaryPhone: val ?? null } : {}),
        ...(editingField === "preferredContactMethod" ? { preferredContactMethod: val ?? null } : {}),
        ...(editingField === "lifecycleStage" ? { lifecycleStage: val } : {}),
        ...(editingField === "engagementStatus" ? { engagementStatus: val } : {}),
        ...(editingField === "contactType" ? { contactType: val } : {}),
        ...(editingField === "source" ? { source: val ?? null } : {}),
        ...(editingField === "campaignName" ? { campaignName: val ?? null } : {}),
        ...(editingField === "streetAddress" ? { streetAddress: val ?? null } : {}),
        ...(editingField === "city" ? { city: val ?? null } : {}),
        ...(editingField === "state" ? { state: val ?? null } : {}),
        ...(editingField === "postalCode" ? { postalCode: val ?? null } : {}),
        ...(editingField === "importantDates" ? { importantDates: val ?? null } : {}),
        ...(editingField === "householdContext" ? { householdContext: val ?? null } : {}),
        ...(editingField === "marketingConsent" ? { marketingConsent: val ?? null } : {}),
        ...(editingField === "title" ? { title: val ?? null } : {}),
        ...(editingField === "department" ? { department: val ?? null } : {}),
        ...(editingField === "notes" ? { notes: val ?? null } : {}),
      });
      setEditingField(null);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleLogActivity = async (type: "Call" | "Note" | "Meeting") => {
    try { await trpc.crmActivities.create.mutate({ relatedObjectType: "Contact", relatedObjectId: id, activityType: type, notes: `${type} logged` }); setTimelineKey((k) => k + 1); }
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
        relatedObjectType: "Contact",
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
    try { const members = await trpc.orgSettings.getOrgMembers.query(); setOrgMembers(members); setReassignUserId(""); setReassignOpen(true); }
    catch (err) { console.error(err); }
  };

  const handleReassign = async () => {
    if (!reassignUserId) return;
    setReassigning(true);
    try { await trpc.contacts.assign.mutate({ contactId: id, userId: reassignUserId }); setReassignOpen(false); fetchData(); }
    catch (err) { console.error(err); } finally { setReassigning(false); }
  };

  const contactToForm = (c: NonNullable<typeof contact>): ContactFieldsForm => ({
    firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", phone: c.phone ?? "",
    secondaryEmail: c.secondaryEmail ?? "", secondaryPhone: c.secondaryPhone ?? "",
    preferredContactMethod: c.preferredContactMethod ?? "",
    lifecycleStage: c.lifecycleStage, engagementStatus: c.engagementStatus, contactType: c.contactType,
    title: c.title ?? "", department: c.department ?? "",
    streetAddress: c.streetAddress ?? "", city: c.city ?? "", state: c.state ?? "", postalCode: c.postalCode ?? "",
    source: c.source ?? "", campaignName: c.campaignName ?? "",
    importantDates: c.importantDates ?? "", householdContext: c.householdContext ?? "", marketingConsent: c.marketingConsent ?? "",
    notes: c.notes ?? "",
  });

  const handleEditClick = () => {
    if (!contact) return;
    setEditForm(contactToForm(contact));
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setSavingEdit(true);
    try {
      await trpc.contacts.update.mutate({
        id,
        firstName: editForm.firstName, lastName: editForm.lastName,
        email: editForm.email || null, phone: editForm.phone || null,
        secondaryEmail: editForm.secondaryEmail || null, secondaryPhone: editForm.secondaryPhone || null,
        preferredContactMethod: editForm.preferredContactMethod || null,
        lifecycleStage: editForm.lifecycleStage, engagementStatus: editForm.engagementStatus, contactType: editForm.contactType,
        title: editForm.title || null, department: editForm.department || null,
        streetAddress: editForm.streetAddress || null, city: editForm.city || null, state: editForm.state || null, postalCode: editForm.postalCode || null,
        source: editForm.source || null, campaignName: editForm.campaignName || null,
        importantDates: editForm.importantDates || null, householdContext: editForm.householdContext || null,
        marketingConsent: editForm.marketingConsent || null,
        notes: editForm.notes || null,
      });
      setEditOpen(false);
      fetchData();
    } catch (err) { console.error(err); } finally { setSavingEdit(false); }
  };

  const openClone = () => {
    if (!contact) return;
    setCloneForm(contactToForm(contact));
    setCloneOpen(true);
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const cloned = await trpc.contacts.clone.mutate({
        id,
        overrides: {
          firstName: cloneForm.firstName, lastName: cloneForm.lastName,
          email: cloneForm.email || null, phone: cloneForm.phone || null,
          secondaryEmail: cloneForm.secondaryEmail || null, secondaryPhone: cloneForm.secondaryPhone || null,
          preferredContactMethod: cloneForm.preferredContactMethod || null,
          lifecycleStage: cloneForm.lifecycleStage, engagementStatus: cloneForm.engagementStatus, contactType: cloneForm.contactType,
          title: cloneForm.title || null, department: cloneForm.department || null,
          streetAddress: cloneForm.streetAddress || null, city: cloneForm.city || null, state: cloneForm.state || null, postalCode: cloneForm.postalCode || null,
          source: cloneForm.source || null, campaignName: cloneForm.campaignName || null,
          importantDates: cloneForm.importantDates || null, householdContext: cloneForm.householdContext || null,
          marketingConsent: cloneForm.marketingConsent || null,
          notes: cloneForm.notes || null,
        },
      });
      setCloneOpen(false);
      navigate(`/contacts/${cloned.id}`);
    } catch (err) { console.error(err); } finally { setCloning(false); }
  };

  const handleDeleteContact = async () => {
    setDeleting(true);
    try {
      await trpc.contacts.delete.mutate({ id });
      navigate("/contacts");
    } catch (err) { console.error(err); setDeleting(false); }
  };

  if (loading) return <div className="p-6"><div className="skeleton h-8 w-48 rounded" /><div className="skeleton mt-4 h-12 w-full rounded" /></div>;
  if (!contact) return <div className="p-6 text-foreground-muted">Contact not found</div>;

  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text placeholder:text-input-placeholder outline-none transition-colors focus:border-input-borderFocus";

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
            <h1 className="text-xl font-bold text-foreground">{contact.firstName} {contact.lastName}</h1>
            <div className="mt-0.5 flex items-center gap-1 text-sm text-foreground-muted">
              <span>Contact</span>
              <span>·</span>
              <span>owned by {contact.owner?.name ?? contact.owner?.email ?? "Unassigned"}</span>
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

      {/* ====== TWO-COLUMN BODY ====== */}
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-5">

        {/* LEFT COLUMN — Tabs */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-card-border bg-card shadow-card">
            <div className="flex border-b border-border">
              {(["details", "interests", "attachments"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === "details" && (
                <div className="space-y-6">
                  <CollapsibleSection title="Contact information">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Email", "email", contact.email)}
                      {fieldRow("Phone", "phone", contact.phone)}
                      {fieldRow("Secondary Email", "secondaryEmail", contact.secondaryEmail)}
                      {fieldRow("Secondary Phone", "secondaryPhone", contact.secondaryPhone)}
                      {fieldRow("Preferred", "preferredContactMethod", contact.preferredContactMethod, CONTACT_METHODS)}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Relationship">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Lifecycle", "lifecycleStage", contact.lifecycleStage, LIFECYCLE_STAGES)}
                      {fieldRow("Engagement", "engagementStatus", contact.engagementStatus, ENGAGEMENT_STATUSES)}
                      {fieldRow("Type", "contactType", contact.contactType, CONTACT_TYPES)}
                      {fieldRow("Title", "title", contact.title)}
                      {fieldRow("Department", "department", contact.department)}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Address">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Street", "streetAddress", contact.streetAddress)}
                      {fieldRow("City", "city", contact.city)}
                      {fieldRow("State", "state", contact.state)}
                      {fieldRow("Postal Code", "postalCode", contact.postalCode)}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Origin">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Source", "source", contact.source)}
                      {fieldRow("Campaign", "campaignName", contact.campaignName)}
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-foreground-muted">Created</span>
                        <span className="text-sm font-medium text-foreground">{new Date(contact.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-foreground-muted">Created by</span>
                        <span className="text-sm font-medium text-foreground">{contact.createdByUser?.name ?? contact.createdByUser?.email ?? "—"}</span>
                      </div>
                    </div>
                  </CollapsibleSection>

                  {contact.originalLeadSource && (
                    <CollapsibleSection title="Lead origin (snapshot)">
                      <div className="divide-y divide-border-subtle">
                        <div className="flex items-center justify-between py-2"><span className="text-sm text-foreground-muted">Original source</span><span className="text-sm font-medium text-foreground">{contact.originalLeadSource}</span></div>
                        <div className="flex items-center justify-between py-2"><span className="text-sm text-foreground-muted">Original campaign</span><span className="text-sm font-medium text-foreground">{contact.originalCampaign ?? "—"}</span></div>
                        <div className="flex items-center justify-between py-2"><span className="text-sm text-foreground-muted">Intake mode</span><span className="text-sm font-medium text-foreground">{contact.originalIntakeMode ?? "—"}</span></div>
                        <div className="flex items-center justify-between py-2"><span className="text-sm text-foreground-muted">Lead created</span><span className="text-sm font-medium text-foreground">{contact.leadCreatedDate ? new Date(contact.leadCreatedDate).toLocaleDateString() : "—"}</span></div>
                      </div>
                    </CollapsibleSection>
                  )}

                  <CollapsibleSection title="Personal">
                    <div className="divide-y divide-border-subtle">
                      {fieldRow("Important Dates", "importantDates", contact.importantDates)}
                      {fieldRow("Household", "householdContext", contact.householdContext)}
                      {fieldRow("Marketing Consent", "marketingConsent", contact.marketingConsent, CONSENT_OPTIONS)}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Notes">
                    {editingField === "notes" ? (
                      <div className="flex flex-col gap-1">
                        <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }} autoFocus rows={3} className="w-full rounded border border-input-borderFocus bg-input-bg px-3 py-2 text-sm text-input-text outline-none resize-none" />
                        <div className="flex gap-2"><button onClick={saveFieldEdit} className="text-xs text-success-500">Save</button><button onClick={() => setEditingField(null)} className="text-xs text-foreground-muted">Cancel</button></div>
                      </div>
                    ) : (
                      <p onDoubleClick={() => startFieldEdit("notes", contact.notes ?? "")} className={`text-sm text-foreground ${canEdit ? "cursor-pointer hover:bg-background-secondary rounded px-1 py-0.5" : ""}`} title={canEdit ? "Double-click to edit" : undefined}>
                        {contact.notes || (canEdit ? "Double-click to add notes..." : "—")}
                      </p>
                    )}
                  </CollapsibleSection>

                  {contact.opportunityRoles.length > 0 && (
                    <CollapsibleSection title={`Opportunities (${contact.opportunityRoles.length})`}>
                      <div className="divide-y divide-border-subtle">
                        {contact.opportunityRoles.map((role) => (
                          <a key={role.id} href={`/opportunities/${role.opportunityId}`} className="flex items-center justify-between py-2 transition-colors hover:text-primary-text">
                            <span className="text-sm font-medium">{role.opportunity.name}</span>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={role.opportunity.stage} />
                              <span className="text-xs text-foreground-muted">{role.roleName}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  <CustomFieldsSection entityType="Contact" recordId={id} values={contact.customFields} canEdit={canEdit} onSaved={fetchData} />
                </div>
              )}

              {activeTab === "interests" && (
                <InterestPanel parentType="Contact" parentId={id} />
              )}



              {activeTab === "attachments" && (
                <AttachmentsPanel parentType="Contact" parentId={id} />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Fixed sidebar */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
            <p className="mb-3 text-xs font-medium text-foreground-subtle uppercase tracking-wide">Communicate</p>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={!contact.phone} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${contact.phone ? "border-success-300 bg-success-50 text-success-700 hover:bg-success-100 dark:border-success-700 dark:bg-success-950 dark:text-success-300" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <MessageCircle className="mx-auto mb-1 h-4 w-4" />WhatsApp
              </button>
              <button disabled={!contact.phone} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${contact.phone ? "border-input-border bg-card text-foreground hover:bg-background-secondary" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <Smartphone className="mx-auto mb-1 h-4 w-4" />SMS
              </button>
              <button disabled={!contact.email} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${contact.email ? "border-input-border bg-card text-foreground hover:bg-background-secondary" : "border-input-border bg-input-bg text-foreground-subtle opacity-50"}`}>
                <Mail className="mx-auto mb-1 h-4 w-4" />Email
              </button>
            </div>
          </div>

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

          <div className="rounded-xl border border-card-border bg-card shadow-card">
            <div className="flex border-b border-border">
              <button onClick={() => setSidebarTab("timeline")} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${sidebarTab === "timeline" ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>Activity</button>
              <button onClick={() => setSidebarTab("history")} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${sidebarTab === "history" ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>History</button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {sidebarTab === "timeline" ? (
                <UnifiedTimeline key={timelineKey} objectType="Contact" objectId={id} />
              ) : (
                <AuditHistory entityType="Contact" entityId={id} />
              )}
            </div>
          </div>
        </div>
      </div>

      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Contact" onSubmit={handleEditSave} submitLabel="Save Changes" submitting={savingEdit}>
        <ContactFormFields form={editForm} onChange={setEditForm} />
      </FormModal>

      <FormModal open={cloneOpen} onClose={() => setCloneOpen(false)} title="Clone Contact" onSubmit={handleClone} submitLabel="Create Clone" submitting={cloning}>
        <ContactFormFields form={cloneForm} onChange={setCloneForm} />
        <p className="text-xs text-foreground-muted">Owner is copied from the original contact — use Reassign afterward to change it.</p>
      </FormModal>

      {/* Reassign modal */}
      <FormModal open={reassignOpen} onClose={() => setReassignOpen(false)} title="Reassign Contact" onSubmit={handleReassign} submitLabel="Reassign" submitting={reassigning}>
        <FormField label="Assign to">
          <select value={reassignUserId} onChange={(e) => setReassignUserId(e.target.value)} className={inputClass}>
            <option value="">Select agent...</option>
            {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
          </select>
        </FormField>
      </FormModal>

      <ConfirmModal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} onConfirm={handleDeleteContact}
        title="Delete Contact" message="Are you sure you want to delete this contact? This cannot be undone."
        confirmLabel="Delete" destructive confirming={deleting} />

      <FormModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="New Task" onSubmit={handleCreateTask} submitLabel="Create Task" submitting={creatingTask}>
        <FormField label="Subject" required>
          <input type="text" value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)} className={inputClass} placeholder="e.g. Follow up on renewal" autoFocus />
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
