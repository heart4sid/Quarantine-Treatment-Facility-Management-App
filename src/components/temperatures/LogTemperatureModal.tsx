/**
 * LogTemperatureModal — Bedside tablet optimized temperature entry interface.
 * TRD §6.6, §7.1, V1-§4.2, V1-§6 (Usability: minimal taps, bedside tablet layout)
 */

"use client";

import { useState } from "react";
import { DuplicateWarningModal } from "./DuplicateWarningModal";

interface LogTemperatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admission: {
    admissionId: string;
    bedLabel: string;
    wardName: string;
    currentStreak?: number;
  } | null;
}

const QUICK_PRESETS = [36.5, 36.8, 37.0, 37.2, 37.5, 38.0, 38.5, 39.0];

export function LogTemperatureModal({
  isOpen,
  onClose,
  onSuccess,
  admission,
}: LogTemperatureModalProps) {
  const [temperature, setTemperature] = useState<number>(37.0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicate warning state
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [existingReadingData, setExistingReadingData] = useState<{
    valueC?: number;
    recordedAt?: string;
  } | null>(null);

  if (!isOpen || !admission) return null;

  const isFever = temperature >= 38.0;

  const adjustTemp = (delta: number) => {
    setTemperature((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      return Math.min(43.0, Math.max(34.0, next));
    });
  };

  const handleLog = async (confirmedDuplicate = false) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const clientUuid = crypto.randomUUID();
      const res = await fetch(`/api/v1/admissions/${admission.admissionId}/temperatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valueC: temperature,
          clientUuid,
          clientRecordedAt: new Date().toISOString(),
          confirmedDuplicate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 409 && errData.code === "DUPLICATE_TODAY") {
          // Trigger duplicate warning modal
          setExistingReadingData(errData.details);
          setShowDuplicateModal(true);
          setIsSubmitting(false);
          return;
        }
        throw new Error(errData.message || errData.title || "Failed to log temperature");
      }

      setShowDuplicateModal(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-temp-title"
          className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                Bedside Vitals Entry
              </span>
              <h3 id="log-temp-title" className="text-xl font-bold text-slate-100 flex items-center gap-2">
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

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Large Touch-Friendly Value Display */}
          <div className="my-6 text-center">
            <div className="inline-flex items-baseline justify-center gap-1 font-mono">
              <span className={`text-6xl font-black tracking-tight ${isFever ? "text-red-400" : "text-emerald-400"}`}>
                {temperature.toFixed(1)}
              </span>
              <span className="text-2xl font-bold text-slate-400">°C</span>
            </div>

            {/* Fever Status Pill */}
            <div className="mt-3 flex justify-center">
              {isFever ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                  🔥 FEVER (≥ 38.0°C) — Streak will reset to 0
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓ NORMAL (&lt; 38.0°C) — Streak continues
                </span>
              )}
            </div>
          </div>

          {/* Stepper Buttons (-0.5, -0.1, +0.1, +0.5) */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <button
              type="button"
              onClick={() => adjustTemp(-0.5)}
              className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 font-mono text-sm font-bold text-slate-300 transition-colors"
            >
              -0.5
            </button>
            <button
              type="button"
              onClick={() => adjustTemp(-0.1)}
              className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 font-mono text-sm font-bold text-slate-300 transition-colors"
            >
              -0.1
            </button>
            <button
              type="button"
              onClick={() => adjustTemp(0.1)}
              className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 font-mono text-sm font-bold text-slate-300 transition-colors"
            >
              +0.1
            </button>
            <button
              type="button"
              onClick={() => adjustTemp(0.5)}
              className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 font-mono text-sm font-bold text-slate-300 transition-colors"
            >
              +0.5
            </button>
          </div>

          {/* Quick Presets (Single-Tap) */}
          <div className="mb-6">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Quick Preset (Single-Tap)
            </span>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_PRESETS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTemperature(val)}
                  className={`
                    py-2 rounded-lg font-mono text-xs font-semibold border transition-all
                    ${temperature === val
                      ? "bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-sm"
                      : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }
                  `}
                >
                  {val.toFixed(1)}°
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => handleLog(false)}
            disabled={isSubmitting}
            className={`
              w-full py-4 rounded-xl text-base font-bold transition-all shadow-xl flex items-center justify-center gap-2
              ${isFever
                ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/20"
                : "bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-teal-500/20"
              }
              disabled:opacity-50
            `}
          >
            {isSubmitting ? (
              <>
                <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Recording Reading...
              </>
            ) : (
              `Log ${temperature.toFixed(1)}°C to Bed ${admission.bedLabel}`
            )}
          </button>
        </div>
      </div>

      {/* Duplicate Warning Modal */}
      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        bedLabel={admission.bedLabel}
        existingReading={existingReadingData}
        isSubmitting={isSubmitting}
        onClose={() => setShowDuplicateModal(false)}
        onConfirm={() => handleLog(true)}
      />
    </>
  );
}
