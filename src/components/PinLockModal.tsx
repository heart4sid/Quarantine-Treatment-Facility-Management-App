"use client";

/**
 * PinLockModal — Fast PIN user switching & 5-minute idle lock for shared bedside tablets.
 * TRD §7.1, V1-§6
 *
 * Features:
 * - 5-minute inactivity idle detection
 * - Staff selector (Nurse / Doctor cards)
 * - 4-to-6 numeric keypad with tactile touch targets
 * - Rate limiting feedback & 15-minute lock countdown
 * - Updates active session token in localStorage / cookie
 */

import React, { useState, useEffect, useCallback } from "react";

interface StaffMember {
  id: string;
  displayName: string;
  roles: string[];
  hasPin: boolean;
  isLocked: boolean;
}

interface PinLockModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onUserSwitched?: (user: { id: string; displayName: string; roles: string[] }) => void;
  isIdleLock?: boolean;
}

export function PinLockModal({
  isOpen,
  onClose,
  onUserSwitched,
  isIdleLock = false,
}: PinLockModalProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Load available facility staff
  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/pin/staff");
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.staff ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadStaff();
      setPin("");
      setError(null);
      setAttemptsRemaining(null);
    }
  }, [isOpen, loadStaff]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + num);
      setError(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedStaff) {
      setError("Please select your staff profile first");
      return;
    }
    if (pin.length < 4) {
      setError("Enter at least 4 digits");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/pin/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedStaff.id,
          pin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.reason || "Failed to switch user");
        if (typeof data.attemptsRemaining === "number") {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        setPin("");
        return;
      }

      if (data.token) {
        localStorage.setItem("tablet_pin_token", data.token);
      }

      onUserSwitched?.(data.user);
      onClose?.();
    } catch (err: any) {
      setError(err?.message || "Network error while switching user");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-5 text-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {isIdleLock ? "Tablet Locked (Idle)" : "Fast Staff Switch"}
            </h2>
            <p className="text-xs text-zinc-400">
              Shared Bedside Tablet — enter PIN to unlock
            </p>
          </div>
          {!isIdleLock && onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200 text-sm px-2 py-1 rounded"
            >
              ✕
            </button>
          )}
        </div>

        {/* Staff selector */}
        {!selectedStaff ? (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Select Your Name:
            </span>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {staffList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedStaff(s);
                    setPin("");
                    setError(null);
                  }}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition cursor-pointer ${
                    s.isLocked
                      ? "border-red-800/40 bg-red-950/20 opacity-60"
                      : "border-zinc-800 bg-zinc-800/40 hover:bg-zinc-800 hover:border-indigo-500/50"
                  }`}
                >
                  <span className="font-semibold text-sm text-zinc-100">{s.displayName}</span>
                  <span className="text-xs text-zinc-400 capitalize">
                    {s.roles.join(", ") || "Staff"}
                  </span>
                  {s.isLocked && (
                    <span className="text-[10px] text-red-400 mt-1 font-mono">PIN Locked</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-between w-full bg-zinc-800/50 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs">
                  {selectedStaff.displayName.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{selectedStaff.displayName}</div>
                  <div className="text-[11px] text-zinc-400 capitalize">
                    {selectedStaff.roles.join(", ")}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="text-xs text-indigo-400 hover:underline cursor-pointer"
              >
                Change
              </button>
            </div>

            {/* PIN Dots display */}
            <div className="flex items-center justify-center gap-3 py-2">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${
                    idx < pin.length
                      ? "bg-indigo-500 border-indigo-400 scale-110 shadow-sm shadow-indigo-500/50"
                      : "bg-zinc-800 border-zinc-700"
                  }`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  className="h-14 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-xl font-mono font-bold text-zinc-100 transition active:scale-95 cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="h-14 rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-400 uppercase transition cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress("0")}
                className="h-14 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-xl font-mono font-bold text-zinc-100 transition active:scale-95 cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-14 rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 text-sm font-semibold text-zinc-400 transition cursor-pointer flex items-center justify-center"
              >
                ⌫
              </button>
            </div>

            {/* Error or attempts feedback */}
            {error && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2 text-center w-full">
                {error}
              </div>
            )}

            {attemptsRemaining !== null && attemptsRemaining < 5 && (
              <div className="text-xs text-amber-400 text-center font-mono">
                {attemptsRemaining} attempt(s) remaining before 15-minute lock
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || pin.length < 4}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold transition shadow-lg shadow-indigo-600/30 cursor-pointer text-sm"
            >
              {loading ? "Unlocking..." : "Unlock Tablet"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to trigger 5-minute inactivity idle lock on bedside tablets (TRD §7.1).
 */
export function useIdleTimer(timeoutMs = 5 * 60 * 1000, onIdle: () => void) {
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, timeoutMs);
    };

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    for (const evt of events) {
      window.addEventListener(evt, resetTimer, { passive: true });
    }

    resetTimer();

    return () => {
      clearTimeout(timer);
      for (const evt of events) {
        window.removeEventListener(evt, resetTimer);
      }
    };
  }, [timeoutMs, onIdle]);
}
