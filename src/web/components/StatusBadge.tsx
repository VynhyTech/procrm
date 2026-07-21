import React from "react";

const STATUS_STYLES: Record<string, string> = {
  // Lead statuses
  New: "bg-info-50 dark:bg-info-950 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800",

  // Contact lifecycle / engagement / type
  Prospect: "bg-info-50 dark:bg-info-950 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800",
  Customer: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  Active: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  Inactive: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600",
  Individual: "bg-info-50 dark:bg-info-950 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800",
  Developer: "bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-800",
  Investor: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  Working: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  Qualified: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  Disqualified: "bg-error-50 dark:bg-error-950 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
  Converted: "bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-800",
  Merged: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600",

  // Opportunity stages
  LeadQualified: "bg-info-50 dark:bg-info-950 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800",
  InitialDiscussion: "bg-info-50 dark:bg-info-950 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800",
  PropertyShared: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  SiteVisitScheduled: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  SiteVisitCompleted: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  Interested: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  Negotiation: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  BookingIntent: "bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-800",
  AgreementDrafted: "bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-800",
  AgreementSigned: "bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-800",
  ClosedWon: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  ClosedLost: "bg-error-50 dark:bg-error-950 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",

  // Task statuses
  Open: "bg-info-50 dark:bg-info-950 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800",
  InProgress: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  Completed: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  Cancelled: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600",

  // Task priorities
  Low: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600",
  Medium: "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300 border-warning-200 dark:border-warning-800",
  High: "bg-error-50 dark:bg-error-950 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",

  // Tenant statuses
  active: "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
  suspended: "bg-error-50 dark:bg-error-950 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
  inactive: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600",
};

const STAGE_LABELS: Record<string, string> = {
  LeadQualified: "Lead Qualified",
  InitialDiscussion: "Initial Discussion",
  PropertyShared: "Property Shared",
  SiteVisitScheduled: "Site Visit Scheduled",
  SiteVisitCompleted: "Site Visit Completed",
  Interested: "Interested",
  Negotiation: "Negotiation",
  BookingIntent: "Booking Intent",
  AgreementDrafted: "Agreement Drafted",
  AgreementSigned: "Agreement Signed",
  ClosedWon: "Closed Won",
  ClosedLost: "Closed Lost",
  InProgress: "In Progress",
  Merged: "Merged",
};

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600";
  const label = STAGE_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${style} ${
        size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      {label}
    </span>
  );
}
