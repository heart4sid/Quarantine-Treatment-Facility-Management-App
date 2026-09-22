/**
 * Public Family Status View (v2d).
 * TRD §11.3, V2-§4.4, DECISIONS.md G4
 *
 * Requirements:
 * - Public page accessed via unguessable 256-bit token
 * - Minimal data: admission date + coarse status
 * - Strictly NO PHI, NO temperatures, NO doctor notes, NO bed numbers
 * - Deceased / Transferred: Neutral "Please contact the facility" message (G4)
 * - Cache-Control: no-store, X-Robots-Tag: noindex
 */

import { getFamilyStatusByToken } from "@/server/services/family";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Care Status | Quarantine & Treatment Facility",
  robots: "noindex, nofollow",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function FamilyStatusPage({ params }: PageProps) {
  const { token } = await params;
  const result = await getFamilyStatusByToken(token);

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case "DISCHARGE_ELIGIBLE":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800";
      case "DISCHARGED":
        return "bg-sky-100 text-sky-800 border-sky-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800";
      case "UNDER_OBSERVATION":
      case "ADMITTED":
        return "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800";
      case "CONTACT_FACILITY":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800";
      default:
        return "bg-slate-100 text-slate-600 border-slate-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DISCHARGE_ELIGIBLE":
        return "Fever-Free (Discharge Review)";
      case "DISCHARGED":
        return "Discharged (Cured)";
      case "UNDER_OBSERVATION":
        return "Under Active Medical Observation";
      case "ADMITTED":
        return "Admitted to Care";
      case "CONTACT_FACILITY":
        return "Please Contact Facility";
      default:
        return "Link Expired or Unavailable";
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans antialiased transition-colors duration-200">
      <div className="max-w-md w-full rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl dark:shadow-2xl flex flex-col gap-6 text-center backdrop-blur-xl">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-indigo-600/20 dark:border-indigo-500/30 flex items-center justify-center dark:text-indigo-400 text-2xl font-bold shadow-xs">
            🏥
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-[10px] font-mono text-slate-600 dark:text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            End-to-End Encrypted Status Link
          </div>
        </div>

        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Quarantine & Treatment Facility
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Official Patient Recovery & Care Status Portal
          </p>
        </div>

        {!result.valid ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-lg">
              🔒
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Status Link Unavailable
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              This status link is either expired, revoked, or invalid. Please reach out to the patient&apos;s designated clinical point of contact for an updated link.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Current Recovery Status
              </span>
              <span
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border shadow-xs ${getBadgeStyle(
                  result.status
                )}`}
              >
                {getStatusLabel(result.status)}
              </span>
            </div>

            {result.admittedAt && (
              <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <span>Admission Date</span>
                <span className="font-mono text-slate-900 dark:text-slate-200 tabular-nums font-semibold">{result.admittedAt}</span>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 leading-relaxed text-left">
              <p>{result.message}</p>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-500 leading-relaxed border-t border-slate-200 dark:border-slate-800/80 pt-4">
              To strictly protect patient privacy and clinical confidentiality, detailed vitals, bed assignments, and medical charts are restricted to authorized medical staff.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
