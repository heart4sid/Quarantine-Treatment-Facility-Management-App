"use client";

/**
 * Facility Head & Quality Lead Dashboard.
 * TRD §6.7, §8.2, V1-§4.5, V1-§4.6, DECISIONS.md G9
 *
 * Executive real-time command center:
 * - Real-time occupancy & waitlist
 * - Mortality rate vs 85% survival benchmark (rolling 7d/30d)
 * - Shift task completion rates (vitals & visits)
 * - Clinical exceptions audit feed (no-temp doctor visits, temperature amendments)
 * - Shared tablet PIN switch integration
 * - Adaptable Clinical Light & Cyber Dark theme support
 */

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";
import { PinLockModal, useIdleTimer } from "@/components/PinLockModal";
import type { FacilityDashboardData } from "@/server/services/dashboard";

export default function FacilityDashboardPage() {
  const [data, setData] = useState<FacilityDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [mounted, setMounted] = useState<boolean>(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [isIdleLocked, setIsIdleLocked] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 5-minute idle lock
  useIdleTimer(5 * 60 * 1000, () => {
    setIsIdleLocked(true);
    setIsPinModalOpen(true);
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/dashboards/facility");
      if (!res.ok) {
        throw new Error(`Failed to load facility dashboard (HTTP ${res.status})`);
      }
      const json: FacilityDashboardData = await res.json();
      setData(json);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load facility data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/facility" />

      <main className="p-4 sm:p-6 flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto">
        {/* Mortality Alert Banner (Edge-Triggered, TRD §6.7, DECISIONS.md G9) */}
        {data?.mortality.alertActive && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-red-950/40 border border-rose-300 dark:border-red-500/50 shadow-md flex items-start gap-4 animate-in fade-in duration-300">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-red-600/30 border border-rose-300 dark:border-red-500/40 flex items-center justify-center text-rose-700 dark:text-red-300 shrink-0 text-xl font-bold">
              ⚠
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-rose-900 dark:text-red-200">
                  Critical Mortality Threshold Alert Active
                </h3>
                <span className="px-2 py-0.5 rounded bg-rose-200/60 dark:bg-red-500/20 text-rose-800 dark:text-red-300 text-xs font-mono font-semibold border border-rose-300 dark:border-red-500/30">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-rose-800/90 dark:text-red-300/80 mt-1 leading-relaxed">
                {data.mortality.alertReason} Safety benchmark requires ≥85% survival rate (≤15% mortality).
                Review recent deceased cases, clinical staffing levels, and treatment protocols immediately.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-red-950/30 border border-rose-200 dark:border-red-800 text-rose-800 dark:text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={fetchData}
              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Header Bar with Refresh Time */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Facility Command Center & Oversight
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Executive throughput metrics, 15% mortality gate compliance, and shift execution.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-zinc-400">
            <span suppressHydrationWarning>
              {mounted ? `Refreshed ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refreshed --:--"}
            </span>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* 4 Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Facility Capacity */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
              <span>Facility Capacity</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                {data?.capacity.availableBeds ?? 0} beds free
              </span>
            </div>
            <div className="my-3">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                {data?.capacity.occupiedBeds ?? 0}
                <span className="text-sm font-normal text-slate-500 dark:text-zinc-400"> / {data?.capacity.totalActiveBeds ?? 0}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1 flex items-center justify-between">
                <span>Occupancy: {data?.capacity.occupancyPct ?? 0}%</span>
                {data?.capacity.waitlistCount ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold font-mono">
                    {data.capacity.waitlistCount} on waitlist
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-zinc-500 font-mono">Waitlist empty</span>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (data?.capacity.occupancyPct ?? 0) >= 90
                    ? "bg-rose-500"
                    : (data?.capacity.occupancyPct ?? 0) >= 75
                    ? "bg-amber-500"
                    : "bg-sky-500"
                }`}
                style={{ width: `${Math.min(100, data?.capacity.occupancyPct ?? 0)}%` }}
              />
            </div>
          </div>

          {/* Card 2: 7-Day Mortality Rate */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
              <span>7-Day Mortality</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${
                  data?.mortality.rolling7Day.alertShouldFire
                    ? "bg-rose-50 dark:bg-red-950/60 text-rose-700 dark:text-red-300 border border-rose-200 dark:border-red-800"
                    : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                }`}
              >
                {data?.mortality.rolling7Day.alertShouldFire ? "HIGH RISK" : "NORMAL"}
              </span>
            </div>
            <div className="my-3">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                {(((data?.mortality.rolling7Day.rate ?? 0)) * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                {data?.mortality.rolling7Day.deceased ?? 0} deaths /{" "}
                {(data?.mortality.rolling7Day.cured ?? 0) + (data?.mortality.rolling7Day.deceased ?? 0)} outcomes
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-500 flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/80 pt-2">
              <span>Benchmark: ≤15.0%</span>
              <span>30-Day: {(((data?.mortality.rolling30Day.rate ?? 0)) * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Card 3: Task Completion Today */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
              <span>Daily Shift Tasks</span>
              <span className="text-slate-400 dark:text-zinc-500 font-mono text-[11px]">{data?.taskCompletionToday.localDate}</span>
            </div>
            <div className="my-2 flex flex-col gap-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-700 dark:text-zinc-300">Nurse Vitals Coverage</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {data?.taskCompletionToday.temperaturesCompletionPct ?? 0}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${data?.taskCompletionToday.temperaturesCompletionPct ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-700 dark:text-zinc-300">Doctor Visits Coverage</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {data?.taskCompletionToday.doctorVisitsCompletionPct ?? 0}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 rounded-full"
                    style={{ width: `${data?.taskCompletionToday.doctorVisitsCompletionPct ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 border-t border-slate-100 dark:border-zinc-800/80 pt-2 flex justify-between">
              <span>Awaiting Visit: {data?.clinicalStatus.awaitingDoctorVisitCount ?? 0}</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold font-mono">
                {data?.clinicalStatus.feverTodayCount ?? 0} with fever today
              </span>
            </div>
          </div>

          {/* Card 4: Length of Stay & Cured Cohort */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
              <span>Length of Stay (LOS)</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold">
                {data?.clinicalStatus.dischargeEligibleCount ?? 0} Ready
              </span>
            </div>
            <div className="my-3">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                {data?.lengthOfStay.activeInpatientsAvgDays ?? 0}
                <span className="text-sm font-normal text-slate-500 dark:text-zinc-400"> days avg</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Active inpatients average stay
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-500 flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/80 pt-2">
              <span>Discharged Avg: {data?.lengthOfStay.dischargedAvgDays ?? 0}d</span>
              <Link href="/dashboard/discharge-queue" className="text-sky-600 dark:text-indigo-400 font-medium hover:underline">
                View Queue →
              </Link>
            </div>
          </div>
        </div>

        {/* Middle Section: Ward Breakdown & Clinical Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ward Breakdown Cards */}
          <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 flex flex-col gap-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Ward Bed Occupancy Breakdown
              </h2>
              <Link href="/dashboard/beds" className="text-xs text-sky-600 dark:text-indigo-400 font-medium hover:underline">
                Open Bed Grid →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(data?.wardBreakdown ?? []).map((w) => {
                const pct = w.totalBeds > 0 ? Math.round((w.occupiedBeds / w.totalBeds) * 100) : 0;
                return (
                  <div key={w.wardId} className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-slate-800 dark:text-zinc-200">{w.wardName}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        {w.occupiedBeds} occupied / {w.availableBeds} free
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400 mb-1">
                        <span>Utilization</span>
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clinical Readiness & Quality Indicators */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-between gap-4 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
              Quality & Safety Metrics
            </h2>

            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">All-Time Mortality Rate</div>
                  <div className="text-lg font-bold font-mono text-slate-900 dark:text-zinc-100">
                    {(((data?.mortality.allTime.rate ?? 0)) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-zinc-400">
                  <div>{data?.mortality.allTime.deceased ?? 0} deaths</div>
                  <div>{data?.mortality.allTime.cured ?? 0} cured discharges</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">Sample Size Status</div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200 mt-1">
                    {data?.mortality.rolling7Day.hasSufficientSample
                      ? "Statistically Significant (≥10)"
                      : "Insufficient sample size for alert"}
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">Discharge Eligible Inpatients</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {data?.clinicalStatus.dischargeEligibleCount ?? 0} patients (3+ days fever-free)
                  </div>
                </div>
                <Link
                  href="/dashboard/doctor"
                  className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                >
                  Doctor Sign-Off →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Clinical Exception Log (TRD §6.5, §6.8, V1-§4.3, V1-§5.2, V1-§5.9) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 flex flex-col gap-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Clinical Exceptions & Amendments Feed (Past 7 Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Auditable log of doctor visits without temperatures and clinical temperature corrections.
              </p>
            </div>
          </div>

          {(data?.recentExceptions ?? []).length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-zinc-500 text-xs font-mono">
              No clinical exceptions recorded in the past 7 days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 font-mono uppercase text-[11px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Clinician</th>
                    <th className="py-2.5 px-3">Mandatory Reason / Note</th>
                    <th className="py-2.5 px-3 text-right">Logged At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-sans">
                  {data?.recentExceptions.map((ex) => (
                    <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-3 font-mono text-slate-700 dark:text-zinc-300">{ex.localDate}</td>
                      <td className="py-3 px-3">
                        {ex.type === "VISIT_WITHOUT_TEMP" ? (
                          <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 font-mono text-[11px] font-semibold">
                            Visit without Temp (428 Exception)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-sky-50 dark:bg-blue-950/50 text-sky-800 dark:text-blue-300 border border-sky-200 dark:border-blue-800/50 font-mono text-[11px] font-semibold">
                            Temperature Amendment
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-zinc-200">{ex.actorName}</td>
                      <td className="py-3 px-3 text-slate-700 dark:text-zinc-300 max-w-md truncate" title={ex.reason}>
                        {ex.reason}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500 dark:text-zinc-500">
                        {new Date(ex.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Bedside Tablet PIN switch / Idle lock modal */}
      <PinLockModal
        isOpen={isPinModalOpen}
        isIdleLock={isIdleLocked}
        onClose={() => {
          setIsPinModalOpen(false);
          setIsIdleLocked(false);
        }}
        onUserSwitched={(user) => {
          setIsPinModalOpen(false);
          setIsIdleLocked(false);
          void fetchData();
        }}
      />
    </div>
  );
}
