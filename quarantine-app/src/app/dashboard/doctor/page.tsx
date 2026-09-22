/**
 * Doctor Station — Priority-sorted clinical rounds, visit logging, and discharge sign-off.
 * TRD §8.2, V1-§4.3, V1-§4.4, V1-§5.2
 *
 * Route: /dashboard/doctor
 * Access: doctor, facility_head, admin_staff
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";
import { DoctorVisitModal } from "@/components/visits/DoctorVisitModal";
import { DischargeApprovalModal } from "@/components/discharge/DischargeApprovalModal";
import { RecordOutcomeModal } from "@/components/discharge/RecordOutcomeModal";

interface DoctorTaskItem {
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
  hasActiveApproval: boolean;
  approvalId: string | null;
  visitedToday: boolean;
  latestVisitToday: {
    id: string;
    startedAt: string;
    doctorName?: string;
    notes?: string | null;
    noTempException: boolean;
  } | null;
  priority: "DISCHARGE_ELIGIBLE" | "FEVER_TODAY" | "NEEDS_VISIT" | "WAITING_VITALS" | "VISITED_TODAY";
  priorityScore: number;
}

interface DoctorTasksResponse {
  date: string;
  stats: {
    total: number;
    visitedCount: number;
    pendingCount: number;
    eligibleCount: number;
    feverCount: number;
  };
  tasks: DoctorTaskItem[];
}

export default function DoctorRoundsPage() {
  const [data, setData] = useState<DoctorTasksResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "eligible" | "fever">("pending");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal selections
  const [selectedForVisit, setSelectedForVisit] = useState<DoctorTaskItem | null>(null);
  const [showVisitModal, setShowVisitModal] = useState<boolean>(false);

  const [selectedForApproval, setSelectedForApproval] = useState<DoctorTaskItem | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState<boolean>(false);

  const [selectedForOutcome, setSelectedForOutcome] = useState<DoctorTaskItem | null>(null);
  const [showOutcomeModal, setShowOutcomeModal] = useState<boolean>(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/tasks/doctor");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DoctorTasksResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError("Failed to load doctor rounds. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const timer = setInterval(fetchTasks, 20_000);
    return () => clearInterval(timer);
  }, [fetchTasks]);

  const filteredTasks = (data?.tasks || []).filter((task) => {
    if (filter === "pending") return !task.visitedToday;
    if (filter === "eligible") return task.isDischargeEligible;
    if (filter === "fever") return task.latestReadingToday?.isFever;
    return true;
  });

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/doctor" />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchTasks} className="underline hover:text-red-800 dark:hover:text-red-200">Retry</button>
          </div>
        )}

        {/* Priority Summary Ribbon */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Total */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Inpatients</span>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">{data?.stats.total ?? 0}</p>
          </div>

          {/* Pending Visits */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pending Visits</span>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">{data?.stats.pendingCount ?? 0}</p>
          </div>

          {/* Discharge Eligible */}
          <div className="p-4 rounded-2xl bg-teal-50/60 dark:bg-slate-900 border border-teal-200 dark:border-teal-500/30 dark:bg-teal-950/10 shadow-xs">
            <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider">Discharge Ready</span>
            <p className="text-2xl font-black text-teal-700 dark:text-teal-300 font-mono mt-0.5">{data?.stats.eligibleCount ?? 0}</p>
          </div>

          {/* Fevers */}
          <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-slate-900 border border-rose-200 dark:border-red-500/30 dark:bg-red-950/10 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-700 dark:text-red-400 uppercase tracking-wider">Active Fevers</span>
            <p className="text-2xl font-black text-rose-700 dark:text-red-400 font-mono mt-0.5">{data?.stats.feverCount ?? 0}</p>
          </div>

          {/* Completed */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Visited Today</span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{data?.stats.visitedCount ?? 0}</p>
          </div>
        </div>

        {/* Priority Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs w-fit">
          <button
            onClick={() => setFilter("pending")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "pending"
                ? "bg-amber-500 text-white dark:text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Needs Visit ({data?.stats.pendingCount ?? 0})
          </button>
          <button
            onClick={() => setFilter("eligible")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "eligible"
                ? "bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md shadow-teal-500/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Discharge Ready ({data?.stats.eligibleCount ?? 0})
          </button>
          <button
            onClick={() => setFilter("fever")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "fever"
                ? "bg-rose-600 dark:bg-red-500 text-white shadow-md shadow-red-500/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Fever Alert ({data?.stats.feverCount ?? 0})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "all"
                ? "bg-slate-800 dark:bg-slate-700 text-white"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            All Inpatients ({data?.stats.total ?? 0})
          </button>
        </div>

        {/* Priority-Ordered Patient Cards */}
        <div className="space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40">
              <p className="text-slate-500 dark:text-slate-400 text-sm">No patients match this filter.</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.admissionId}
                className={`
                  p-4 rounded-2xl border transition-all duration-150 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs
                  ${task.priority === "DISCHARGE_ELIGIBLE"
                    ? "bg-teal-50/70 dark:bg-teal-950/20 border-teal-200 dark:border-teal-500/40 hover:border-teal-400 dark:hover:border-teal-500/60"
                    : task.priority === "FEVER_TODAY"
                    ? "bg-rose-50/70 dark:bg-red-950/20 border-rose-200 dark:border-red-500/40 hover:border-rose-400 dark:hover:border-red-500/60"
                    : task.visitedToday
                    ? "bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/60 opacity-85"
                    : "bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }
                `}
              >
                {/* Patient / Bed Info */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">Bed</span>
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">{task.bedLabel}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {task.wardName}
                      </span>
                      {/* Priority Tag */}
                      {task.priority === "DISCHARGE_ELIGIBLE" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/40 animate-pulse">
                          🔥 DISCHARGE READY (Streak: {task.currentStreak}d)
                        </span>
                      )}
                      {task.priority === "FEVER_TODAY" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-red-500/20 text-rose-700 dark:text-red-300 border border-rose-200 dark:border-red-500/40">
                          🔥 FEVER: {task.latestReadingToday?.valueC.toFixed(1)}°C
                        </span>
                      )}
                      {task.priority === "WAITING_VITALS" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                          ⏳ Vitals Pending
                        </span>
                      )}
                      {task.visitedToday && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                          ✓ Visited Today
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Streak: <strong className="text-slate-800 dark:text-slate-200">{task.currentStreak} days</strong></span>
                      <span>·</span>
                      <span>Today's Temp: {task.latestReadingToday ? (
                        <strong className={task.latestReadingToday.isFever ? "text-rose-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                          {task.latestReadingToday.valueC.toFixed(1)}°C
                        </strong>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Unmeasured</span>
                      )}</span>
                      {task.latestVisitToday && (
                        <>
                          <span>·</span>
                          <span className="text-slate-400 dark:text-slate-500 truncate max-w-xs">Note: {task.latestVisitToday.notes || "No notes"}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Doctor Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* Approve Discharge button if eligible and not yet approved */}
                  {task.isDischargeEligible && !task.hasActiveApproval && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedForApproval(task);
                        setShowApprovalModal(true);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-bold transition-all shadow-md shadow-teal-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>✓</span> Approve Discharge
                    </button>
                  )}

                  {task.hasActiveApproval && (
                    <span className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-500/40 text-teal-700 dark:text-teal-300 text-xs font-medium">
                      ✓ Approved (In Queue)
                    </span>
                  )}

                  {/* Clinical Visit Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedForVisit(task);
                      setShowVisitModal(true);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      !task.visitedToday
                        ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 shadow-xs"
                        : "bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {!task.visitedToday ? "Clinical Visit" : "Add Note"}
                  </button>

                  {/* Outcome dropdown / trigger */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedForOutcome(task);
                      setShowOutcomeModal(true);
                    }}
                    className="px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-800 text-xs transition-colors cursor-pointer"
                    title="Record Deceased or Transferred"
                  >
                    Outcome
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Modals */}
      <DoctorVisitModal
        isOpen={showVisitModal}
        onClose={() => setShowVisitModal(false)}
        onSuccess={() => fetchTasks()}
        admission={selectedForVisit}
      />

      <DischargeApprovalModal
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        onSuccess={() => fetchTasks()}
        admission={selectedForApproval}
      />

      <RecordOutcomeModal
        isOpen={showOutcomeModal}
        onClose={() => setShowOutcomeModal(false)}
        onSuccess={() => fetchTasks()}
        admission={selectedForOutcome}
      />
    </div>
  );
}
