/**
 * ExecuteDischargeModal — Admin executes discharge for an approved patient.
 * TRD §6.3, V1-§4.4, DECISIONS.md G3 (Re-validates eligibility in same tx).
 */

"use client";

import { useState } from "react";

interface ExecuteDischargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: {
    approvalId: string;
    admissionId: string;
    bedLabel: string;
    wardName: string;
    currentStreak: number;
    approvedByDoctorName: string;
    hoursWaiting: number;
    isStillEligible: boolean;
  } | null;
}

export function ExecuteDischargeModal({
  isOpen,
  onClose,
  onSuccess,
  item,
}: ExecuteDischargeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibilityChanged, setEligibilityChanged] = useState<boolean>(false);

  if (!isOpen || !item) return null;

  const handleExecute = async () => {
    setError(null);
    setEligibilityChanged(false);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/admissions/${item.admissionId}/discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: item.approvalId,
          confirmed: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 409 && errData.code === "ELIGIBILITY_CHANGED") {
          setEligibilityChanged(true);
          setError(
            errData.title ||
              "Patient fever-free streak was broken before discharge execution. Approval voided; doctor re-review required."
          );
          setIsSubmitting(false);
          return;
        }
        throw new Error(errData.title || "Failed to execute discharge");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="execute-modal-title"
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
            🚪
          </div>
          <div>
            <h3 id="execute-modal-title" className="text-lg font-bold text-slate-100">
              Execute Patient Discharge
            </h3>
            <p className="text-xs text-emerald-400 font-medium">
              Bed {item.bedLabel} — Ready for departure & bed release
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {error && (
            <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
              eligibilityChanged
                ? "bg-red-500/20 border-red-500/50 text-red-200"
                : "bg-red-500/15 border-red-500/30 text-red-300"
            }`}>
              {eligibilityChanged && (
                <strong className="block text-sm mb-1 text-red-300">
                  ⚠️ CLINICAL SAFETY BLOCK: Streak Broken
                </strong>
              )}
              {error}
            </div>
          )}

          {/* Details Box */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs space-y-2 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Approved by:</span>
              <span className="font-semibold text-slate-200">{item.approvedByDoctorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Queue wait time:</span>
              <span className="font-mono text-slate-200">{item.hoursWaiting} hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fever-free streak:</span>
              <span className="font-mono font-bold text-emerald-400">{item.currentStreak} days</span>
            </div>
            <div className="pt-2 border-t border-slate-700/60 text-[11px] text-slate-400">
              <strong>Execution Actions:</strong> Closes admission with outcome <code>DISCHARGED_CURED</code> and automatically frees Bed {item.bedLabel} for waiting patients.
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              {eligibilityChanged ? "Close" : "Cancel"}
            </button>
            {!eligibilityChanged && (
              <button
                type="button"
                onClick={handleExecute}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? "Executing..." : "Confirm & Free Bed"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
