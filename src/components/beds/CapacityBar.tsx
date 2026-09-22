/**
 * CapacityBar — facility occupancy progress bar.
 */

"use client";

interface CapacityBarProps {
  total: number;
  occupied: number;
  pct: number; // 0–100
}

export function CapacityBar({ total, occupied, pct }: CapacityBarProps) {
  const available = total - occupied;
  const isWarning = pct >= 80 && pct < 90;
  const isCritical = pct >= 90;

  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-500"
    : "bg-teal-500";

  const textColor = isCritical
    ? "text-red-400"
    : isWarning
    ? "text-amber-400"
    : "text-teal-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          Facility capacity
        </span>
        <span className={`font-semibold ${textColor}`}>
          {occupied}/{total} beds occupied ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex gap-4 text-[11px] text-slate-500">
        <span>
          <span className="text-emerald-400 font-medium">{available}</span> available
        </span>
        <span>
          <span className={`${textColor} font-medium`}>{occupied}</span> occupied
        </span>
      </div>
    </div>
  );
}
