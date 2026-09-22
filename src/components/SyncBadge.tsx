"use client";

/**
 * SyncBadge — persistent offline status and outbox sync badge.
 * TRD §9: "UI shows a persistent sync badge ('3 pending') and never claims
 * a record is saved until the server confirmed it — offline items are visibly pending."
 */

import React, { useEffect, useState } from "react";
import { getOutboxPendingCount, flushOutbox } from "@/lib/outbox";

export function SyncBadge() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const checkStatus = async () => {
    try {
      const count = await getOutboxPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB might not be available
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      void handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(checkStatus, 5000);
    void checkStatus();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const res = await flushOutbox();
      if (res.syncedCount > 0) {
        setLastSyncTime(new Date());
      }
      setPendingCount(res.remainingCount);
    } catch (err) {
      console.error("Sync error", err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      {!isOnline ? (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30"
          title="Offline Mode: Clinical data is safely queued on device"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Offline
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-emerald-400 bg-emerald-950/40 border border-emerald-800/40"
          title="Connected to facility server"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Online
        </span>
      )}

      {pendingCount > 0 ? (
        <button
          onClick={handleSync}
          disabled={!isOnline || isSyncing}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-600/30 text-amber-200 border border-amber-500/40 hover:bg-amber-600/50 transition cursor-pointer"
        >
          {isSyncing ? (
            <>
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Syncing...
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {pendingCount} pending sync
            </>
          )}
        </button>
      ) : (
        lastSyncTime && (
          <span className="text-zinc-500 hidden sm:inline" title={lastSyncTime.toLocaleTimeString()}>
            Synced {lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )
      )}
    </div>
  );
}
