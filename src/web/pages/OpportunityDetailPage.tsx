import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "../lib/auth";
import { trpc } from "../trpc";
import { StatusBadge } from "../components/StatusBadge";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { AuditHistory } from "../components/AuditHistory";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { ChevronRight, Pencil } from "lucide-react";
import { FormModal, FormField } from "../components/FormModal";
import { CustomFieldsSection } from "../components/CustomFieldsSection";

type OpportunityData = Awaited<ReturnType<typeof trpc.opportunities.getById.query>>;
type ActivityData = Awaited<ReturnType<typeof trpc.crmActivities.getForObject.query>>;

const STAGES = [
  "LeadQualified", "InitialDiscussion", "PropertyShared", "SiteVisitScheduled",
  "SiteVisitCompleted", "Interested", "Negotiation", "BookingIntent",
  "AgreementDrafted", "AgreementSigned", "ClosedWon", "ClosedLost",
];

interface OpportunityDetailPageProps { id: string; }

export function OpportunityDetailPage({ id }: OpportunityDetailPageProps) {
  const { basePath } = useApp();
  const [opportunity, setOpportunity] = useState<OpportunityData | null>(null);
  const [activities, setActivities] = useState<ActivityData>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", amount: "", probability: "", closeDate: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "contacts" | "activity" | "attachments">("details");
  const [activitySubTab, setActivitySubTab] = useState<"activity" | "history">("activity");
  const [addingNote, setAddingNote] = useState(false);

  const navigate = (path: string) => {
    window.history.pushState({}, "", basePath.concat(path));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [oppData, actData] = await Promise.all([
        trpc.opportunities.getById.query({ id }),
        trpc.crmActivities.getForObject.query({ objectType: "Opportunity", objectId: id }),
      ]);
      setOpportunity(oppData);
      setActivities(actData);
      if (oppData) {
        setEditForm({
          name: oppData.name,
          amount: oppData.amount?.toString() ?? "",
          probability: oppData.probability?.toString() ?? "",
          closeDate: oppData.closeDate ?? "",
        });
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEditSave = async () => {
    if (!editForm.name) return;
    setEditSaving(true);
    try {
      await trpc.opportunities.update.mutate({
        id,
        name: editForm.name,
        amount: editForm.amount ? parseFloat(editForm.amount) : null,
        probability: editForm.probability ? parseInt(editForm.probability) : null,
        closeDate: editForm.closeDate || null,
      });
      setEditOpen(false);
      fetchData();
    } catch (err) { console.error(err); } finally { setEditSaving(false); }
  };

  const handleStageChange = async (newStage: string) => {
    setUpdatingStage(true);
    try {
      await trpc.opportunities.updateStage.mutate({ id, stage: newStage });
      fetchData();
    } catch (err) { console.error(err); } finally { setUpdatingStage(false); }
  };

  const handleAddNote = async (note: string) => {
    setAddingNote(true);
    try {
      await trpc.crmActivities.create.mutate({ relatedObjectType: "Opportunity", relatedObjectId: id, activityType: "Note", notes: note });
      const actData = await trpc.crmActivities.getForObject.query({ objectType: "Opportunity", objectId: id });
      setActivities(actData);
    } catch (err) { console.error(err); } finally { setAddingNote(false); }
  };

  if (loading) return <div className="p-6"><div className="skeleton h-8 w-48 rounded" /></div>;
  if (!opportunity) return <div className="p-6 text-foreground-muted">Opportunity not found</div>;

  const currentStageIdx = STAGES.indexOf(opportunity.stage);
  const isClosed = ["ClosedWon", "ClosedLost"].includes(opportunity.stage);
  const inputClass = "w-full rounded-lg border border-input-border bg-input-bg px-4 py-2 text-sm text-input-text outline-none transition-colors focus:border-input-borderFocus";

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-3">
        <div className="mb-2 flex items-center gap-1 text-xs text-foreground-muted">
          <a href="/opportunities" className="hover:text-foreground transition-colors">Opportunities</a>
          <span>/</span>
          <span className="text-foreground">{opportunity.name}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-foreground">{opportunity.name}</h1>
            <StatusBadge status={opportunity.stage} size="md" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-semibold text-button-primary-text shadow-card transition-colors hover:bg-button-primary-hover">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {!isClosed && (
              <>
                <button onClick={() => handleStageChange("ClosedWon")} disabled={updatingStage}
                  className="rounded-lg bg-success-50 px-3 py-1.5 text-xs font-medium text-success-700 transition-colors hover:bg-success-100 dark:bg-success-950 dark:text-success-300">Won</button>
                <button onClick={() => handleStageChange("ClosedLost")} disabled={updatingStage}
                  className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-700 transition-colors hover:bg-error-100 dark:bg-error-950 dark:text-error-300">Lost</button>
              </>
            )}
          </div>
        </div>

        {/* Stage stepper */}
        {!isClosed && (
          <div className="mt-3 flex items-center gap-1 overflow-x-auto">
            {STAGES.filter((s) => !["ClosedWon", "ClosedLost"].includes(s)).map((stage, idx) => {
              const isComplete = idx < currentStageIdx;
              const isCurrent = stage === opportunity.stage;
              return (
                <React.Fragment key={stage}>
                  {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-foreground-subtle" />}
                  <button onClick={() => handleStageChange(stage)} disabled={updatingStage}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors ${
                      isCurrent ? "bg-primary-100 text-primary-700 ring-2 ring-primary-300 dark:bg-primary-900 dark:text-primary-300 dark:ring-primary-700" :
                      isComplete ? "bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-300" :
                      "text-foreground-subtle hover:bg-background-secondary"
                    }`}>
                    {stage.replace(/([A-Z])/g, " $1").trim()}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1 pt-3">
          {(["details", "contacts", "activity", "attachments"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab ? "border-b-2 border-primary-accent bg-background text-primary-text" : "text-foreground-muted hover:text-foreground"
              }`}>
              {tab === "details" ? "Details" : tab === "contacts" ? `Contacts (${opportunity.contactRoles.length})` : "Activity"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* DETAILS TAB */}
        {activeTab === "details" && (
          <div className="mx-auto max-w-4xl space-y-4">
            {/* Opportunity fields — horizontal */}
            <div className="rounded-xl border border-card-border bg-card shadow-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background-secondary">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Amount</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Probability</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Close Date</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Source</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Owner</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Team</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2.5 font-medium text-foreground">{opportunity.amount != null ? `$${opportunity.amount.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2.5 text-foreground">{opportunity.probability != null ? `${opportunity.probability}%` : "—"}</td>
                    <td className="px-3 py-2.5 text-foreground">{opportunity.closeDate ?? "—"}</td>
                    <td className="px-3 py-2.5 text-foreground">{opportunity.source ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {opportunity.owner?.picture && <img src={opportunity.owner.picture} className="h-4 w-4 rounded-full" referrerPolicy="no-referrer" alt="" />}
                        <span className="text-foreground">{opportunity.owner?.name ?? opportunity.owner?.email ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{opportunity.team?.name ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Linked interest */}
            {opportunity.linkedInterest && (
              <div className="rounded-xl border border-card-border bg-card shadow-card overflow-x-auto">
                <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-foreground">Source Interest</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background-secondary">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Property Type</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Budget</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Location</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Bedrooms</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Details</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2.5 font-medium text-foreground">{opportunity.linkedInterest.propertyType ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">{opportunity.linkedInterest.budgetMax != null ? `$${opportunity.linkedInterest.budgetMax.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">{opportunity.linkedInterest.locationArea ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">{opportunity.linkedInterest.bedrooms ?? "—"}</td>
                      <td className="px-3 py-2.5 text-foreground-muted">{opportunity.linkedInterest.otherDetail ?? "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={opportunity.linkedInterest.status} /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Primary contact (first contact role) */}
            {opportunity.contactRoles.length > 0 && (
              <div className="rounded-xl border border-card-border bg-card shadow-card overflow-x-auto">
                <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-foreground">Contacts</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background-secondary">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Name</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Email</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Phone</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.contactRoles.map((role) => (
                      <tr key={role.id} className="border-b border-border-subtle hover:bg-background-secondary transition-colors cursor-pointer" onClick={() => navigate(`/contacts/${role.contactId}`)}>
                        <td className="px-3 py-2.5 font-medium text-primary-text hover:underline">{role.contact.firstName} {role.contact.lastName}</td>
                        <td className="px-3 py-2.5 text-foreground-muted">{role.contact.email ?? "—"}</td>
                        <td className="px-3 py-2.5 text-foreground-muted">{role.contact.phone ?? "—"}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={role.roleName} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <CustomFieldsSection entityType="Opportunity" recordId={id} values={opportunity.customFields} canEdit onSaved={fetchData} />
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === "contacts" && (
          <div className="mx-auto max-w-4xl">
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <h2 className="mb-4 text-sm font-semibold text-foreground">Contact Roles ({opportunity.contactRoles.length})</h2>
              {opportunity.contactRoles.length === 0 ? (
                <p className="text-sm text-foreground-muted">No contacts associated</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-background-secondary">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Name</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Email</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Phone</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Title</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground-muted">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunity.contactRoles.map((role) => (
                        <tr key={role.id} className="border-b border-border-subtle hover:bg-background-secondary transition-colors cursor-pointer" onClick={() => navigate(`/contacts/${role.contactId}`)}>
                          <td className="px-3 py-2.5 font-medium text-primary-text">{role.contact.firstName} {role.contact.lastName}</td>
                          <td className="px-3 py-2.5 text-foreground-muted">{role.contact.email ?? "—"}</td>
                          <td className="px-3 py-2.5 text-foreground-muted">{role.contact.phone ?? "—"}</td>
                          <td className="px-3 py-2.5 text-foreground-muted">{role.contact.title ?? "—"}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={role.roleName} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-card-border bg-card shadow-card">
              <div className="flex border-b border-border">
                <button onClick={() => setActivitySubTab("activity")} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activitySubTab === "activity" ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>Activity</button>
                <button onClick={() => setActivitySubTab("history")} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activitySubTab === "history" ? "border-b-2 border-primary-accent text-primary-text" : "text-foreground-muted hover:text-foreground"}`}>History</button>
              </div>
              <div className="p-5">
                {activitySubTab === "activity" ? (
                  <ActivityTimeline activities={activities} onAddNote={handleAddNote} addingNote={addingNote} />
                ) : (
                  <AuditHistory entityType="Opportunity" entityId={id} />
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "attachments" && (
          <div className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
              <AttachmentsPanel parentType="Opportunity" parentId={id} />
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Opportunity" onSubmit={handleEditSave} submitLabel="Save" submitting={editSaving}>
        <FormField label="Name" required>
          <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Amount">
            <input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className={inputClass} placeholder="500000" />
          </FormField>
          <FormField label="Probability (%)">
            <input type="number" min="0" max="100" value={editForm.probability} onChange={(e) => setEditForm({ ...editForm, probability: e.target.value })} className={inputClass} placeholder="50" />
          </FormField>
        </div>
        <FormField label="Close Date">
          <input type="date" value={editForm.closeDate} onChange={(e) => setEditForm({ ...editForm, closeDate: e.target.value })} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} />
        </FormField>
      </FormModal>
    </div>
  );
}
