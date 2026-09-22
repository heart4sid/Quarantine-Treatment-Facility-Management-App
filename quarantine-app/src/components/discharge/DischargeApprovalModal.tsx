/**
 * DischargeApprovalModal — Doctor confirms and signs off discharge approval.
 * TRD §6.3, V1-§4.4, V1-§5.5
 */

"use client";

import { useState } from "react";

interface DischargeApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admission: {
    admissionId: string;
    bedLabel: string;
    wardName: string;
    currentStreak: number;
  } | null;
}

export function DischargeApprovalModal({
  isOpen,
  onClose,
  onSuccess,
  admission,
}: DischargeApprovalModalProps) {
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !admission) return null;

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/admissions/${admission.admissionId}/discharge-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.title || "Failed to approve discharge");
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
        aria-labelledby="approval-modal-title"
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-teal-500/40 p-6 shadow-2xl shadow-teal-950/40 text-slate-100"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 font-bold text-lg">
            ✓
          </div>
          <div>
            <h3 id="approval-modal-title" className="text-lg font-bold text-slate-100">
              Approve Patient for Discharge
            </h3>
            <p className="text-xs text-teal-400 font-medium">
              Bed {admission.bedLabel} — {admission.currentStreak} Fever-Free Days
            </p>
          </div>
        </div>

        <form onSubmit={handleApprove} className="mt-4 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs space-y-1.5 leading-relaxed text-slate-300">
            <p>
              <strong>Clinical Criteria Met:</strong> Patient has achieved {admission.currentStreak} consecutive fever-free calendar days.
            </p>
            <p className="text-slate-400">
              Upon approval, this patient will appear on the <strong>Admin Discharge Queue</strong> for bed release and departure execution.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Doctor Sign-Off Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cleared for discharge, asymptomatic for 72h..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-semibold transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Approving...
                </>
              ) : (
                "Confirm Approval"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
