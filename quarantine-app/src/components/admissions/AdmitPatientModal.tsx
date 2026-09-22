/**
 * AdmitPatientModal — slide-in form for admitting a new or existing patient.
 * TRD §6.1, V1-§4.1
 *
 * Three-step flow:
 *   1. Choose: New patient | Existing patient (by search/ID)
 *   2. Fill patient details + select bed
 *   3. Confirm & submit → POST /api/v1/admissions
 *
 * On AT_CAPACITY (409): shows "Added to waitlist" confirmation.
 */

"use client";

import { useState, useEffect, useId } from "react";
import { randomUUID } from "crypto";

type Step = "choose" | "new-patient" | "existing-patient" | "confirm" | "success" | "waitlisted";

interface AvailableBed {
  bedId: string;
  bedLabel: string;
  wardName: string;
}

interface AdmitPatientModalProps {
  /** Pre-selected bed (when user clicked a specific bed card) */
  defaultBedId: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

interface NewPatientForm {
  name: string;
  dateOfBirth: string;
  mrn: string;
  identityIdentifier: string;
}

const EMPTY_FORM: NewPatientForm = {
  name: "",
  dateOfBirth: "",
  mrn: "",
  identityIdentifier: "",
};

export function AdmitPatientModal({ defaultBedId, onSuccess, onClose }: AdmitPatientModalProps) {
  const [step, setStep] = useState<Step>(defaultBedId ? "new-patient" : "choose");
  const [form, setForm] = useState<NewPatientForm>(EMPTY_FORM);
  const [existingPatientId, setExistingPatientId] = useState("");
  const [bedId, setBedId] = useState(defaultBedId ?? "");
  const [availableBeds, setAvailableBeds] = useState<AvailableBed[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewPatientForm, string>>>({});
  const uid = useId();

  // Load available beds for the bed selector
  useEffect(() => {
    fetch("/api/v1/beds?available=true")
      .then((r) => r.json())
      .then((d) =>
        setAvailableBeds(
          (d.data ?? []).map((b: any) => ({
            bedId: b.bedId,
            bedLabel: b.bedLabel,
            wardName: b.wardName,
          }))
        )
      )
      .catch(() => {});
  }, []);

  function validate(): boolean {
    const errors: Partial<Record<keyof NewPatientForm, string>> = {};
    if (!form.name.trim()) errors.name = "Patient name is required";
    else if (form.name.trim().length < 2) errors.name = "Name must be at least 2 characters";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (step === "new-patient" && !validate()) return;
    if (!bedId) {
      setServerError("Please select a bed");
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const body: Record<string, unknown> = {
        bedId,
        clientUuid: crypto.randomUUID(),
      };

      if (step === "existing-patient" || step === "confirm") {
        if (existingPatientId) {
          body.patientId = existingPatientId;
        }
      } else {
        body.newPatient = {
          name: form.name.trim(),
          ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }),
          ...(form.mrn && { mrn: form.mrn }),
          ...(form.identityIdentifier && { identityIdentifier: form.identityIdentifier }),
        };
      }

      const res = await fetch("/api/v1/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.status === 201) {
        setStep("success");
        setTimeout(onSuccess, 1500);
      } else if (res.status === 409 && data.code === "AT_CAPACITY") {
        setStep("waitlisted");
      } else {
        setServerError(data.title ?? "An error occurred. Please try again.");
      }
    } catch {
      setServerError("Network error — please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="
        relative w-full sm:max-w-lg bg-slate-900 border border-slate-700
        rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/50
        animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95
        duration-200
      ">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100" id={`${uid}-title`}>
            {step === "choose" && "Admit Patient"}
            {step === "new-patient" && "New Patient Intake"}
            {step === "existing-patient" && "Existing Patient"}
            {step === "success" && "Patient Admitted ✓"}
            {step === "waitlisted" && "Added to Waitlist"}
          </h2>
          <button
            id="admit-modal-close"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* ── Step: Choose ── */}
          {step === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                id="admit-new-patient-btn"
                onClick={() => setStep("new-patient")}
                className="
                  flex flex-col items-center gap-2 p-4 rounded-xl
                  border border-slate-700 hover:border-teal-500/60 hover:bg-teal-950/20
                  transition-all text-center group
                "
              >
                <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center
                  group-hover:bg-teal-500/20 transition-colors">
                  <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-200">New Patient</span>
                <span className="text-[11px] text-slate-500">Register at intake</span>
              </button>
              <button
                id="admit-existing-patient-btn"
                onClick={() => setStep("existing-patient")}
                className="
                  flex flex-col items-center gap-2 p-4 rounded-xl
                  border border-slate-700 hover:border-teal-500/60 hover:bg-teal-950/20
                  transition-all text-center group
                "
              >
                <div className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center
                  group-hover:bg-teal-500/20 transition-colors">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-teal-400 transition-colors"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-200">Existing Patient</span>
                <span className="text-[11px] text-slate-500">Readmission / transfer</span>
              </button>
            </div>
          )}

          {/* ── Step: New patient form ── */}
          {step === "new-patient" && (
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label htmlFor={`${uid}-name`} className="block text-xs font-medium text-slate-400 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  id={`${uid}-name`}
                  type="text"
                  autoFocus
                  placeholder="Patient full name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={`
                    w-full px-3 py-2 rounded-lg bg-slate-800 border text-slate-100 text-sm
                    placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50
                    ${formErrors.name ? "border-red-500/60" : "border-slate-700"}
                  `}
                />
                {formErrors.name && (
                  <p className="mt-1 text-[11px] text-red-400">{formErrors.name}</p>
                )}
              </div>

              {/* DOB */}
              <div>
                <label htmlFor={`${uid}-dob`} className="block text-xs font-medium text-slate-400 mb-1">
                  Date of Birth
                </label>
                <input
                  id={`${uid}-dob`}
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  className="
                    w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                    text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50
                  "
                />
              </div>

              {/* MRN */}
              <div>
                <label htmlFor={`${uid}-mrn`} className="block text-xs font-medium text-slate-400 mb-1">
                  Medical Record Number (MRN)
                </label>
                <input
                  id={`${uid}-mrn`}
                  type="text"
                  placeholder="Optional"
                  value={form.mrn}
                  onChange={(e) => setForm((f) => ({ ...f, mrn: e.target.value }))}
                  className="
                    w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                    text-slate-100 text-sm placeholder:text-slate-600
                    focus:outline-none focus:ring-2 focus:ring-teal-500/50
                  "
                />
              </div>

              {/* National ID (blind index) */}
              <div>
                <label htmlFor={`${uid}-identity`} className="block text-xs font-medium text-slate-400 mb-1">
                  National ID / Identifier
                  <span className="ml-1 text-slate-500">(for readmission matching)</span>
                </label>
                <input
                  id={`${uid}-identity`}
                  type="text"
                  placeholder="Optional — hashed, never stored in plaintext"
                  value={form.identityIdentifier}
                  onChange={(e) => setForm((f) => ({ ...f, identityIdentifier: e.target.value }))}
                  className="
                    w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                    text-slate-100 text-sm placeholder:text-slate-600
                    focus:outline-none focus:ring-2 focus:ring-teal-500/50
                  "
                />
              </div>
            </div>
          )}

          {/* ── Step: Existing patient ── */}
          {step === "existing-patient" && (
            <div>
              <label htmlFor={`${uid}-patient-id`} className="block text-xs font-medium text-slate-400 mb-1">
                Patient ID
              </label>
              <input
                id={`${uid}-patient-id`}
                type="text"
                autoFocus
                placeholder="Paste patient UUID or search…"
                value={existingPatientId}
                onChange={(e) => setExistingPatientId(e.target.value)}
                className="
                  w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                  text-slate-100 text-sm placeholder:text-slate-600
                  focus:outline-none focus:ring-2 focus:ring-teal-500/50 font-mono
                "
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Patient search by name is in M3. For now, paste the patient UUID from the system.
              </p>
            </div>
          )}

          {/* ── Bed selector (all steps except choose, success, waitlisted) ── */}
          {!["choose", "success", "waitlisted"].includes(step) && (
            <div>
              <label htmlFor={`${uid}-bed`} className="block text-xs font-medium text-slate-400 mb-1">
                Target Bed <span className="text-red-400">*</span>
              </label>
              <select
                id={`${uid}-bed`}
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                className="
                  w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                  text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50
                "
              >
                <option value="" disabled>Select a bed…</option>
                {availableBeds.map((b) => (
                  <option key={b.bedId} value={b.bedId}>
                    {b.wardName} — {b.bedLabel}
                  </option>
                ))}
                {availableBeds.length === 0 && (
                  <option value="" disabled>No available beds — patient will be waitlisted</option>
                )}
              </select>
            </div>
          )}

          {/* ── Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-14 h-14 rounded-full bg-teal-500/15 flex items-center justify-center
                border border-teal-500/30">
                <svg className="w-7 h-7 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-teal-400">Patient admitted successfully</p>
              <p className="text-xs text-slate-500">Refreshing bed grid…</p>
            </div>
          )}

          {/* ── Waitlisted ── */}
          {step === "waitlisted" && (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center
                border border-amber-500/30">
                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-amber-400">Facility at capacity</p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                Patient has been added to the waitlist and will be admitted when a bed becomes available.
              </p>
            </div>
          )}

          {/* Server error */}
          {serverError && (
            <div className="px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-800">
              <p className="text-sm text-red-400">{serverError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!["success", "waitlisted"].includes(step) && (
          <div className="px-6 py-4 border-t border-slate-800 flex gap-2 justify-end">
            {step !== "choose" && (
              <button
                id="admit-back-btn"
                onClick={() => setStep("choose")}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Back
              </button>
            )}
            {step !== "choose" && (
              <button
                id="admit-submit-btn"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="
                  px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400
                  text-slate-950 font-semibold text-sm transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-95 shadow-lg shadow-teal-900/30
                "
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950
                      rounded-full animate-spin" />
                    Admitting…
                  </span>
                ) : (
                  "Admit Patient"
                )}
              </button>
            )}
          </div>
        )}

        {/* Waitlisted — done button */}
        {step === "waitlisted" && (
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end">
            <button
              id="admit-done-btn"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400
                text-slate-950 font-semibold text-sm transition-all active:scale-95"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
