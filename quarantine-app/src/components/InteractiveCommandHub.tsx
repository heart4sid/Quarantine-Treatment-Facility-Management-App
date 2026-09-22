"use client";

/**
 * InteractiveCommandHub — High-engagement Cyber-Clinical Command Center
 * Built to uiux-designer standards:
 * - Style: Accessible & Ethical + Soft UI Evolution + Medical Clean
 * - Strict no-emoji rule: Custom vector medical SVG icons
 * - Light theme default with seamless Light/Dark toggle
 * - Touch ergonomics: 44px+ touch targets, cursor-pointer, active:scale-95
 * - Clinical Acuity & Isolation Tier telemetry (BSL-4, -34 Pa, ESI-2)
 * - Interactive 4-Ward Floorplan with clickable bed telemetry
 * - Interactive Bedside Telemetry Drawer (ECG heart rate, streak meter, vitals logging, eMAR medication)
 * - Quick Action Command Palette (Ctrl+K)
 * - Synthesized Web Audio API clinical chimes
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { soundFx } from "@/lib/sound";
import { PinLockModal } from "@/components/PinLockModal";
import { SyncBadge } from "@/components/SyncBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { MedicalShieldLogo } from "@/components/MedicalShieldLogo";
import {
  StethoscopeIcon,
  ThermometerIcon,
  HospitalBedIcon,
  HeartbeatIcon,
  ShieldCrossIcon,
  PressureGaugeIcon,
  PillSyringeIcon,
  DischargeDoorIcon,
  AnalyticsBarIcon,
  ClipboardCheckIcon,
  BiohazardIcon,
  KeyPadIcon,
  SoundWaveIcon,
  SoundMuteIcon,
  SunIcon,
  MoonIcon,
} from "@/components/icons/MedicalIcons";

interface BedData {
  id: string;
  label: string;
  ward: "Ward A" | "Ward B" | "Ward C" | "Ward D";
  wardType: string;
  isOccupied: boolean;
  patientId?: string;
  mrn?: string;
  patientName?: string;
  streakDays?: number;
  lastTemp?: number;
  heartRate?: number;
  spo2?: number;
  doctorSigned?: boolean;
  notes?: string;
  daysAdmitted?: number;
  acuityTier?: "Tier-1 Strict Airborne" | "Tier-2 Contact / Droplet" | "Tier-3 Step-Down";
  pcrStatus?: string;
  lastMedication?: string;
}

const INITIAL_BEDS: BedData[] = [
  // Ward A (Primary Isolation - Negative Pressure -32.4 Pa)
  { id: "a-01", label: "Bed A-01", ward: "Ward A", wardType: "Primary Isolation", isOccupied: true, patientId: "P-801", mrn: "MRN-1092", patientName: "A. Mercer", streakDays: 2, lastTemp: 36.7, heartRate: 72, spo2: 98, doctorSigned: false, daysAdmitted: 4, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Ct 33.4 (Low Viral Load)", lastMedication: "Remdesivir 100mg IV (08:00)" },
  { id: "a-02", label: "Bed A-02", ward: "Ward A", wardType: "Primary Isolation", isOccupied: true, patientId: "P-802", mrn: "MRN-1094", patientName: "T. Henderson", streakDays: 3, lastTemp: 36.4, heartRate: 68, spo2: 99, doctorSigned: true, daysAdmitted: 6, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Negative (Cleared)", lastMedication: "Oral Hydration + Multivitamin" },
  { id: "a-03", label: "Bed A-03", ward: "Ward A", wardType: "Primary Isolation", isOccupied: true, patientId: "P-803", mrn: "MRN-1098", patientName: "S. Thorne", streakDays: 0, lastTemp: 38.5, heartRate: 98, spo2: 95, doctorSigned: false, daysAdmitted: 2, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Ct 22.1 (High Viral Load)", lastMedication: "Acetaminophen 650mg PO (09:15)" },
  { id: "a-04", label: "Bed A-04", ward: "Ward A", wardType: "Primary Isolation", isOccupied: false },
  { id: "a-05", label: "Bed A-05", ward: "Ward A", wardType: "Primary Isolation", isOccupied: true, patientId: "P-805", mrn: "MRN-1102", patientName: "K. Bradley", streakDays: 1, lastTemp: 36.9, heartRate: 76, spo2: 97, doctorSigned: false, daysAdmitted: 3, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Ct 29.8 (Moderate)", lastMedication: "Remdesivir 100mg IV (08:00)" },
  { id: "a-06", label: "Bed A-06", ward: "Ward A", wardType: "Primary Isolation", isOccupied: false },

  // Ward B (High Containment - Negative Pressure -36.1 Pa)
  { id: "b-01", label: "Bed B-01", ward: "Ward B", wardType: "High Containment", isOccupied: true, patientId: "P-811", mrn: "MRN-2041", patientName: "R. Vance", streakDays: 0, lastTemp: 39.1, heartRate: 104, spo2: 93, doctorSigned: false, daysAdmitted: 1, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Ct 19.4 (Critical Viral Load)", lastMedication: "Broad-Spectrum Antiviral IV" },
  { id: "b-02", label: "Bed B-02", ward: "Ward B", wardType: "High Containment", isOccupied: true, patientId: "P-812", mrn: "MRN-2045", patientName: "D. Miller", streakDays: 1, lastTemp: 37.1, heartRate: 80, spo2: 96, doctorSigned: false, daysAdmitted: 3, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Ct 27.5 (Moderate)", lastMedication: "Normal Saline 1000mL IV" },
  { id: "b-03", label: "Bed B-03", ward: "Ward B", wardType: "High Containment", isOccupied: false },
  { id: "b-04", label: "Bed B-04", ward: "Ward B", wardType: "High Containment", isOccupied: true, patientId: "P-814", mrn: "MRN-2050", patientName: "L. Hayes", streakDays: 2, lastTemp: 36.8, heartRate: 74, spo2: 98, doctorSigned: false, daysAdmitted: 5, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Ct 34.0 (Low Viral Load)", lastMedication: "Remdesivir 100mg IV (08:00)" },
  { id: "b-05", label: "Bed B-05", ward: "Ward B", wardType: "High Containment", isOccupied: false },
  { id: "b-06", label: "Bed B-06", ward: "Ward B", wardType: "High Containment", isOccupied: true, patientId: "P-816", mrn: "MRN-2059", patientName: "C. Zhang", streakDays: 3, lastTemp: 36.5, heartRate: 66, spo2: 99, doctorSigned: true, daysAdmitted: 7, acuityTier: "Tier-1 Strict Airborne", pcrStatus: "Negative (Cleared)", lastMedication: "Maintenance Electrolytes" },

  // Ward C (Sub-Acute Observation - Negative Pressure -28.2 Pa)
  { id: "c-01", label: "Bed C-01", ward: "Ward C", wardType: "Observation", isOccupied: true, patientId: "P-821", mrn: "MRN-3012", patientName: "M. Cross", streakDays: 2, lastTemp: 36.6, heartRate: 70, spo2: 98, doctorSigned: false, daysAdmitted: 4, acuityTier: "Tier-2 Contact / Droplet", pcrStatus: "Ct 35.1 (Borderline Low)", lastMedication: "Supportive Care" },
  { id: "c-02", label: "Bed C-02", ward: "Ward C", wardType: "Observation", isOccupied: false },
  { id: "c-03", label: "Bed C-03", ward: "Ward C", wardType: "Observation", isOccupied: true, patientId: "P-823", mrn: "MRN-3018", patientName: "J. Rios", streakDays: 1, lastTemp: 37.0, heartRate: 75, spo2: 97, doctorSigned: false, daysAdmitted: 2, acuityTier: "Tier-2 Contact / Droplet", pcrStatus: "Ct 31.0 (Moderate)", lastMedication: "Antiviral Day 2" },
  { id: "c-04", label: "Bed C-04", ward: "Ward C", wardType: "Observation", isOccupied: false },
  { id: "c-05", label: "Bed C-05", ward: "Ward C", wardType: "Observation", isOccupied: true, patientId: "P-825", mrn: "MRN-3024", patientName: "N. Flynn", streakDays: 3, lastTemp: 36.3, heartRate: 64, spo2: 99, doctorSigned: false, daysAdmitted: 6, acuityTier: "Tier-2 Contact / Droplet", pcrStatus: "Negative (Cleared)", lastMedication: "Oral Hydration" },
  { id: "c-06", label: "Bed C-06", ward: "Ward C", wardType: "Observation", isOccupied: false },

  // Ward D (Step-Down & Discharge - Negative Pressure -24.0 Pa)
  { id: "d-01", label: "Bed D-01", ward: "Ward D", wardType: "Step-Down", isOccupied: true, patientId: "P-831", mrn: "MRN-4011", patientName: "E. Morales", streakDays: 3, lastTemp: 36.2, heartRate: 65, spo2: 99, doctorSigned: true, daysAdmitted: 8, acuityTier: "Tier-3 Step-Down", pcrStatus: "Negative (Confirmed Cleared)", lastMedication: "Pre-Discharge Clearance" },
  { id: "d-02", label: "Bed D-02", ward: "Ward D", wardType: "Step-Down", isOccupied: false },
  { id: "d-03", label: "Bed D-03", ward: "Ward D", wardType: "Step-Down", isOccupied: true, patientId: "P-833", mrn: "MRN-4019", patientName: "W. Lawson", streakDays: 3, lastTemp: 36.4, heartRate: 67, spo2: 98, doctorSigned: true, daysAdmitted: 9, acuityTier: "Tier-3 Step-Down", pcrStatus: "Negative (Confirmed Cleared)", lastMedication: "Pre-Discharge Clearance" },
  { id: "d-04", label: "Bed D-04", ward: "Ward D", wardType: "Step-Down", isOccupied: false },
  { id: "d-05", label: "Bed D-05", ward: "Ward D", wardType: "Step-Down", isOccupied: false },
  { id: "d-06", label: "Bed D-06", ward: "Ward D", wardType: "Step-Down", isOccupied: false },
];

export function InteractiveCommandHub() {
  const [beds, setBeds] = useState<BedData[]>(INITIAL_BEDS);
  const [selectedBed, setSelectedBed] = useState<BedData | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeStaff, setActiveStaff] = useState<string>("Dr. Elena Vance (Facility Head)");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Initialize theme from localStorage, default to LIGHT
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("hms_theme");
      if (savedTheme === "dark") {
        setTheme("dark");
        document.documentElement.classList.add("dark");
      } else {
        setTheme("light");
        document.documentElement.classList.remove("dark");
        localStorage.setItem("hms_theme", "light");
      }
    } catch {
      // Ignore
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    soundFx.playChime();
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

  const isDark = theme === "dark";

  // Toggle Sound FX
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFx.enabled = next;
    if (next) soundFx.playChime();
  };

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsCommandOpen(false);
        setSelectedBed(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live action: Log normal temperature for selected bed
  const handleLogNormalTemp = (bedId: string) => {
    soundFx.playChime();
    setBeds((prev) =>
      prev.map((b) => {
        if (b.id !== bedId) return b;
        const currentStreak = b.streakDays ?? 0;
        const nextStreak = Math.min(3, currentStreak + 1);
        return {
          ...b,
          streakDays: nextStreak,
          lastTemp: 36.6,
          doctorSigned: nextStreak >= 3 ? b.doctorSigned : false,
        };
      })
    );
    if (selectedBed?.id === bedId) {
      setSelectedBed((prev) =>
        prev
          ? {
              ...prev,
              streakDays: Math.min(3, (prev.streakDays ?? 0) + 1),
              lastTemp: 36.6,
            }
          : null
      );
    }
    showToast(`Logged normal vitals (36.6°C) for ${selectedBed?.label}. Streak updated!`);
  };

  // Live action: Log fever temperature (triggers G1 fever reset)
  const handleLogFeverTemp = (bedId: string) => {
    soundFx.playAlert();
    setBeds((prev) =>
      prev.map((b) => {
        if (b.id !== bedId) return b;
        return {
          ...b,
          streakDays: 0,
          lastTemp: 38.7,
          doctorSigned: false,
        };
      })
    );
    if (selectedBed?.id === bedId) {
      setSelectedBed((prev) =>
        prev
          ? {
              ...prev,
              streakDays: 0,
              lastTemp: 38.7,
              doctorSigned: false,
            }
          : null
      );
    }
    showToast(`CRITICAL ALERT: Fever Spike (38.7°C) logged for ${selectedBed?.label}! Streak reset to 0 (TRD G1).`);
  };

  // Live action: Complete Doctor Sign-Off
  const handleDoctorSignOff = (bedId: string) => {
    soundFx.playChime();
    setBeds((prev) =>
      prev.map((b) => (b.id === bedId ? { ...b, doctorSigned: true } : b))
    );
    if (selectedBed?.id === bedId) {
      setSelectedBed((prev) => (prev ? { ...prev, doctorSigned: true } : null));
    }
    showToast(`Physician Sign-Off completed for ${selectedBed?.label}! Patient routed to Discharge Queue.`);
  };

  // Live action: eMAR Medication Administration
  const handleAdministerMed = (bedId: string) => {
    soundFx.playChime();
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const medDesc = `Remdesivir 100mg IV administered at ${timeStr}`;
    setBeds((prev) =>
      prev.map((b) => (b.id === bedId ? { ...b, lastMedication: medDesc } : b))
    );
    if (selectedBed?.id === bedId) {
      setSelectedBed((prev) => (prev ? { ...prev, lastMedication: medDesc } : null));
    }
    showToast(`eMAR: Verified & Administered Remdesivir 100mg IV for ${selectedBed?.label}.`);
  };

  // Simulate Influx Drill
  const handleSimulateDrill = () => {
    soundFx.playChime();
    setBeds((prev) => {
      const firstAvailable = prev.find((b) => !b.isOccupied);
      if (!firstAvailable) {
        showToast("All 74 Beds Occupied! Overflow routed to Admission Waitlist Queue.");
        return prev;
      }
      showToast(`Containment Drill: Triage intake admitted into ${firstAvailable.label}!`);
      return prev.map((b) =>
        b.id === firstAvailable.id
          ? {
              ...b,
              isOccupied: true,
              patientId: `P-${Math.floor(1000 + Math.random() * 9000)}`,
              mrn: `MRN-${Math.floor(5000 + Math.random() * 5000)}`,
              patientName: "Simulated Intake",
              streakDays: 0,
              lastTemp: 37.8,
              heartRate: 84,
              spo2: 97,
              daysAdmitted: 1,
              acuityTier: "Tier-1 Strict Airborne",
              pcrStatus: "Rapid Antigen POSITIVE",
              lastMedication: "Intake Vitals Complete",
            }
          : b
      );
    });
  };

  // Compute live capacity
  const totalBeds = beds.length;
  const occupiedCount = beds.filter((b) => b.isOccupied).length;
  const dischargeReadyCount = beds.filter((b) => (b.streakDays ?? 0) >= 3).length;
  const feverCount = beds.filter((b) => (b.lastTemp ?? 0) >= 38.0).length;

  // Filtered beds
  const filteredBeds = useMemo(() => {
    return beds.filter((b) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchLabel = b.label.toLowerCase().includes(q);
        const matchPatient = b.patientName?.toLowerCase().includes(q);
        const matchMrn = b.mrn?.toLowerCase().includes(q);
        const matchWard = b.ward.toLowerCase().includes(q);
        if (!matchLabel && !matchPatient && !matchMrn && !matchWard) return false;
      }
      if (selectedRoleFilter === "nurse") {
        return b.isOccupied && (b.streakDays ?? 0) < 3;
      }
      if (selectedRoleFilter === "doctor") {
        return b.isOccupied && ((b.streakDays ?? 0) >= 3 || (b.lastTemp ?? 0) >= 38.0);
      }
      if (selectedRoleFilter === "beds") {
        return !b.isOccupied;
      }
      return true;
    });
  }, [beds, searchQuery, selectedRoleFilter]);

  const wards = ["Ward A", "Ward B", "Ward C", "Ward D"] as const;

  return (
    <div
      className={`min-h-dvh flex flex-col font-sans relative transition-colors duration-200 ${
        isDark
          ? "bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-white"
          : "bg-slate-50 text-slate-900 selection:bg-sky-500 selection:text-white"
      }`}
    >
      {/* Top Banner & Header */}
      <header
        className={`border-b sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 transition-colors duration-200 ${
          isDark
            ? "border-slate-800/80 bg-slate-900/90 backdrop-blur-md"
            : "border-slate-200/90 bg-white/95 backdrop-blur-md shadow-xs"
        }`}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo & Protocol Badge */}
          <div className="flex items-center gap-3.5">
            <MedicalShieldLogo size="lg" showPulse={true} />
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className={`text-base font-extrabold tracking-tight flex items-center gap-2 ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  Quarantine & Treatment Facility
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                      isDark
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        : "bg-rose-50 text-rose-700 border-rose-200 font-semibold"
                    }`}
                  >
                    BSL-4 Protocol
                  </span>
                </h1>
              </div>
              <p
                className={`text-xs flex items-center gap-2 ${
                  isDark ? "text-slate-400" : "text-slate-500"
                }`}
              >
                <span>74-Bed High-Containment Hospital Unit</span>
                <span className={isDark ? "text-slate-600" : "text-slate-300"}>•</span>
                <span
                  className={`font-mono text-[11px] font-medium ${
                    isDark ? "text-emerald-400" : "text-emerald-700"
                  }`}
                >
                  Negative Pressure -34.2 Pa
                </span>
              </p>
            </div>
          </div>

          {/* Quick Actions & Header Utilities */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Command Palette Trigger */}
            <button
              onClick={() => setIsCommandOpen(true)}
              className={`flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs transition cursor-pointer ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
              }`}
              title="Search facility stations & patients (Ctrl+K)"
            >
              <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Quick Search</span>
              <kbd
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                  isDark ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-white text-slate-600 border-slate-300 shadow-2xs"
                }`}
              >
                ⌘K
              </kbd>
            </button>

            {/* Light / Dark Mode Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-amber-300 hover:bg-slate-800"
                  : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 shadow-xs"
              }`}
              title={isDark ? "Switch to Clinical Light Mode" : "Switch to Cyber Dark Mode"}
            >
              {isDark ? <SunIcon className="w-4 h-4 text-amber-400" /> : <MoonIcon className="w-4 h-4 text-amber-700" />}
              <span className="text-[11px] hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>

            {/* Sound FX Toggle */}
            <button
              onClick={toggleSound}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs transition cursor-pointer flex items-center gap-2 ${
                isDark
                  ? soundEnabled
                    ? "bg-cyan-600/20 border-cyan-500/40 text-cyan-300"
                    : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
                  : soundEnabled
                  ? "bg-sky-50 border-sky-300 text-sky-700 shadow-xs"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
              }`}
              title={soundEnabled ? "Mute clinical audio alerts" : "Enable clinical telemetry chimes"}
            >
              {soundEnabled ? (
                <SoundWaveIcon className={`w-4 h-4 ${isDark ? "text-cyan-400" : "text-sky-600"}`} />
              ) : (
                <SoundMuteIcon className="w-4 h-4 opacity-60" />
              )}
              <span className="text-[11px] hidden sm:inline">{soundEnabled ? "Audio On" : "Muted"}</span>
            </button>

            <SyncBadge />
            <NotificationBell />

            {/* Fast PIN Switch Pill */}
            <button
              onClick={() => setShowPinModal(true)}
              className={`flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs transition cursor-pointer shadow-xs ${
                isDark
                  ? "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800"
              }`}
              title="Fast switch active staff via PIN (5-min idle timeout)"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate max-w-[140px] font-semibold">{activeStaff}</span>
              <KeyPadIcon className="w-4 h-4 opacity-60" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Interactive Work Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Toast Notification Alert */}
        {toastMessage && (
          <div
            className={`fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-2xl border shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 ${
              isDark
                ? "bg-slate-900/95 border-cyan-500/50 text-white"
                : "bg-white/95 border-sky-400 text-slate-900 shadow-xl"
            }`}
          >
            <ShieldCrossIcon className={`w-5 h-5 shrink-0 ${isDark ? "text-cyan-400" : "text-sky-600"}`} />
            <div className="text-xs font-semibold leading-relaxed">{toastMessage}</div>
          </div>
        )}

        {/* Live Facility Telemetry HUD Banner */}
        <section
          className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 transition-colors ${
            isDark
              ? "bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-2xl"
              : "bg-gradient-to-br from-white via-sky-50/50 to-slate-50 border border-slate-200 shadow-sm"
          }`}
        >
          {/* Ambient Glows */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
                    isDark
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                  }`}
                >
                  <BiohazardIcon className="w-3.5 h-3.5 shrink-0" />
                  BSL-4 CONTAINMENT SEAL: ACTIVE
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-mono border ${
                    isDark
                      ? "bg-slate-800/80 border-slate-700 text-slate-300"
                      : "bg-white border-slate-200 text-slate-700 font-semibold shadow-2xs"
                  }`}
                >
                  HEPA RECIRCULATION 99.997%
                </span>
              </div>
              <h2
                className={`text-2xl sm:text-3xl font-black tracking-tight ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                Clinical Operations & Incident Command Hub
              </h2>
              <p
                className={`text-xs sm:text-sm leading-relaxed ${
                  isDark ? "text-slate-400" : "text-slate-600"
                }`}
              >
                Hospital containment management with zero clinical drift. Tap any bed below to inspect live
                EHR telemetry, log rapid bedside temperatures, or simulate outbreak triage drills.
              </p>

              {/* Simulation Drill Action */}
              <div className="pt-1 flex items-center gap-3">
                <button
                  onClick={handleSimulateDrill}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 via-teal-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <BiohazardIcon className="w-4 h-4 text-white" />
                  <span>Simulate Rapid Influx Intake Drill</span>
                </button>
                <span
                  className={`text-[11px] hidden sm:inline ${
                    isDark ? "text-slate-500" : "text-slate-500"
                  }`}
                >
                  Tests overbooking guard & admission waitlist
                </span>
              </div>
            </div>

            {/* Quick Live Telemetry Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div
                className={`p-4 rounded-2xl border text-center transition-colors ${
                  isDark ? "bg-slate-950/70 border-slate-800" : "bg-white border-slate-200 shadow-xs"
                }`}
              >
                <div
                  className={`text-3xl font-black font-mono tabular-nums ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {occupiedCount}
                  <span className={`text-xs font-normal ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {" "}
                    / {totalBeds}
                  </span>
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Active Beds
                </div>
              </div>

              <div
                className={`p-4 rounded-2xl border text-center transition-colors ${
                  isDark ? "bg-slate-950/70 border-slate-800" : "bg-emerald-50/70 border-emerald-200 shadow-xs"
                }`}
              >
                <div
                  className={`text-3xl font-black font-mono tabular-nums ${
                    isDark ? "text-emerald-400" : "text-emerald-700"
                  }`}
                >
                  {dischargeReadyCount}
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                    isDark ? "text-slate-400" : "text-emerald-800"
                  }`}
                >
                  Cured (≥3d Streak)
                </div>
              </div>

              <div
                className={`p-4 rounded-2xl border text-center transition-colors ${
                  isDark ? "bg-slate-950/70 border-slate-800" : "bg-rose-50/70 border-rose-200 shadow-xs"
                }`}
              >
                <div
                  className={`text-3xl font-black font-mono tabular-nums ${
                    isDark ? "text-rose-400" : "text-rose-700"
                  }`}
                >
                  {feverCount}
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                    isDark ? "text-slate-400" : "text-rose-800"
                  }`}
                >
                  Active Fever
                </div>
              </div>

              <div
                className={`p-4 rounded-2xl border text-center transition-colors ${
                  isDark ? "bg-slate-950/70 border-slate-800" : "bg-sky-50/70 border-sky-200 shadow-xs"
                }`}
              >
                <div
                  className={`text-3xl font-black font-mono tabular-nums ${
                    isDark ? "text-cyan-400" : "text-sky-700"
                  }`}
                >
                  -34.2
                  <span className={`text-xs font-normal ${isDark ? "text-slate-400" : "text-sky-600"}`}>
                    {" "}
                    Pa
                  </span>
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                    isDark ? "text-slate-400" : "text-sky-800"
                  }`}
                >
                  Air Pressure
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workstation Quick Launchers & Navigation Strip */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3
                className={`text-base font-bold tracking-tight ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                Clinical Workstations & Portals
              </h3>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Launch dedicated hospital workstation interfaces for floor staff and supervisors.
              </p>
            </div>

            {/* Role Filter Tabs */}
            <div
              className={`flex items-center gap-1 p-1 rounded-xl border ${
                isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
              }`}
              role="tablist"
            >
              {[
                { id: "all", label: "All Stations", icon: ShieldCrossIcon },
                { id: "nurse", label: "Nurse", icon: ThermometerIcon },
                { id: "doctor", label: "Doctor", icon: StethoscopeIcon },
                { id: "beds", label: "Bed Grid", icon: HospitalBedIcon },
              ].map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedRoleFilter(tab.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      selectedRoleFilter === tab.id
                        ? "bg-sky-600 text-white shadow-xs"
                        : isDark
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Facility Command Center */}
            <Link
              href="/dashboard/facility"
              className={`group p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[160px] ${
                isDark
                  ? "bg-slate-900/80 border-slate-800 hover:border-rose-500/50 hover:bg-slate-850 shadow-md"
                  : "bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/20 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="space-y-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    isDark
                      ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                      : "bg-rose-50 border border-rose-200 text-rose-600"
                  }`}
                >
                  <ShieldCrossIcon className="w-5 h-5" />
                </div>
                <h4
                  className={`text-sm font-bold transition-colors ${
                    isDark ? "text-white group-hover:text-rose-400" : "text-slate-900 group-hover:text-rose-600"
                  }`}
                >
                  Facility Command Center
                </h4>
                <p
                  className={`text-xs leading-relaxed ${
                    isDark ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  Real-time occupancy, 15% mortality gate monitor with hysteresis, and clinical exceptions.
                </p>
              </div>
              <div
                className={`mt-4 pt-3 border-t text-[11px] font-bold flex items-center justify-between ${
                  isDark ? "border-slate-800 text-rose-400" : "border-slate-100 text-rose-600"
                }`}
              >
                <span>Facility Head</span>
                <span>Open &rarr;</span>
              </div>
            </Link>

            {/* Card 2: Nurse Bedside Station */}
            <Link
              href="/dashboard/nurse"
              className={`group p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[160px] ${
                isDark
                  ? "bg-slate-900/80 border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 shadow-md"
                  : "bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/20 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="space-y-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    isDark
                      ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                      : "bg-amber-50 border border-amber-200 text-amber-600"
                  }`}
                >
                  <ThermometerIcon className="w-5 h-5" />
                </div>
                <h4
                  className={`text-sm font-bold transition-colors ${
                    isDark ? "text-white group-hover:text-amber-400" : "text-slate-900 group-hover:text-amber-600"
                  }`}
                >
                  Nurse Bedside Rounds
                </h4>
                <p
                  className={`text-xs leading-relaxed ${
                    isDark ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  Rapid bedside temperature logging (≤3 taps), measured vs pending rounds, and fever streaks.
                </p>
              </div>
              <div
                className={`mt-4 pt-3 border-t text-[11px] font-bold flex items-center justify-between ${
                  isDark ? "border-slate-800 text-amber-400" : "border-slate-100 text-amber-600"
                }`}
              >
                <span>Nurse Rounds</span>
                <span>Open &rarr;</span>
              </div>
            </Link>

            {/* Card 3: Doctor Clinical Visits */}
            <Link
              href="/dashboard/doctor"
              className={`group p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[160px] ${
                isDark
                  ? "bg-slate-900/80 border-slate-800 hover:border-cyan-500/50 hover:bg-slate-850 shadow-md"
                  : "bg-white border-slate-200 hover:border-sky-300 hover:bg-sky-50/20 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="space-y-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    isDark
                      ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                      : "bg-sky-50 border border-sky-200 text-sky-600"
                  }`}
                >
                  <StethoscopeIcon className="w-5 h-5" />
                </div>
                <h4
                  className={`text-sm font-bold transition-colors ${
                    isDark ? "text-white group-hover:text-cyan-400" : "text-slate-900 group-hover:text-sky-600"
                  }`}
                >
                  Doctor Clinical Visits
                </h4>
                <p
                  className={`text-xs leading-relaxed ${
                    isDark ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  Priority visit queues, 3-day fever streak verification, and discharge approval sign-offs.
                </p>
              </div>
              <div
                className={`mt-4 pt-3 border-t text-[11px] font-bold flex items-center justify-between ${
                  isDark ? "border-slate-800 text-cyan-400" : "border-slate-100 text-sky-600"
                }`}
              >
                <span>Physician Rounds</span>
                <span>Open &rarr;</span>
              </div>
            </Link>

            {/* Card 4: Interactive Bed Grid */}
            <Link
              href="/dashboard/beds"
              className={`group p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[160px] ${
                isDark
                  ? "bg-slate-900/80 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 shadow-md"
                  : "bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="space-y-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    isDark
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-emerald-50 border border-emerald-200 text-emerald-600"
                  }`}
                >
                  <HospitalBedIcon className="w-5 h-5" />
                </div>
                <h4
                  className={`text-sm font-bold transition-colors ${
                    isDark ? "text-white group-hover:text-emerald-400" : "text-slate-900 group-hover:text-emerald-600"
                  }`}
                >
                  Bed Grid & Admissions
                </h4>
                <p
                  className={`text-xs leading-relaxed ${
                    isDark ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  Interactive 74-bed isolation map across Wards A-D. Real-time overbooking-proof intake.
                </p>
              </div>
              <div
                className={`mt-4 pt-3 border-t text-[11px] font-bold flex items-center justify-between ${
                  isDark ? "border-slate-800 text-emerald-400" : "border-slate-100 text-emerald-600"
                }`}
              >
                <span>Bed Manager</span>
                <span>Open &rarr;</span>
              </div>
            </Link>
          </div>
        </section>

        {/* Interactive 4-Ward Live Containment Floorplan */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={`text-base font-bold tracking-tight ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  Interactive Containment Ward Floorplan
                </h3>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono border ${
                    isDark
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold"
                  }`}
                >
                  LIVE INTERACTION
                </span>
              </div>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Click any bed tile to open live patient vitals, telemetry, and logging actions.
              </p>
            </div>

            {/* Legend */}
            <div
              className={`flex items-center flex-wrap gap-3 text-[11px] font-mono ${
                isDark ? "text-slate-400" : "text-slate-600 font-medium"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
                ≥3d Cured
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                1-2d Streak
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                Fever Spike
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-300"}`} />
                Vacant
              </span>
            </div>
          </div>

          {/* 4-Ward Matrix Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wards.map((wardName) => {
              const wardBeds = filteredBeds.filter((b) => b.ward === wardName);
              const pressure =
                wardName === "Ward A" ? "-32.4 Pa" : wardName === "Ward B" ? "-36.1 Pa" : wardName === "Ward C" ? "-28.2 Pa" : "-24.0 Pa";
              const type =
                wardName === "Ward A" ? "Primary Isolation" : wardName === "Ward B" ? "High Containment" : wardName === "Ward C" ? "Observation" : "Step-Down";

              return (
                <div
                  key={wardName}
                  className={`p-5 rounded-2xl border shadow-xs flex flex-col gap-3 transition-colors ${
                    isDark ? "bg-slate-900/70 border-slate-800/90" : "bg-white border-slate-200"
                  }`}
                >
                  <div
                    className={`flex items-center justify-between pb-2 border-b ${
                      isDark ? "border-slate-800" : "border-slate-100"
                    }`}
                  >
                    <div>
                      <h4
                        className={`text-sm font-bold flex items-center gap-2 ${
                          isDark ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {wardName}
                        <span className={`text-[11px] font-normal ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          ({type})
                        </span>
                      </h4>
                    </div>
                    <div
                      className={`text-[11px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                        isDark
                          ? "text-emerald-400 bg-emerald-950/60 border-emerald-800/60"
                          : "text-emerald-800 bg-emerald-50 border-emerald-200 font-semibold"
                      }`}
                    >
                      <PressureGaugeIcon className="w-3 h-3" />
                      <span>{pressure}</span>
                    </div>
                  </div>

                  {/* Beds in this ward */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {wardBeds.map((bed) => {
                      const isDischargeReady = (bed.streakDays ?? 0) >= 3;
                      const hasFever = (bed.lastTemp ?? 0) >= 38.0;

                      return (
                        <button
                          key={bed.id}
                          onClick={() => {
                            soundFx.playChime();
                            setSelectedBed(bed);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between h-20 relative group min-h-[44px] ${
                            !bed.isOccupied
                              ? isDark
                                ? "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-500"
                                : "bg-slate-50 border-dashed border-slate-300 hover:border-sky-400 text-slate-500"
                              : isDischargeReady
                              ? isDark
                                ? "bg-emerald-950/30 border-emerald-500/50 hover:border-emerald-400 text-emerald-300 shadow-sm"
                                : "bg-emerald-50 border-emerald-300 hover:border-emerald-500 text-emerald-950 shadow-2xs"
                              : hasFever
                              ? isDark
                                ? "bg-rose-950/30 border-rose-500/50 hover:border-rose-400 text-rose-300 shadow-sm"
                                : "bg-rose-50 border-rose-300 hover:border-rose-500 text-rose-950 shadow-2xs"
                              : isDark
                              ? "bg-slate-900 border-slate-700 hover:border-cyan-500 text-slate-200"
                              : "bg-amber-50/70 border-amber-200 hover:border-amber-400 text-amber-950 shadow-2xs"
                          } ${selectedBed?.id === bed.id ? "ring-2 ring-sky-500 scale-105" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold font-mono">{bed.label.replace("Bed ", "")}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                !bed.isOccupied
                                  ? isDark
                                    ? "bg-slate-700"
                                    : "bg-slate-300"
                                  : isDischargeReady
                                  ? "bg-emerald-500"
                                  : hasFever
                                  ? "bg-rose-500 animate-pulse"
                                  : "bg-amber-500"
                              }`}
                            />
                          </div>

                          {bed.isOccupied ? (
                            <div className="mt-1">
                              <div
                                className={`text-[10px] font-semibold truncate ${
                                  isDark ? "text-white" : "text-slate-900"
                                }`}
                              >
                                {bed.patientName}
                              </div>
                              <div
                                className={`text-[10px] font-mono flex items-center justify-between mt-0.5 ${
                                  isDark ? "text-slate-400" : "text-slate-600"
                                }`}
                              >
                                <span>{bed.lastTemp?.toFixed(1)}°C</span>
                                <span
                                  className={`font-bold ${
                                    isDischargeReady ? (isDark ? "text-emerald-400" : "text-emerald-700") : ""
                                  }`}
                                >
                                  {bed.streakDays}d
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className={`text-[10px] font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                              Ready
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Auxiliary Stations: Waitlist, Discharge, Cohorts */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/discharge-queue"
            className={`p-5 rounded-2xl border transition flex items-center gap-4 group min-h-[80px] ${
              isDark
                ? "bg-slate-900/60 border-slate-800 hover:border-teal-500/50"
                : "bg-white border-slate-200 shadow-xs hover:shadow-md hover:border-teal-300"
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold group-hover:scale-110 transition-transform ${
                isDark ? "bg-teal-500/10 border border-teal-500/20 text-teal-400" : "bg-teal-50 border border-teal-200 text-teal-700"
              }`}
            >
              <DischargeDoorIcon className="w-5 h-5" />
            </div>
            <div>
              <h4
                className={`text-sm font-bold transition-colors ${
                  isDark ? "text-white group-hover:text-teal-400" : "text-slate-900 group-hover:text-teal-700"
                }`}
              >
                Discharge Release Queue
              </h4>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {dischargeReadyCount} patient(s) ready for physician & admin release sign-off.
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard/waitlist"
            className={`p-5 rounded-2xl border transition flex items-center gap-4 group min-h-[80px] ${
              isDark
                ? "bg-slate-900/60 border-slate-800 hover:border-purple-500/50"
                : "bg-white border-slate-200 shadow-xs hover:shadow-md hover:border-purple-300"
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold group-hover:scale-110 transition-transform ${
                isDark ? "bg-purple-500/10 border border-purple-500/20 text-purple-400" : "bg-purple-50 border border-purple-200 text-purple-700"
              }`}
            >
              <ClipboardCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h4
                className={`text-sm font-bold transition-colors ${
                  isDark ? "text-white group-hover:text-purple-400" : "text-slate-900 group-hover:text-purple-700"
                }`}
              >
                Capacity Waitlist & Triage
              </h4>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Automated triage queue for intake when all 74 beds are saturated.
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard/analytics"
            className={`p-5 rounded-2xl border transition flex items-center gap-4 group min-h-[80px] ${
              isDark
                ? "bg-slate-900/60 border-slate-800 hover:border-cyan-500/50"
                : "bg-white border-slate-200 shadow-xs hover:shadow-md hover:border-sky-300"
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold group-hover:scale-110 transition-transform ${
                isDark ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400" : "bg-sky-50 border border-sky-200 text-sky-700"
              }`}
            >
              <AnalyticsBarIcon className="w-5 h-5" />
            </div>
            <div>
              <h4
                className={`text-sm font-bold transition-colors ${
                  isDark ? "text-white group-hover:text-cyan-400" : "text-slate-900 group-hover:text-sky-700"
                }`}
              >
                Cohort Analytics & CSV
              </h4>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                ISO week outcome cohorts, 91.7% survival tracking, and audited export.
              </p>
            </div>
          </Link>
        </section>
      </main>

      {/* Interactive Bedside Telemetry Modal / Drawer */}
      {selectedBed && (
        <div
          className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 ${
            isDark ? "bg-slate-950/80" : "bg-slate-900/40"
          }`}
        >
          <div
            className={`max-w-lg w-full rounded-3xl border p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            {/* Modal Header */}
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isDark ? "border-slate-800" : "border-slate-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isDark ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-400" : "bg-sky-50 border border-sky-200 text-sky-600"
                  }`}
                >
                  <HospitalBedIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`text-base font-bold flex items-center gap-2 ${
                      isDark ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {selectedBed.label}
                    <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      ({selectedBed.ward})
                    </span>
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {selectedBed.isOccupied ? `Patient: ${selectedBed.patientName} (${selectedBed.mrn})` : "Bed Vacant & Sanitized"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBed(null)}
                className={`p-2 rounded-lg transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                ✕
              </button>
            </div>

            {selectedBed.isOccupied ? (
              <div className="space-y-4">
                {/* Clinical Isolation Tier & Lab Status Badge */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border text-[11px] font-mono ${
                    isDark ? "bg-slate-950/70 border-slate-800" : "bg-sky-50/70 border-sky-200"
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 font-semibold ${
                      isDark ? "text-cyan-400" : "text-sky-800"
                    }`}
                  >
                    <ShieldCrossIcon className="w-3.5 h-3.5" />
                    {selectedBed.acuityTier || "Tier-1 Strict Airborne"}
                  </span>
                  <span className={isDark ? "text-slate-400" : "text-slate-600"}>
                    PCR:{" "}
                    <span className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      {selectedBed.pcrStatus || "Negative"}
                    </span>
                  </span>
                </div>

                {/* Live Animated ECG & Vitals Strip (Clinical Bedside Monitor Screen) */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between shadow-inner">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Heart Rate</span>
                    <div className="text-2xl font-black text-rose-400 font-mono flex items-baseline gap-1.5 mt-0.5">
                      <HeartbeatIcon className="w-5 h-5 text-rose-400 animate-heart-pulse shrink-0" />
                      <span className="tabular-nums">{selectedBed.heartRate ?? 72}</span>
                      <span className="text-xs font-normal text-slate-500">BPM</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">SpO2 Saturation</span>
                    <div className="text-2xl font-black text-cyan-400 font-mono tabular-nums mt-0.5">
                      {selectedBed.spo2 ?? 98}%
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Latest Temp</span>
                    <div
                      className={`text-2xl font-black font-mono tabular-nums mt-0.5 ${
                        (selectedBed.lastTemp ?? 0) >= 38.0 ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {selectedBed.lastTemp?.toFixed(1)}°C
                    </div>
                  </div>
                </div>

                {/* 3-Day Fever-Free Streak Tracker */}
                <div
                  className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                      3-Day Fever-Free Protocol (G1/G2)
                    </span>
                    <span className={`font-mono font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                      {selectedBed.streakDays} / 3 Days
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((day) => {
                      const isComplete = (selectedBed.streakDays ?? 0) >= day;
                      return (
                        <div
                          key={day}
                          className={`p-2.5 rounded-xl text-center border text-xs font-mono transition ${
                            isComplete
                              ? isDark
                                ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold"
                                : "bg-emerald-100 border-emerald-300 text-emerald-900 font-bold shadow-2xs"
                              : isDark
                              ? "bg-slate-900 border-slate-800 text-slate-500"
                              : "bg-white border-slate-200 text-slate-400"
                          }`}
                        >
                          Day {day} {isComplete ? "✓" : "⏳"}
                        </div>
                      );
                    })}
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                    Strict calendar-day streak: any single reading ≥38.0°C resets streak to 0. At 3 days,
                    patient transitions to physician review.
                  </p>
                </div>

                {/* Interactive Vitals Logger Controls (44px min touch target) */}
                <div className="space-y-2">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      isDark ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    Interactive Vitals Actions
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleLogNormalTemp(selectedBed.id)}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                        isDark
                          ? "bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/40 text-emerald-300"
                          : "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white shadow-xs"
                      }`}
                    >
                      <ThermometerIcon className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-white"} shrink-0`} />
                      <span>Log 36.6°C (Normal)</span>
                    </button>
                    <button
                      onClick={() => handleLogFeverTemp(selectedBed.id)}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                        isDark
                          ? "bg-rose-600/20 hover:bg-rose-600/30 border-rose-500/40 text-rose-300"
                          : "bg-rose-600 hover:bg-rose-700 border-rose-600 text-white shadow-xs"
                      }`}
                    >
                      <ThermometerIcon className={`w-4 h-4 ${isDark ? "text-rose-400" : "text-white"} shrink-0`} />
                      <span>Log 38.7°C (Fever Spike)</span>
                    </button>
                  </div>

                  {/* eMAR Medication Action */}
                  <button
                    onClick={() => handleAdministerMed(selectedBed.id)}
                    className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 mt-2 ${
                      isDark
                        ? "bg-cyan-950/50 hover:bg-cyan-900/50 border-cyan-800 text-cyan-300"
                        : "bg-sky-600 hover:bg-sky-700 border-sky-600 text-white shadow-xs"
                    }`}
                  >
                    <PillSyringeIcon className={`w-4 h-4 ${isDark ? "text-cyan-400" : "text-white"} shrink-0`} />
                    <span>eMAR: Administer Antiviral (Remdesivir 100mg IV)</span>
                  </button>
                  {selectedBed.lastMedication && (
                    <div className={`text-[10px] font-mono text-center ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                      Latest order: {selectedBed.lastMedication}
                    </div>
                  )}
                </div>

                {/* Doctor Sign-off Button */}
                {(selectedBed.streakDays ?? 0) >= 3 && (
                  <div className="pt-2">
                    <button
                      onClick={() => handleDoctorSignOff(selectedBed.id)}
                      disabled={selectedBed.doctorSigned}
                      className={`w-full min-h-[44px] py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                        selectedBed.doctorSigned
                          ? isDark
                            ? "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed"
                            : "bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed"
                          : "bg-sky-600 hover:bg-sky-500 text-white shadow-md cursor-pointer active:scale-95"
                      }`}
                    >
                      <StethoscopeIcon className="w-4 h-4 text-white shrink-0" />
                      <span>{selectedBed.doctorSigned ? "Doctor Sign-Off Completed" : "Complete Doctor Clinical Sign-Off"}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center space-y-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                    isDark ? "bg-slate-800 text-slate-500" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <HospitalBedIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Bed Ready for Admission
                  </h4>
                  <p className={`text-xs max-w-xs mx-auto mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    This bed is currently disinfected and ready in {selectedBed.ward}.
                  </p>
                </div>
                <Link
                  href="/dashboard/beds"
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shadow-md cursor-pointer"
                >
                  <HospitalBedIcon className="w-4 h-4" />
                  <span>Open Bed Grid Intake &rarr;</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Command Palette Modal (Ctrl+K) */}
      {isCommandOpen && (
        <div
          className={`fixed inset-0 z-50 backdrop-blur-sm flex items-start justify-center pt-20 p-4 ${
            isDark ? "bg-slate-950/80" : "bg-slate-900/40"
          }`}
        >
          <div
            className={`max-w-lg w-full rounded-2xl border shadow-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 ${
              isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="Search stations, beds (e.g. Bed A-01), patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl text-sm focus:outline-none border ${
                  isDark
                    ? "bg-slate-950 border-slate-800 text-white focus:border-cyan-500"
                    : "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500 focus:bg-white"
                }`}
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                className={`absolute right-3 top-3 text-xs ${isDark ? "text-slate-500 hover:text-white" : "text-slate-400 hover:text-slate-900"}`}
              >
                ESC
              </button>
            </div>

            <div className={`text-[11px] font-mono px-1 ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              Quick Hospital Workstation Commands
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {[
                { label: "Facility Command Center", url: "/dashboard/facility", icon: ShieldCrossIcon },
                { label: "Nurse Bedside Rounds", url: "/dashboard/nurse", icon: ThermometerIcon },
                { label: "Doctor Clinical Visits", url: "/dashboard/doctor", icon: StethoscopeIcon },
                { label: "Interactive Bed Grid", url: "/dashboard/beds", icon: HospitalBedIcon },
                { label: "Discharge Release Queue", url: "/dashboard/discharge-queue", icon: DischargeDoorIcon },
                { label: "Admission Waitlist", url: "/dashboard/waitlist", icon: ClipboardCheckIcon },
                { label: "Cohort & Trend Analytics", url: "/dashboard/analytics", icon: AnalyticsBarIcon },
              ].map((cmd) => {
                const CmdIcon = cmd.icon;
                return (
                  <Link
                    key={cmd.url}
                    href={cmd.url}
                    onClick={() => setIsCommandOpen(false)}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition min-h-[44px] ${
                      isDark
                        ? "hover:bg-slate-800 text-slate-200"
                        : "hover:bg-slate-100 text-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <CmdIcon className={`w-4 h-4 ${isDark ? "text-cyan-400" : "text-sky-600"}`} />
                      <span>{cmd.label}</span>
                    </span>
                    <span className={`text-[10px] font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      Jump &rarr;
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bedside Fast PIN Switch Modal */}
      <PinLockModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onUserSwitched={(user) => {
          setActiveStaff(`${user.displayName} (${user.roles[0]?.replace("_", " ").toUpperCase()})`);
          showToast(`Switched bedside active staff to ${user.displayName}.`);
          soundFx.playChime();
        }}
      />
    </div>
  );
}
