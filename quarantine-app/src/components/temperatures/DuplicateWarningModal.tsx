/**
 * DuplicateWarningModal — Shown when a nurse attempts to log a second temperature
 * on the same local_date for a patient.
 * TRD §6.6, V1-§4.2, V1-§5.1
 */

"use client";

interface DuplicateWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  existingReading?: {
    valueC?: number;
    recordedAt?: string;
  } | null;
  bedLabel: string;
}

export function DuplicateWarningModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  existingReading,
  bedLabel,
}: DuplicateWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-warning-title"
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-amber-500/40 p-6 shadow-2xl shadow-amber-950/30 text-slate-100"
      >
        {/* Warning Icon & Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 id="duplicate-warning-title" className="text-lg font-bold text-slate-100">
              Temperature Already Logged Today
            </h3>
            <p className="text-xs text-amber-400 font-medium">
              Bed {bedLabel} — Same-Day Re-Entry Warning
            </p>
          </div>
        </div>

        {/* Details Box */}
        <div className="rounded-xl bg-slate-800/80 border border-slate-700/60 p-4 mb-5 text-sm space-y-2">
          <p className="text-slate-300">
            A temperature reading has already been recorded for this patient today.
          </p>
          {existingReading?.valueC && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-700/50">
              <span>Existing reading:</span>
              <span className="font-mono font-bold text-amber-300">
                {existingReading.valueC.toFixed(1)}°C
              </span>
            </div>
          )}
          <p className="text-xs text-slate-400 pt-1">
            <strong>Rule:</strong> Both readings will be preserved in the permanent audit trail.
            If either reading is ≥ 38.0°C, today will be classified as a fever day.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                Logging...
              </>
            ) : (
              "Confirm Re-Entry"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
