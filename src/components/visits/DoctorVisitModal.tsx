/**
 * DoctorVisitModal — Dialog for recording a doctor clinical review visit.
 * TRD §6.5, V1-§4.3, V1-§5.2 (428 TEMP_MISSING_TODAY exception handling)
 */

"use client";

import { useState } from "react";

interface DoctorVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admission: {
    admissionId: string;
    bedLabel: string;
    wardName: string;
    measuredToday: boolean;
    currentStreak?: number;
    latestReadingToday?: {
      valueC: number;
      isFever: boolean;
    } | null;
  } | null;
}

export function DoctorVisitModal({
  isOpen,
  onClose,
  onSuccess,
  admission,
}: DoctorVisitModalProps) {
  const [notes, setNotes] = useState<string>("");
  const [noTempException, setNoTempException] = useState<boolean>(false);
  const [exceptionReason, setExceptionReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !admission) return null;

  const isMissingTemp = !admission.measuredToday;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isMissingTemp && !noTempException) {
      setError(
        "No temperature recorded today for this patient. Please recommend nurse measurement first, or check 'Proceed without vitals' and provide a mandatory clinical reason."
      );
      return;
    }

    if (noTempException && exceptionReason.trim().length < 10) {
      setError("Please provide an exception reason with at least 10 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const clientUuid = crypto.randomUUID();
      const res = await fetch(`/api/v1/admissions/${admission.admissionId}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || undefined,
          noTempException,
          exceptionReason: noTempException ? exceptionReason.trim() : undefined,
          clientUuid,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 428) {
          setError(
            errData.title ||
              "No temperature recorded today. Please check 'Proceed without vitals' with an exception reason if clinically urgent."
          );
          setIsSubmitting(false);
          return;
        }
        throw new Error(errData.title || "Failed to record visit");
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
        aria-labelledby="visit-modal-title"
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
              Doctor Clinical Review
            </span>
            <h3 id="visit-modal-title" className="text-xl font-bold text-slate-100 flex items-center gap-2">
              Bed {admission.bedLabel}
              <span className="text-xs font-normal text-slate-400">({admission.wardName})</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 leading-relaxed">
              {error}
            </div>
          )}

          {/* Vitals & Streak Snapshot */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Today's Vitals:</span>
              {admission.measuredToday && admission.latestReadingToday ? (
                <span className={`font-mono font-bold text-sm ${admission.latestReadingToday.isFever ? "text-red-400" : "text-emerald-400"}`}>
                  {admission.latestReadingToday.valueC.toFixed(1)}°C {admission.latestReadingToday.isFever ? "(Fever)" : "(Normal)"}
                </span>
              ) : (
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Not yet measured today
                </span>
              )}
            </div>

            <div className="text-right">
              <span className="text-slate-400 block mb-0.5">Fever-Free Streak:</span>
              <span className="font-mono font-bold text-sm text-teal-300">
                {admission.currentStreak ?? 0} / 3 days
              </span>
            </div>
          </div>

          {/* Missing Temperature Warning / Exception Block (V1-§4.3, V1-§5.2) */}
          {isMissingTemp && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-xs text-amber-300 leading-relaxed">
                  <strong>Clinical Best Practice Warning:</strong> No temperature has been recorded today for this patient.
                  Recommend nurse measurement first to avoid clinical time waste.
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                <input
                  type="checkbox"
                  id="exception-check"
                  checked={noTempException}
                  onChange={(e) => setNoTempException(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-500/40 bg-slate-800 text-amber-500 focus:ring-amber-500/30"
                />
                <label htmlFor="exception-check" className="text-xs font-semibold text-slate-200 cursor-pointer">
                  Proceed with urgent visit anyway (logged as clinical exception)
                </label>
              </div>

              {noTempException && (
                <div>
                  <label className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider mb-1">
                    Mandatory Exception Reason (Min 10 chars)
                  </label>
                  <textarea
                    rows={2}
                    value={exceptionReason}
                    onChange={(e) => setExceptionReason(e.target.value)}
                    placeholder="e.g. Acute clinical distress requiring urgent medical examination..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-amber-500/40 text-slate-100 text-xs focus:border-amber-400 outline-none resize-none"
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Clinical Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Doctor's Examination & Treatment Notes
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record clinical findings, lung sounds, treatment modifications, general condition..."
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none resize-none"
            />
          </div>

          {/* Actions */}
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
                  Recording Visit...
                </>
              ) : (
                "Record Clinical Visit"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
