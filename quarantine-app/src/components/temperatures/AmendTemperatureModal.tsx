/**
 * AmendTemperatureModal — Dialog for amending or voiding a temperature reading.
 * TRD §6.8, §7.2, V1-§5.9, DECISIONS.md G10
 *
 * Immutability rule: Never modifies rows directly; appends a new amendment row.
 * Nurse: own reading only, same day only, cannot void.
 * Doctor: any reading, can void (valueC = null).
 */

"use client";

import { useState } from "react";

interface AmendTemperatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  reading: {
    id: string;
    admissionId: string;
    bedLabel: string;
    valueC: number;
    localDate: string;
    recordedAt?: string;
  } | null;
  userRole?: string; // "nurse" | "doctor"
}

export function AmendTemperatureModal({
  isOpen,
  onClose,
  onSuccess,
  reading,
  userRole = "nurse",
}: AmendTemperatureModalProps) {
  const [newValueC, setNewValueC] = useState<string>(
    reading ? reading.valueC.toFixed(1) : "37.0"
  );
  const [isVoid, setIsVoid] = useState<boolean>(false);
  const [reasonCode, setReasonCode] = useState<string>("DATA_ENTRY_ERROR");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !reading) return null;

  const isDoctor = userRole === "doctor";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (reasonCode === "OTHER" && reasonNote.trim().length < 10) {
      setError("Please provide a reason note with at least 10 characters.");
      return;
    }

    const parsedVal = isVoid ? null : parseFloat(newValueC);
    if (!isVoid && (isNaN(parsedVal as number) || (parsedVal as number) < 30 || (parsedVal as number) > 45)) {
      setError("Please enter a valid temperature between 30.0°C and 45.0°C.");
      return;
    }

    setIsSubmitting(true);

    try {
      const clientUuid = crypto.randomUUID();
      const res = await fetch(`/api/v1/temperatures/${reading.id}/amendments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valueC: isVoid ? null : parsedVal,
          reasonCode,
          reasonNote: reasonCode === "OTHER" ? reasonNote.trim() : undefined,
          clientUuid,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.title || "Failed to submit amendment");
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
        aria-labelledby="amend-modal-title"
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 id="amend-modal-title" className="text-lg font-bold text-slate-100">
              Amend Temperature Reading
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Bed {reading.bedLabel} — Reading from {reading.localDate}
            </p>
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
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Original Reading Snapshot */}
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-xs">
            <span className="text-slate-400">Current recorded value:</span>
            <span className="font-mono font-bold text-slate-200 text-sm">
              {reading.valueC.toFixed(1)}°C
            </span>
          </div>

          {/* Void option (Doctor only) */}
          {isDoctor && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <input
                type="checkbox"
                id="void-check"
                checked={isVoid}
                onChange={(e) => setIsVoid(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-500 focus:ring-teal-500/30"
              />
              <label htmlFor="void-check" className="text-xs text-slate-300 cursor-pointer">
                <strong>Void this reading</strong> (removes reading entirely from clinical streak calculations)
              </label>
            </div>
          )}

          {/* New Value Input (if not voided) */}
          {!isVoid && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Corrected Temperature (°C)
              </label>
              <input
                type="number"
                step="0.1"
                min="30.0"
                max="45.0"
                value={newValueC}
                onChange={(e) => setNewValueC(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-mono text-base focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                required
              />
            </div>
          )}

          {/* Reason Code Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Reason for Amendment (Required)
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
            >
              <option value="DATA_ENTRY_ERROR">Data Entry Error (Typo)</option>
              <option value="DEVICE_CALIBRATION">Device Calibration Issue</option>
              <option value="WRONG_PATIENT">Reading Attributed to Wrong Patient</option>
              <option value="DUPLICATE">Accidental Duplicate Reading</option>
              <option value="OTHER">Other (Free text note required)</option>
            </select>
          </div>

          {/* Reason Note (Required if OTHER) */}
          {reasonCode === "OTHER" && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Explanation (Min 10 characters)
              </label>
              <textarea
                rows={3}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Describe the clinical rationale for amending this record..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none resize-none"
                required
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
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
                  Saving...
                </>
              ) : (
                "Save Amendment"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
