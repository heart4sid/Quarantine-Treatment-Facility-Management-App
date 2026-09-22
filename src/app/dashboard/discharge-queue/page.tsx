/**
 * Admin Discharge Queue — Approved patients awaiting departure and bed release.
 * TRD §6.3, §8.2, V1-§4.4, V1-§4.6
 *
 * Route: /dashboard/discharge-queue
 * Access: admin_staff, doctor, facility_head
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";
import { ExecuteDischargeModal } from "@/components/discharge/ExecuteDischargeModal";

interface DischargeQueueItem {
  approvalId: string;
  admissionId: string;
  patientId: string;
  patientNameEnc: string;
  mrn: string | null;
  bedId: string;
  bedLabel: string;
  wardId: string;
  wardName: string;
  admittedAt: string;
  approvedAt: string;
  approvedByDoctorName: string;
  currentStreak: number;
  isStillEligible: boolean;
  hoursWaiting: number;
}

export default function DischargeQueuePage() {
  const [queue, setQueue] = useState<DischargeQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<DischargeQueueItem | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState<boolean>(false);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/discharge-queue");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setQueue(json.data || []);
      setError(null);
    } catch (err) {
      setError("Failed to load discharge queue. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const timer = setInterval(fetchQueue, 15_000);
    return () => clearInterval(timer);
  }, [fetchQueue]);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/discharge-queue" />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchQueue} className="underline hover:text-red-800 dark:hover:text-red-200">Retry</button>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Awaiting Departure</span>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">{queue.length}</p>
            </div>
            <div className="size-12 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold text-xl">
              🚪
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Target Turnover</span>
              <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1">&lt; 4 hrs</p>
            </div>
            <div className="size-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xl">
              ⚡
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bed Release Action</span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">Free on Execution</p>
            </div>
            <div className="size-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl">
              🛏️
            </div>
          </div>
        </div>

        {/* Queue List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Approved Patients Ready for Departure ({queue.length})
            </h2>
            <button
              onClick={() => {
                setIsLoading(true);
                fetchQueue();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs cursor-pointer"
              title="Refresh queue"
            >
              <svg className={`size-3.5 ${isLoading ? "animate-spin text-teal-600 dark:text-teal-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>

          {queue.length === 0 ? (
            <div className="py-16 px-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 space-y-4">
              <div className="size-12 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-2xl text-slate-500 dark:text-slate-400">
                🚪
              </div>
              <div className="space-y-1">
                <p className="text-slate-800 dark:text-slate-300 font-medium text-sm">
                  Discharge queue is currently clear
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Patients will appear here automatically when a doctor approves discharge after completing the 3-day fever-free streak.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link
                  href="/dashboard/doctor"
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Review Doctor Rounds &rarr;
                </Link>
                <Link
                  href="/dashboard/beds"
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-800 transition-colors shadow-xs"
                >
                  View Bed Grid
                </Link>
              </div>
            </div>
          ) : (
            queue.map((item) => (
              <div
                key={item.approvalId}
                className={`
                  p-5 rounded-2xl border transition-all duration-150 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs
                  ${!item.isStillEligible
                    ? "bg-rose-50/70 dark:bg-red-950/20 border-rose-200 dark:border-red-500/40"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500/40"
                  }
                `}
              >
                {/* Bed & Patient Info */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Bed</span>
                    <span className="text-base font-black font-mono text-slate-900 dark:text-slate-100">{item.bedLabel}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {item.wardName}
                      </span>
                      {item.isStillEligible ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                          ✓ Clinical Criteria Confirmed ({item.currentStreak}d Streak)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-red-500/20 text-rose-700 dark:text-red-400 border border-rose-200 dark:border-red-500/40 animate-pulse">
                          ⚠️ Streak Broken — Relapse Flagged
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Approved by: <strong className="text-slate-800 dark:text-slate-200">{item.approvedByDoctorName}</strong></span>
                      <span>·</span>
                      <span>Queue wait: <strong className="text-slate-800 dark:text-slate-200">{item.hoursWaiting}h</strong></span>
                      <span>·</span>
                      <span>Admitted: {new Date(item.admittedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Execution Button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(item);
                    setShowExecuteModal(true);
                  }}
                  className={`
                    px-5 py-3 rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer
                    ${!item.isStillEligible
                      ? "bg-rose-100 hover:bg-rose-200 dark:bg-red-500/20 dark:hover:bg-red-500/30 text-rose-700 dark:text-red-300 border border-rose-200 dark:border-red-500/40"
                      : "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 shadow-emerald-500/20"
                    }
                  `}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {item.isStillEligible ? "Execute Discharge & Free Bed" : "Review Relapse"}
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Execute Modal */}
      <ExecuteDischargeModal
        isOpen={showExecuteModal}
        onClose={() => setShowExecuteModal(false)}
        onSuccess={() => fetchQueue()}
        item={selectedItem}
      />
    </div>
  );
}
