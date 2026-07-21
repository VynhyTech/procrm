import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
}

export function FormModal({ open, onClose, title, children, onSubmit, submitLabel = "Save", submitting = false }: FormModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="mx-4 w-full max-w-lg animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-foreground-muted transition-colors hover:bg-background-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover"
          >
            Cancel
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSubmit(); }}
            disabled={submitting}
            className="rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover disabled:opacity-50"
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}

export function FormField({ label, children, required }: FormFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-error-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
