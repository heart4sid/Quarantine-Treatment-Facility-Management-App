/**
 * WaitlistBanner — sticky footer banner when patients are waiting.
 */

"use client";

import Link from "next/link";

interface WaitlistBannerProps {
  count: number;
}

export function WaitlistBanner({ count }: WaitlistBannerProps) {
  return (
    <div className="
      shrink-0 px-6 py-3
      bg-amber-950/40 border-t border-amber-900/50
      flex items-center justify-between
    ">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30">
          <svg
            className="w-3.5 h-3.5 text-amber-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-amber-300">
          <span className="font-bold">{count}</span>{" "}
          {count === 1 ? "patient" : "patients"} waiting for a bed
        </p>
      </div>
      <Link
        href="/dashboard/waitlist"
        className="
          text-sm font-semibold text-amber-400 hover:text-amber-300
          underline underline-offset-2 transition-colors
        "
      >
        View waitlist →
      </Link>
    </div>
  );
}
