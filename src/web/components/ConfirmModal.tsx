import React, { useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  confirming?: boolean;
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", destructive = false, confirming = false }: ConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="mx-4 w-full max-w-sm animate-scale-in rounded-2xl border border-modal-border bg-modal-background p-6 shadow-modal">
        <div className="mb-4 flex items-center gap-3">
          {destructive && (
            <div className="rounded-full bg-error-50 p-2 dark:bg-error-950">
              <AlertTriangle className="h-5 w-5 text-error-500" />
            </div>
          )}
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <p className="mb-6 text-sm text-foreground-muted">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-button-ghost-bg px-4 py-2 text-sm font-medium text-button-ghost-text transition-colors hover:bg-button-ghost-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              destructive
                ? "bg-button-destructive-bg text-button-destructive-text hover:bg-button-destructive-hover"
                : "bg-button-primary-bg text-button-primary-text hover:bg-button-primary-hover"
            }`}
          >
            {confirming ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
