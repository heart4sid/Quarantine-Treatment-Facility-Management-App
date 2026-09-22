# DECISIONS.md
## Quarantine & Treatment Facility Management App

This file is the authoritative record of every ambiguous requirement, design choice, and clinical decision made during implementation. All entries must be confirmed by a clinical or product stakeholder before the relevant milestone begins.

**Status key:** `PENDING` = awaiting sign-off | `CONFIRMED` = approved | `OVERRIDDEN` = default replaced by stakeholder decision

---

## Clinical Rules — Requires Clinical Lead Sign-Off

### G1 — Fever day definition (PENDING clinical sign-off)

**Gap:** PRD v1 §4.2 states the "latest value" of the day is used for calculations. PRD v1 §5.3 states "any single fever reading on a calendar day resets the streak." These conflict.

**TRD default (implemented unless overridden):**  
Any **effective** temperature reading ≥ `fever_threshold_c` on a calendar day makes that day a **fever day**, regardless of other readings that day.

A reading is "effective" if it has not been superseded by an amendment. Erroneous readings are corrected via the amendment workflow (new row with `amends_id` + reason code), not by simply entering a lower value.

**Rationale:** Patient safety takes precedence. An incorrectly high reading should be challenged through an auditable amendment, not silently overridden by a later "better" reading.

**Config value:** None needed — this is a hard rule. The amendment workflow is the escape hatch.

**Clinical sign-off required:** Does the clinical lead agree that any fever reading (before amendment) makes the day a fever day?

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G2 — Unmeasured day streak behavior + calendar vs. rolling window (PENDING clinical sign-off)

**Gap:** PRD v1 §4.3 says "3 consecutive fever-free calendar days." PRD v1 §8.2 asks whether this means calendar days or a rolling 72-hour window. Neither document specifies what happens when a day has no temperature logged.

**TRD default (implemented unless overridden):**  
- **Calendar days** (facility-local date, using `facilities.timezone`).
- A day with **no effective temperature reading breaks the streak** — except today before the first measurement of the day, which is treated as neutral (streak computation skips today if no reading yet).
- Config value `streak_mode` is reserved for a future `rolling_72h` option but is not implemented in v1.

**Rationale:** An unmeasured day means clinical uncertainty, not confirmed health. Breaking the streak on unmeasured days is the safe default.

**Config value:** `facilities.settings.discharge_streak_days` (default: 3). `streak_mode` reserved.

**Clinical sign-off required:** Confirm calendar-day counting. Confirm that unmeasured past days should break the streak.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G3 — Fever logged after doctor approval but before admin executes discharge (PENDING clinical sign-off)

**Gap:** PRD does not specify what happens when a new fever is logged between discharge approval and execution.

**TRD default (implemented unless overridden):**  
1. On every temperature write: eligibility is recomputed.
2. If eligibility flips from eligible → not eligible AND an unexecuted discharge approval exists: the approval is **automatically voided** (a `voided_at` + `void_reason` is set on the `discharge_approvals` row; an audit log entry is written).
3. When Admin attempts to execute a voided approval: API returns `409 ELIGIBILITY_CHANGED` and the UI prompts the doctor to re-review.
4. Doctor must create a new approval.

**Rationale:** Clinical safety; a patient who has relapsed should not be discharged without fresh clinical review.

**Clinical sign-off required:** Confirm auto-void on fever-after-approval.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G4 — Family status view for deceased or transferred patients (PENDING clinical sign-off)

**Gap:** PRD v2 §4.4 defines family status as: Admitted / Stable / Discharge-Eligible / Discharged. It does not define statuses for deceased or transferred outcomes.

**TRD default (implemented unless overridden):**  
When a patient's outcome is DECEASED or TRANSFERRED, the family status page shows a **neutral message**: "Please contact the facility directly for further information." The page does **not** automatically update to a death/transfer status and does **not** send an automated notification.

**Rationale:** Death and transfer notifications require human sensitivity, local cultural/legal norms, and clinical judgment about who is notified and how. Automating this creates significant legal and ethical risk.

**Config value:** None. This is a hard rule; automated death/transfer notifications are out of scope.

**Clinical sign-off required:** Confirm neutral message approach for deceased/transferred.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G5 — Who can record DECEASED/TRANSFERRED outcomes (PENDING clinical sign-off)

**Gap:** PRD v1 §4.5 says "Admin/clinical staff can log a patient outcome." PRD v1 §3 says "Admin cannot enter clinical data." These conflict.

**TRD default (implemented unless overridden):**  
- **DECEASED and TRANSFERRED** outcomes: **Doctor role only.**
- **DISCHARGED_CURED**: Set automatically by the discharge execution transaction (Admin executes, outcome is set by the system, not manually entered).

**Rationale:** Death and transfer are clinical determinations, not administrative ones. The PRD §3 restriction on Admin clinical data entry is the more specific rule and takes precedence.

**Config value:** Authorization matrix in `/server/authz/matrix.ts`.

**Clinical sign-off required:** Confirm Doctor-only for DECEASED/TRANSFERRED.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G9 — Mortality alert threshold sensitivity at small sample sizes (PENDING clinical sign-off)

**Gap:** PRD v1 §4.5 sets the mortality alert threshold at >15% (i.e., the expected rate). This will produce false alerts early in facility operation when sample sizes are very small (e.g., 2 deaths out of 5 outcomes = 40% — almost certainly noise).

**TRD default (implemented unless overridden):**  
- Alert fires only when `(DISCHARGED_CURED + DECEASED) >= mortality_alert_min_sample` **AND** rate > `mortality_alert_threshold`.
- Alert uses **hysteresis**: once fired, it will not re-fire until the rate drops below `mortality_alert_threshold - 0.02` (i.e., 2 percentage points below the threshold) and then crosses again.
- Config values in `facilities.settings`:
  - `mortality_alert_threshold`: default `0.15` (15%)
  - `mortality_alert_min_sample`: default `10` closed outcomes
  - `mortality_window_days`: `7` and `30` (both computed; alert fires on either)

**Clinical sign-off required:** Confirm minimum sample size default of 10. Confirm hysteresis of 2 percentage points. Confirm rolling window durations.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G10 — Nurse amendment scope (PENDING clinical sign-off)

**Gap:** PRD v1 §3 says nurses can "add/edit own temp entries (same-day only)." PRD v1 §5.9 says "any correction to a logged temperature requires a reason code and is logged as an amendment."

**TRD default (implemented unless overridden):**  
Both rules apply simultaneously:
- **Nurse**: Can amend **own** temperature readings only, **same calendar day** only, with a mandatory reason code. Amendments by nurses are still append-only new rows (not edits).
- **Doctor**: Can amend **any** temperature reading (any nurse, any date), with a mandatory reason code.
- **Admin/others**: Cannot amend temperature readings.

**Rationale:** Same-day, own-record amendment is a clinical error correction workflow (nurse typed wrong value). Cross-day or cross-user amendments require higher clinical authority.

**Config value:** Authorization matrix in `/server/authz/matrix.ts`.

**Clinical sign-off required:** Confirm nurse scope (own + same-day only). Confirm doctor can amend any reading.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

### G11 — Critical alerts during quiet hours (PENDING clinical sign-off)

**Gap:** PRD v2 §4.1 requires configurable quiet hours for shift workers. It does not specify whether critical alerts (discharge-eligible, mortality breach) override quiet hours.

**TRD default (implemented unless overridden):**  
- **Non-critical events** (overdue task reminders, task completion nudges): push/SMS suppressed during quiet hours.
- **Critical events** (`patient.discharge_eligible`, `mortality.threshold_breached`): always delivered in-app inbox AND to on-duty staff even during quiet hours; push/SMS still sent.

**Rationale:** A discharge-eligible patient whose notification is suppressed overnight could mean a bed stays blocked for 8+ hours. The clinical risk of suppression outweighs the nuisance of a night-time push notification.

**Config value:** `notification_prefs.quiet_hours_override_critical` (default: `false` = critical alerts always bypass quiet hours).

**Clinical sign-off required:** Confirm critical alerts always override quiet hours.

**Recorded by:** Engineering Lead  
**Date:** 2026-09-22  
**Status:** PENDING

---

## Product/Operational Decisions — Requires Product/Stakeholder Input

### G6 — Patient assignment and shift model (CONFIRMED by TRD)

**Gap:** PRD v1 §4.2 references "assigned patients" and §4.6 references "per-shift task completion." Neither the v1 nor v2 PRD defines a shift/assignment data model.

**Decision:** Added `shifts(facility_id, name, start_time, end_time)` and `patient_assignments(admission_id, user_id, shift_date, shift_id)` tables. Patient assignment is an **Admin function** in the UI.

**Recorded by:** Engineering Lead (per TRD §5.3, G6)  
**Date:** 2026-09-22  
**Status:** CONFIRMED

---

### G7 — Waitlist ordering and bed-freed behavior (CONFIRMED by TRD)

**Gap:** PRD v1 §4.1 mentions "surfaces a waitlist" but does not define ordering or what happens when a bed frees up.

**Decision:**  
- Waitlist is **FIFO with optional priority** (`priority` column on `waitlist_entries`).
- When a bed frees up via discharge/transfer/death: `bed.available` event is emitted, notifying Admin with the next waitlisted entry.
- Admission from the waitlist remains a **manual Admin action** — the system suggests, humans confirm.

**Recorded by:** Engineering Lead (per TRD §6.4, G7)  
**Date:** 2026-09-22  
**Status:** CONFIRMED

---

### G8 — Multi-facility data model from day one (CONFIRMED by TRD)

**Gap:** PRD v1 lists multi-facility as a non-goal. PRD v2 §4.3 adds it. Adding `facility_id` later is a risky migration.

**Decision:** `facility_id` is added to every tenant table from v1 day one. RLS is enabled with a single facility in v1. v2c adds multi-facility scopes and the Regional Admin role — no schema migration risk.

**Recorded by:** Engineering Lead (per TRD §2, G8)  
**Date:** 2026-09-22  
**Status:** CONFIRMED

---

## Infrastructure Decisions

### INF-1 — Temperature storage unit (CONFIRMED)
Temperatures are stored in **°C** canonically. Display unit is a per-facility setting (`facilities.settings.display_unit`, default `C`). The UI converts to °F for display if configured.

### INF-2 — "Day" boundary definition (CONFIRMED)
`local_date` is computed at insert time as `(recorded_at AT TIME ZONE facilities.timezone)::date`. All "today" queries use `local_date`. Facility timezone cannot be changed after go-live without a migration script.

### INF-3 — Primary keys (CONFIRMED)
UUIDv7 (time-ordered). Generated client-side for offline records so that `client_uuid` can be stored as the idempotency key before server confirmation.

### INF-4 — Stage 0 / Stage 1 (CONFIRMED)
Stage 0 = synthetic data only on Vercel Hobby + Neon Free. Real patient data requires Stage 1 (paid Vercel, HIPAA BAA or equivalent, legal sign-off). This is noted in the README and app banner.

### INF-5 — Neon compute risk (CONFIRMED)
100 CU-h/month free limit is likely exceeded in 24×7 operation (~120 CU-h estimated). Mitigation: polling strategies (30s visible / 2-5 min hidden, ETag 304); usage alert at 70% quota; Neon Launch (~$19/month) as first upgrade trigger.

### INF-6 — Auth library choice (PENDING)
Awaiting stakeholder preference between Auth.js and Better Auth. Default: **Better Auth** (more built-in support for custom session tables, passkeys, and MFA without plugins). Will be changed if Auth.js is preferred.

### INF-7 — SMS (CONFIRMED off for Stage 0)
SMS is feature-flagged off. The adapter interface is implemented; provider is TBD (paid, not free anywhere). Feature flag: `feature_flags(facility_id, key='sms', enabled=false)`.

---

## Open Stakeholder Questions (awaiting answers)

| # | Question | Needed for |
|---|---|---|
| OQ1 | Jurisdiction / legal regime for patient data | Stage 1 planning, vendor selection |
| OQ2 | Vercel non-commercial provision eligibility | Stage 1 timeline |
| OQ3 | Unique patient identifier (national ID, MRN, other) | Readmission matching (v2), lab mapping (v2d) |
| OQ4 | Device fleet: tablets + OS versions | PWA/offline behavior, iOS Web Push requirements |
| OQ5 | Staff count, shift pattern, peak concurrency | Validates Neon compute budget |
| OQ6 | Retention period for audit logs and clinical records | Archival design |
| OQ7 | Staff workload analytics: visible to staff or management-only? | API scoping for v2a analytics |
| OQ8 | Preferred SMS provider | v2 SMS channel enablement |
| OQ9 | Lab system capabilities (HTTPS/FHIR, or HL7 v2/MLLP only) | v2d integration scope |
| OQ10 | Clinically meaningful readmission window (14 days? 30 days?) | v2 readmission tracking |
