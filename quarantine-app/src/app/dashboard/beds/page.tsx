/**
 * Bed Grid Page — Visual Spatial Layout & Admissions Management
 * TRD §6.1, V1-§4.1, V1-§5.6
 *
 * Route: /dashboard/beds
 * Access: nurse, doctor, admin_staff, facility_head
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClinicalHeader } from "@/components/ClinicalHeader";
import { BedCard } from "@/components/beds/BedCard";
import { AdmitPatientModal } from "@/components/admissions/AdmitPatientModal";

interface BedStatus {
  bedId: string;
  bedLabel: string;
  wardId: string;
  wardName: string;
  isOccupied: boolean;
  admissionId: string | null;
  patientNameEnc: string | null;
}

interface Capacity {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  waitlistCount: number;
  occupancyPct: number;
}

interface Ward {
  id: string;
  name: string;
}

export default function BedsPage() {
  const [beds, setBeds] = useState<BedStatus[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [activeWardId, setActiveWardId] = useState<string | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [showAdmitModal, setShowAdmitModal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBeds = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeWardId) params.set("wardId", activeWardId);

      const res = await fetch(`/api/v1/beds?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setBeds(data.data || []);
      setCapacity(data.capacity || null);
      setError(null);

      if (wards.length === 0 && data.data?.length > 0) {
        const wardMap = new Map<string, string>();
        for (const bed of data.data as BedStatus[]) {
          wardMap.set(bed.wardId, bed.wardName);
        }
        setWards(Array.from(wardMap.entries()).map(([id, name]) => ({ id, name })));
      }
    } catch (err) {
      setError("Failed to load bed data. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, [activeWardId, wards.length]);

  useEffect(() => {
    fetchBeds();
    const interval = setInterval(fetchBeds, 25_000);
    return () => clearInterval(interval);
  }, [fetchBeds]);

  const handleBedClick = (bedId: string, isOccupied: boolean) => {
    if (!isOccupied) {
      setSelectedBedId(bedId);
      setShowAdmitModal(true);
    }
  };

  const handleAdmitSuccess = () => {
    setShowAdmitModal(false);
    setSelectedBedId(null);
    fetchBeds();
  };

  const filteredBeds = activeWardId
    ? beds.filter((b) => b.wardId === activeWardId)
    : beds;

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <ClinicalHeader activeStation="/dashboard/beds" />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchBeds} className="underline hover:text-red-800 dark:hover:text-red-200">Retry</button>
          </div>
        )}

        {/* Capacity Summary Bar */}
        {capacity && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Occupied Beds</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">{capacity.occupiedBeds}</span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">/ {capacity.totalBeds} total</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Available Beds</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{capacity.availableBeds}</span>
                <span className="text-xs text-slate-500">ready for intake</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Occupancy Rate</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                  {Math.round(capacity.occupancyPct > 1 ? capacity.occupancyPct : capacity.occupancyPct * 100)}%
                </span>
                <span className="text-xs text-slate-500">saturation</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Waitlist Queue</span>
                <div className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono tabular-nums mt-1">{capacity.waitlistCount}</div>
              </div>
              <Link
                href="/dashboard/waitlist"
                className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 text-xs font-semibold transition-colors"
              >
                View &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Toolbar: Wards Filter & Admit Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          {/* Ward Segmented Filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
            <button
              onClick={() => setActiveWardId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeWardId === null
                  ? "bg-slate-800 dark:bg-slate-800 text-white shadow-xs border border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              All Wards
            </button>
            {wards.map((ward) => (
              <button
                key={ward.id}
                onClick={() => setActiveWardId(ward.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeWardId === ward.id
                    ? "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {ward.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedBedId(null);
                setShowAdmitModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span>
              <span>Admit Patient</span>
            </button>
          </div>
        </div>

        {/* Bed Grid Matrix */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>
              Showing <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">{filteredBeds.length}</strong> isolation beds
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500 dark:bg-rose-400" />
                Occupied
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                Available
              </span>
            </div>
          </div>

          {isLoading && beds.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse shadow-xs" />
              ))}
            </div>
          ) : filteredBeds.length === 0 ? (
            <div className="py-20 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40">
              <p className="text-slate-500 dark:text-slate-400 text-sm">No beds found in this ward view.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredBeds.map((bed) => (
                <BedCard
                  key={bed.bedId}
                  bed={bed}
                  onClick={() => handleBedClick(bed.bedId, bed.isOccupied)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Admit Patient Modal */}
      {showAdmitModal && (
        <AdmitPatientModal
          defaultBedId={selectedBedId}
          onClose={() => {
            setShowAdmitModal(false);
            setSelectedBedId(null);
          }}
          onSuccess={handleAdmitSuccess}
        />
      )}
    </div>
  );
}
