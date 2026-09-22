/**
 * Nurse Station — Daily Temperature Rounds & Task List.
 * TRD §8.2, V1-§4.2, V1-§6 (Usability: minimal taps, bedside tablet layout)
 *
 * Route: /dashboard/nurse
 * Access: nurse, doctor, admin_staff, facility_head
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";
import { LogTemperatureModal } from "@/components/temperatures/LogTemperatureModal";
import { AmendTemperatureModal } from "@/components/temperatures/AmendTemperatureModal";

interface TaskItem {
  admissionId: string;
  patientId: string;
  patientNameEnc: string;
  mrn: string | null;
  bedId: string;
  bedLabel: string;
  wardId: string;
  wardName: string;
  admittedAt: string;
  measuredToday: boolean;
  latestReadingToday: {
    id: string;
    valueC: number;
    isFever: boolean;
    recordedAt: string;
  } | null;
  currentStreak: number;
  isDischargeEligible: boolean;
  dischargeEligibleSince: string | null;
}

interface TasksResponse {
  date: string;
  stats: {
    total: number;
    measuredCount: number;
    pendingCount: number;
    completionRate: number;
  };
  tasks: TaskItem[];
}

export default function NurseTasksPage() {
  const [data, setData] = useState<TasksResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "measured" | "eligible">("pending");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [selectedAdmission, setSelectedAdmission] = useState<{
    admissionId: string;
    bedLabel: string;
    wardName: string;
    currentStreak?: number;
  } | null>(null);
  const [showLogModal, setShowLogModal] = useState<boolean>(false);

  const [selectedReadingForAmend, setSelectedReadingForAmend] = useState<{
    id: string;
    admissionId: string;
    bedLabel: string;
    valueC: number;
    localDate: string;
    recordedAt?: string;
  } | null>(null);
  const [showAmendModal, setShowAmendModal] = useState<boolean>(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/tasks/nurse");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TasksResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError("Failed to load daily rounds. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const timer = setInterval(fetchTasks, 20_000); // Poll every 20s
    return () => clearInterval(timer);
  }, [fetchTasks]);

  const handleOpenLog = (task: TaskItem) => {
    setSelectedAdmission({
      admissionId: task.admissionId,
      bedLabel: task.bedLabel,
      wardName: task.wardName,
      currentStreak: task.currentStreak,
    });
    setShowLogModal(true);
  };

  const handleOpenAmend = (task: TaskItem) => {
    if (!task.latestReadingToday) return;
    setSelectedReadingForAmend({
      id: task.latestReadingToday.id,
      admissionId: task.admissionId,
      bedLabel: task.bedLabel,
      valueC: task.latestReadingToday.valueC,
      localDate: data?.date || new Date().toISOString().slice(0, 10),
      recordedAt: task.latestReadingToday.recordedAt,
    });
    setShowAmendModal(true);
  };

  const filteredTasks = (data?.tasks || []).filter((task) => {
    if (filter === "pending") return !task.measuredToday;
    if (filter === "measured") return task.measuredToday;
    if (filter === "eligible") return task.isDischargeEligible;
    return true;
  });

  const completionPct = Math.round((data?.stats.completionRate || 0) * 100);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/nurse" />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchTasks} className="underline hover:text-red-800 dark:hover:text-red-200">Retry</button>
          </div>
        )}

        {/* Shift Completion Ribbon */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Patients</span>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">{data?.stats.total ?? 0}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>

          {/* Measured Today */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Measured Today</span>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                {data?.stats.measuredCount ?? 0}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">({completionPct}%)</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
              ✓
            </div>
          </div>

          {/* Pending Measurement */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pending Measurement</span>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">{data?.stats.pendingCount ?? 0}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
            </div>
          </div>

          {/* Discharge Eligible */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">Discharge Eligible</span>
              <p className="text-2xl font-black text-teal-600 dark:text-teal-400 font-mono mt-0.5">
                {(data?.tasks || []).filter((t) => t.isDischargeEligible).length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold">
              3d+
            </div>
          </div>
        </div>

        {/* Filter Controls & Progress */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs w-fit">
            <button
              onClick={() => setFilter("pending")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "pending"
                  ? "bg-amber-500 text-white dark:text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Needs Reading ({data?.stats.pendingCount ?? 0})
            </button>
            <button
              onClick={() => setFilter("measured")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "measured"
                  ? "bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-md shadow-emerald-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Measured Today ({data?.stats.measuredCount ?? 0})
            </button>
            <button
              onClick={() => setFilter("eligible")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "eligible"
                  ? "bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md shadow-teal-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Eligible ({((data?.tasks || []).filter((t) => t.isDischargeEligible)).length})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-slate-800 dark:bg-slate-700 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              All ({data?.stats.total ?? 0})
            </button>
          </div>

          {/* Rounds Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Shift Progress:</span>
            <div className="w-36 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">{completionPct}%</span>
          </div>
        </div>

        {/* Patient Card Task Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.length === 0 ? (
            <div className="col-span-full py-16 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40">
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {filter === "pending"
                  ? "🎉 All patients have been measured for today!"
                  : "No patients match this filter."}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.admissionId}
                className={`
                  rounded-2xl border p-4 transition-all duration-150 flex flex-col justify-between shadow-xs
                  ${!task.measuredToday
                    ? "bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500/40"
                    : task.latestReadingToday?.isFever
                    ? "bg-rose-50/70 dark:bg-red-950/15 border-rose-200 dark:border-red-500/30 hover:border-rose-400 dark:hover:border-red-500/50"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700"
                  }
                `}
              >
                {/* Bed & Ward Header */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-black font-mono text-slate-900 dark:text-slate-100 tracking-tight">
                      {task.bedLabel}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700/60">
                      {task.wardName}
                    </span>
                  </div>

                  {/* Measurement Status Badge */}
                  <div className="mb-3">
                    {!task.measuredToday ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/25">
                        <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
                        Needs Measurement Today
                      </span>
                    ) : task.latestReadingToday?.isFever ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 dark:bg-red-500/20 text-rose-700 dark:text-red-400 border border-rose-200 dark:border-red-500/30">
                        🔥 Fever: {task.latestReadingToday.valueC.toFixed(1)}°C
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        ✓ {task.latestReadingToday?.valueC.toFixed(1)}°C (Normal)
                      </span>
                    )}
                  </div>

                  {/* Fever-Free Streak Indicator */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs mb-4">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Fever-Free Streak:</span>
                    {task.isDischargeEligible ? (
                      <span className="inline-flex items-center gap-1 font-bold text-teal-700 dark:text-teal-300 font-mono bg-teal-100 dark:bg-teal-500/20 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-500/30 animate-pulse">
                        🔥 {task.currentStreak}d (Eligible)
                      </span>
                    ) : task.currentStreak > 0 ? (
                      <span className="font-bold text-sky-700 dark:text-blue-400 font-mono">
                        🔥 {task.currentStreak} / 3 days
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 font-mono font-medium">
                        0 days (reset)
                      </span>
                    )}
                  </div>
                </div>

                {/* Tablet Action Buttons */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenLog(task)}
                    className={`
                      flex-1 py-3 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer
                      ${!task.measuredToday
                        ? "bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 shadow-teal-500/20"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                      }
                    `}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {!task.measuredToday ? "Log Temperature" : "Add Reading"}
                  </button>

                  {task.measuredToday && (
                    <button
                      type="button"
                      onClick={() => handleOpenAmend(task)}
                      className="py-3 px-3 rounded-xl font-semibold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700/60 transition-colors cursor-pointer"
                      title="Amend or correct reading"
                    >
                      Amend
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Temperature Logging Modal */}
      <LogTemperatureModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        onSuccess={() => {
          fetchTasks();
        }}
        admission={selectedAdmission}
      />

      {/* Temperature Amendment Modal */}
      <AmendTemperatureModal
        isOpen={showAmendModal}
        onClose={() => setShowAmendModal(false)}
        onSuccess={() => {
          fetchTasks();
        }}
        reading={selectedReadingForAmend}
        userRole="nurse"
      />
    </div>
  );
}
