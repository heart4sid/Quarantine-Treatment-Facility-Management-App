"use client";

/**
 * Advanced Analytics & Cohort Reporting Dashboard.
 * TRD §11.4, V2-§4.5
 *
 * Features:
 * - Admission cohort breakdown by ISO week
 * - 30-day throughput tracking (admissions, discharges, deaths, transfers)
 * - Overall facility survival rate vs 85% benchmark
 * - One-click audited CSV export
 */

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";
import type { FacilityTrendsData } from "@/server/services/analytics";

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<FacilityTrendsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [days, setDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const fetchTrends = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/analytics/trends?days=${days}`);
      if (!res.ok) {
        throw new Error(`Failed to load analytics trends (HTTP ${res.status})`);
      }
      const json: FacilityTrendsData = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void fetchTrends();
  }, [fetchTrends]);

  const handleExportCsv = () => {
    window.location.href = "/api/v1/exports/outcomes";
  };

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/analytics" />

      {/* Analytics Sub-Toolbar */}
      <div className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Analysis Window:</span>
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 gap-1" role="group" aria-label="Analysis Window Timeframe">
              {[14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                    days === d
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500 hidden md:inline">
              ISO Calendar Admission Grouping
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold transition flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Audited CSV
            </button>
          </div>
        </div>
      </div>

      <main className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto">
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => void fetchTrends()} className="underline hover:text-rose-900 dark:hover:text-rose-200 font-semibold cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {/* Top Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                Overall Cohort Survival Rate
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                ≥85% Benchmark
              </span>
            </div>
            <div className="my-3">
              <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                {loading ? "..." : `${(((data?.overallSurvivalRate ?? 0)) * 100).toFixed(1)}%`}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Facility-wide cured release efficacy
              </p>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (data?.overallSurvivalRate ?? 0) * 100))}%` }}
              />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                Median Length of Stay
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-400 font-mono font-medium">
                LOS Target
              </span>
            </div>
            <div className="my-3">
              <div className="text-3xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {loading ? "..." : data?.medianLosDays ?? 0}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400"> days</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                From admission intake to doctor sign-off
              </p>
            </div>
            <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
              3 fever-free days cured rule enforced
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                Admission Cohorts Tracked
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono font-medium">
                ISO Breakdown
              </span>
            </div>
            <div className="my-3">
              <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">
                {loading ? "..." : data?.cohorts.length ?? 0}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400"> cohort weeks</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Grouped by ISO calendar admission week
              </p>
            </div>
            <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              Real-time epidemiological trend analysis
            </div>
          </div>
        </div>

        {/* Admission Cohorts Table (TRD §11.4) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 flex flex-col gap-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200">
                Admission Cohorts Breakdown (ISO Weeks)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Outcomes, discharge rates, and length of stay by patient admission week.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/70">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 font-mono uppercase text-[11px]">
                  <th className="py-3 px-4">ISO Week</th>
                  <th className="py-3 px-4">Admitted</th>
                  <th className="py-3 px-4">Discharged Cured</th>
                  <th className="py-3 px-4">Deceased</th>
                  <th className="py-3 px-4">Transferred</th>
                  <th className="py-3 px-4">Still Active</th>
                  <th className="py-3 px-4">Avg LOS</th>
                  <th className="py-3 px-4 text-right">Survival Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500 font-mono text-xs">
                      Loading cohort data...
                    </td>
                  </tr>
                ) : (data?.cohorts ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500 font-mono text-xs">
                      No cohort data recorded yet.
                    </td>
                  </tr>
                ) : (
                  data?.cohorts.map((c) => (
                    <tr key={c.isoWeek} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-200">{c.isoWeek}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 font-semibold">{c.totalAdmitted}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">{c.cured}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-rose-600 dark:text-rose-400">{c.deceased}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">{c.transferred}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">{c.stillActive}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">{c.avgLosDays}d</td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs inline-block ${
                            c.survivalRate >= 0.85
                              ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
                              : "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80"
                          }`}
                        >
                          {(c.survivalRate * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Throughput Timeline Table */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 flex flex-col gap-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200">
                Daily Clinical Throughput ({days} Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rolling daily movement across patient admission, cure, transfer, and mortality states.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/70 max-h-72">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-mono uppercase text-[11px] sticky top-0 bg-slate-50/95 dark:bg-slate-950/90 backdrop-blur-sm">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Admissions</th>
                  <th className="py-3 px-4">Cured Discharges</th>
                  <th className="py-3 px-4">Deceased</th>
                  <th className="py-3 px-4">Transferred</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-mono text-xs">
                      Loading throughput records...
                    </td>
                  </tr>
                ) : (data?.throughput ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-mono text-xs">
                      No throughput records in the selected window.
                    </td>
                  </tr>
                ) : (
                  (data?.throughput ?? []).slice().reverse().map((t) => (
                    <tr key={t.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 text-slate-800 dark:text-slate-300 font-semibold">{t.date}</td>
                      <td className="py-2.5 px-4 text-indigo-600 dark:text-indigo-400 font-semibold tabular-nums">{t.admissions}</td>
                      <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{t.discharges}</td>
                      <td className="py-2.5 px-4 text-rose-600 dark:text-rose-400 tabular-nums">{t.deaths}</td>
                      <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 tabular-nums">{t.transfers}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

