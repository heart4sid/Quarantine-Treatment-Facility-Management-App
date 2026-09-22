/**
 * ClinicalHeader — Unified High-Containment Station Navigation & Telemetry
 * Implements refined clinical design standards:
 * - Meaningful MedicalShieldLogo representing bio-containment & patient care
 * - Glassmorphic high-contrast header for internal pages (Nurse, Doctor, Beds, Discharges, Waitlist, Analytics)
 * - Clear active station tabs with micro-interactions and icons
 * - Integrated Bedside Fast PIN Switch, SyncBadge, Theme Switcher, and NotificationBell
 * - Contextual station banner with clinical protocol status
 */

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncBadge } from "@/components/SyncBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { PinLockModal } from "@/components/PinLockModal";
import { MedicalShieldLogo } from "@/components/MedicalShieldLogo";
import {
  ShieldCrossIcon,
  ThermometerIcon,
  StethoscopeIcon,
  HospitalBedIcon,
  DischargeDoorIcon,
  ClipboardCheckIcon,
  AnalyticsBarIcon,
  KeyPadIcon,
  SunIcon,
  MoonIcon,
} from "@/components/icons/MedicalIcons";

const STATIONS = [
  { href: "/dashboard/facility", label: "Command Center", icon: ShieldCrossIcon, shortLabel: "Overview", desc: "Live Census & Alerts" },
  { href: "/dashboard/nurse", label: "Nurse Rounds", icon: ThermometerIcon, shortLabel: "Nurse", desc: "Temperature & Vitals Logging" },
  { href: "/dashboard/doctor", label: "Doctor Station", icon: StethoscopeIcon, shortLabel: "Doctor", desc: "Daily Rounds & Clearances" },
  { href: "/dashboard/beds", label: "Bed Allocation", icon: HospitalBedIcon, shortLabel: "Beds", desc: "74-Bed Capacity Grid" },
  { href: "/dashboard/discharge-queue", label: "Discharge Queue", icon: DischargeDoorIcon, shortLabel: "Discharges", desc: "Streak Verification" },
  { href: "/dashboard/waitlist", label: "Triage & Waitlist", icon: ClipboardCheckIcon, shortLabel: "Waitlist", desc: "Admission Queue" },
  { href: "/dashboard/analytics", label: "Containment Analytics", icon: AnalyticsBarIcon, shortLabel: "Analytics", desc: "Epidemic Trends" },
];

export function ClinicalHeader({ activeStation }: { activeStation?: string }) {
  const pathname = usePathname();
  const [showPinModal, setShowPinModal] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [currentStaff, setCurrentStaff] = useState<{ displayName: string; role: string }>({
    displayName: "Dr. Elena Vance",
    role: "Facility Head",
  });

  // Check localStorage for theme and active staff
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("hms_theme");
      if (savedTheme === "dark") {
        setTheme("dark");
        document.documentElement.classList.add("dark");
      } else {
        setTheme("light");
        document.documentElement.classList.remove("dark");
      }

      const stored = localStorage.getItem("quarantine_active_staff");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.displayName) {
          setCurrentStaff(parsed);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("hms_theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } catch {
      // Ignore
    }
  };

  // Find active station info
  const currentStationInfo = STATIONS.find(
    (s) => s.href === pathname || s.href === activeStation
  ) || STATIONS[0];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-950/90 backdrop-blur-xl transition-all duration-200 shadow-xs">
        {/* Main Station Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Meaningful Medical Logo & Facility Brand */}
            <div className="flex items-center gap-4 shrink-0">
              <Link
                href="/"
                className="group flex items-center gap-3 transition-opacity hover:opacity-95"
                title="Return to Master Command Hub"
              >
                <MedicalShieldLogo size="md" showPulse={true} />
                <div className="hidden sm:block">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                      Quarantine Facility
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 uppercase tracking-wider">
                      <span className="size-1.5 rounded-full bg-rose-500 animate-ping" />
                      BSL-4
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    74-Bed High-Containment Unit
                  </p>
                </div>
              </Link>
            </div>

            {/* Middle: Workstation Navigation Tabs */}
            <nav
              aria-label="Clinical Workstations"
              className="hidden xl:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800"
            >
              {STATIONS.map((station) => {
                const isActive = pathname === station.href || activeStation === station.href;
                return (
                  <Link
                    key={station.href}
                    href={station.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? "bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-sm border border-slate-200/80 dark:border-slate-700"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <station.icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"}`} />
                    <span>{station.shortLabel}</span>
                    {isActive && (
                      <span className="size-1.5 rounded-full bg-sky-500 dark:bg-sky-400 animate-pulse ml-0.5" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right: Telemetry, Hub Shortcut, Theme Switcher & Fast Bedside PIN Switch */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Master Command Hub Link */}
              <Link
                href="/hub"
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all duration-150 flex items-center gap-1.5 shadow-2xs"
                title="Return to Master Interactive Command Hub"
              >
                <span className="text-amber-500 text-sm">⚡</span>
                <span className="hidden md:inline">Command Hub</span>
              </Link>

              {/* Station Login / Switch */}
              <Link
                href="/login"
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition-all duration-150 flex items-center gap-1 shadow-2xs"
                title="Switch duty station or authenticate staff"
              >
                <span>Login</span>
              </Link>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-all duration-150 cursor-pointer shadow-2xs"
                title={theme === "light" ? "Switch to Cyber Dark Mode" : "Switch to Clinical Light Mode"}
                aria-label="Toggle theme"
              >
                {theme === "light" ? (
                  <MoonIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <SunIcon className="w-4 h-4 text-amber-400" />
                )}
              </button>

              <SyncBadge />
              <NotificationBell />

              {/* Fast Bedside PIN Switch Pill */}
              <button
                onClick={() => setShowPinModal(true)}
                className="group flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-xs transition-all duration-150 shadow-2xs cursor-pointer"
                title="Fast switch bedside clinician via PIN"
                aria-label="Switch staff PIN"
              >
                <div className="relative">
                  <div className="size-6 rounded-lg bg-gradient-to-tr from-sky-600 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shadow-xs">
                    {currentStaff.displayName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-950 animate-pulse" />
                </div>
                <div className="hidden sm:flex flex-col text-left leading-tight">
                  <span className="text-slate-900 dark:text-slate-100 font-bold truncate max-w-[110px] text-xs">
                    {currentStaff.displayName}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {currentStaff.role}
                  </span>
                </div>
                <div className="p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  <KeyPadIcon className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Medium Screen & Mobile Secondary Station Bar */}
        <div className="xl:hidden flex items-center gap-1.5 px-4 py-2 overflow-x-auto border-t border-slate-200/90 dark:border-slate-800/90 bg-slate-50/90 dark:bg-slate-950/95 scrollbar-none">
          {STATIONS.map((station) => {
            const isActive = pathname === station.href || activeStation === station.href;
            return (
              <Link
                key={station.href}
                href={station.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? "bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-xs border border-slate-200 dark:border-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <station.icon className="w-3.5 h-3.5 shrink-0" />
                <span>{station.shortLabel}</span>
              </Link>
            );
          })}
        </div>

        {/* Station Context Header Strip */}
        <div className="border-t border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40 px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <currentStationInfo.icon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                {currentStationInfo.label}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                {currentStationInfo.desc}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-slate-700 dark:text-slate-300">Containment Active</span>
              </span>
              <span className="hidden md:inline text-slate-300 dark:text-slate-700">•</span>
              <span className="hidden md:inline">Target: 3-Day Afebrile Discharge</span>
            </div>
          </div>
        </div>
      </header>

      {/* Shared Fast Bedside PIN Switch Modal */}
      <PinLockModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onUserSwitched={(user) => {
          const updated = {
            displayName: user.displayName,
            role: user.roles[0] || "Staff",
          };
          setCurrentStaff(updated);
          localStorage.setItem("quarantine_active_staff", JSON.stringify(updated));
          setShowPinModal(false);
        }}
      />
    </>
  );
}

export default ClinicalHeader;
