/**
 * RecordOutcomeModal — Doctor records clinical outcome (DECEASED or TRANSFERRED).
 * TRD §6.7, V1-§4.5, DECISIONS.md G5 (Doctor only).
 */

"use client";

import { useState } from "react";

interface RecordOutcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admission: {
    admissionId: string;
    bedLabel: string;
    wardName: string;
  } | null;
}

export function RecordOutcomeModal({
  isOpen,
  onClose,
  onSuccess,
  admission,
}: RecordOutcomeModalProps) {
  const [outcome, setOutcome] = useState<"DECEASED" | "TRANSFERRED">("TRANSFERRED");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !admission) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/admissions/${admission.admissionId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.title || "Failed to record outcome");
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
        aria-labelledby="outcome-modal-title"
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold">
            ⚕
          </div>
          <div>
            <h3 id="outcome-modal-title" className="text-lg font-bold text-slate-100">
              Record Patient Clinical Outcome
            </h3>
            <p className="text-xs text-slate-400">
              Bed {admission.bedLabel} — Closes admission & frees bed
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Outcome Determination (Doctor Only)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOutcome("TRANSFERRED")}
                className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  outcome === "TRANSFERRED"
                    ? "bg-blue-500/20 border-blue-500 text-blue-300 shadow-sm"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="block text-sm mb-0.5">Transferred</span>
                <span className="font-normal text-[10px] text-slate-400">Higher level care / ICU</span>
              </button>

              <button
                type="button"
                onClick={() => setOutcome("DECEASED")}
                className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  outcome === "DECEASED"
                    ? "bg-red-500/20 border-red-500 text-red-300 shadow-sm"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="block text-sm mb-0.5">Deceased</span>
                <span className="font-normal text-[10px] text-slate-400">Feeds mortality rate</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Clinical Summary / Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide clinical details for transfer destination or mortality audit..."
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
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-white text-slate-950 text-sm font-semibold transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? "Recording..." : "Record Outcome"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
