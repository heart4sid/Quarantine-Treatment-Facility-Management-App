/**
 * Waitlist Page — Patients Awaiting Bed Placement
 * TRD §6.1, V1-§4.1, V1-§5.6
 *
 * Route: /dashboard/waitlist
 * Access: admin_staff, doctor, facility_head
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";

interface WaitlistEntry {
  id: string;
  priority: number;
  status: string;
  patientRef: string;
  createdAt: string;
  admissionId: string | null;
}

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWaitlist = () => {
    setIsLoading(true);
    fetch("/api/v1/waitlist?status=WAITING&limit=200")
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.data ?? []);
        setError(null);
      })
      .catch(() => setError("Failed to load waitlist"))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchWaitlist();
  }, []);

  function parsePatientRef(ref: string): string {
    return `Patient #${ref.slice(-6).toUpperCase()}`;
  }

  function formatWait(createdAt: string): string {
    const diff = Date.now() - new Date(createdAt).getTime();
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/waitlist" />

      {/* Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Admission Waitlist Queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Patients queued for immediate bed assignment upon discharge or transfer
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-bold font-mono tabular-nums">
              {entries.length} Queued
            </span>
            <button
              onClick={fetchWaitlist}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs cursor-pointer"
              title="Refresh queue"
            >
              <svg className={`size-4 ${isLoading ? "animate-spin text-purple-600 dark:text-purple-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {error ? (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-400 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchWaitlist} className="underline hover:text-red-800 dark:hover:text-red-300">Retry</button>
          </div>
        ) : isLoading && entries.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse shadow-xs" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 px-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 space-y-4">
            <div className="size-12 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-2xl text-slate-500 dark:text-slate-400">
              📋
            </div>
            <div className="space-y-1">
              <p className="text-slate-800 dark:text-slate-300 font-medium text-sm">Waitlist is currently empty</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No patients are waiting. All current intakes have been assigned to isolation beds.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/dashboard/beds"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
              >
                Go to Bed Grid &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300 font-bold font-mono text-sm flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm font-mono">
                      {parsePatientRef(entry.patientRef)}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Wait time: <strong className="text-slate-700 dark:text-slate-300 font-mono tabular-nums">{formatWait(entry.createdAt)}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300">
                    Priority {entry.priority}
                  </span>
                  <Link
                    href={`/dashboard/beds?admitWaitlistId=${entry.id}`}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs transition-colors shadow-xs"
                  >
                    Assign Bed
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
