/**
 * BedCard — individual bed tile in the bed grid.
 * Shows occupancy status, bed label, streak indicator (if occupied).
 */

"use client";

interface BedStatus {
  bedId: string;
  bedLabel: string;
  wardId: string;
  wardName: string;
  isOccupied: boolean;
  admissionId: string | null;
  patientNameEnc: string | null;
}

interface BedCardProps {
  bed: BedStatus;
  onClick?: () => void;
  /** Current fever-free streak — populated from dashboard enrichment */
  streakDays?: number | null;
}

export function BedCard({ bed, onClick, streakDays }: BedCardProps) {
  const isAvailable = !bed.isOccupied;

  const streakColor =
    streakDays === null || streakDays === undefined
      ? ""
      : streakDays === 0
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : streakDays >= 3
      ? "bg-teal-500/20 text-teal-400 border-teal-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30";

  return (
    <button
      id={`bed-card-${bed.bedLabel.replace(/\s/g, "-")}`}
      onClick={onClick}
      disabled={bed.isOccupied && !bed.admissionId}
      className={`
        relative group w-full text-left rounded-xl border transition-all duration-150 shadow-xs
        focus:outline-none focus:ring-2 focus:ring-teal-500/50
        ${isAvailable
          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500/60 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          : "bg-slate-50/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700/50 cursor-default"
        }
      `}
    >
      {/* Bed label row */}
      <div className="flex items-center justify-between p-3 pb-2">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono tracking-wide">
          {bed.bedLabel}
        </span>
        {/* Bed icon */}
        <svg
          className={`w-4 h-4 ${isAvailable ? "text-teal-600 dark:text-teal-500" : "text-slate-400 dark:text-slate-500"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 10h18M3 10V6a1 1 0 011-1h16a1 1 0 011 1v4M3 10v8m18-8v8M3 18h18" />
        </svg>
      </div>

      {/* Status area */}
      <div className="px-3 pb-3">
        {isAvailable ? (
          <span className="
            inline-flex items-center gap-1 px-2 py-0.5 rounded-full
            text-[10px] font-semibold uppercase tracking-wider
            bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20
          ">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            Available
          </span>
        ) : (
          <div className="space-y-1.5">
            {/* Anonymized patient hint */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
              {bed.patientNameEnc
                ? `[Pt: ${bed.patientNameEnc.slice(3, 10)}…]`
                : "[Admitted]"}
            </p>
            {/* Streak badge */}
            {streakDays !== null && streakDays !== undefined ? (
              <span className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                text-[10px] font-semibold border ${streakColor}
              `}>
                {streakDays === 0
                  ? "🌡️ Fever today"
                  : `Day ${streakDays} fever-free`}
              </span>
            ) : (
              <span className="
                inline-flex items-center px-2 py-0.5 rounded-full
                text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
              ">
                No reading today
              </span>
            )}
          </div>
        )}
      </div>

      {/* Available hover caret */}
      {isAvailable && (
        <div className="
          absolute inset-0 flex items-center justify-center
          opacity-0 group-hover:opacity-100 transition-opacity
          bg-teal-500/10 rounded-xl
        ">
          <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
            Click to admit
          </span>
        </div>
      )}
    </button>
  );
}
