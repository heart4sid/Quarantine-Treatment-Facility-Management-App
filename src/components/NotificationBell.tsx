"use client";

/**
 * NotificationBell — in-app clinical alerts dropdown and real-time polling feed.
 * TRD §10, V2-§4.1, §5.1
 *
 * Features:
 * - 30-second foreground polling of /api/v1/events
 * - Unread badge with pulse on CRITICAL alert
 * - 1-click Acknowledge for critical alerts to stop escalation
 * - Browser Web Push notification registration toggle
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  bodySafe: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  targetRole: string | null;
  admissionId: string | null;
  acknowledgedAt: string | null;
  isAcknowledged: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/events");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s polling (TRD §10.3)
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unacknowledgedCount = notifications.filter(
    (n) => n.severity === "CRITICAL" && !n.isAcknowledged
  ).length;

  const handleAcknowledge = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/v1/notifications/${id}/ack`, { method: "POST" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isAcknowledged: true } : n))
        );
      }
    } catch (err) {
      console.error("Ack error", err);
    }
  };

  const handleRegisterPush = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      alert("Push notifications are not supported in this browser");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Push notification permission was denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "mock-key",
      });

      await fetch("/api/v1/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });

      setPushEnabled(true);
    } catch (err: any) {
      console.error("Push registration error", err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 text-zinc-300 transition cursor-pointer flex items-center justify-center"
        title="Clinical Alerts & Notifications"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unacknowledgedCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-sm shadow-red-600/50">
            {unacknowledgedCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-zinc-900 border border-zinc-700/70 shadow-2xl z-50 p-4 flex flex-col gap-3 text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Clinical Notifications</h3>
              {unacknowledgedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 text-[10px] font-mono border border-red-800/50">
                  {unacknowledgedCount} Critical
                </span>
              )}
            </div>
            <button
              onClick={handleRegisterPush}
              className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
            >
              {pushEnabled ? "Push Enabled ✓" : "Enable Push"}
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <div className="text-center py-6 text-xs text-zinc-500 font-mono">
                No active notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl border flex flex-col gap-1.5 transition ${
                    n.severity === "CRITICAL"
                      ? "border-red-800/60 bg-red-950/20"
                      : n.severity === "WARNING"
                      ? "border-amber-800/50 bg-amber-950/20"
                      : "border-zinc-800 bg-zinc-800/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          n.severity === "CRITICAL"
                            ? "bg-red-400 animate-ping"
                            : n.severity === "WARNING"
                            ? "bg-amber-400"
                            : "bg-blue-400"
                        }`}
                      />
                      <span className="text-xs font-semibold text-zinc-200">{n.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 whitespace-nowrap">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{n.bodySafe}</p>

                  {n.severity === "CRITICAL" && !n.isAcknowledged && (
                    <button
                      onClick={(e) => handleAcknowledge(n.id, e)}
                      className="mt-1 self-start px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold transition cursor-pointer shadow-sm shadow-red-600/30"
                    >
                      Acknowledge Alert
                    </button>
                  )}

                  {n.isAcknowledged && (
                    <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      ✓ Acknowledged
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
