# Product Requirements Document
## Quarantine & Treatment Facility Management App

**Document owner:** Technical Product Manager
**Status:** Draft for Engineering Review
**Version:** 1.0

---

## 1. Background & Problem Statement

The facility operates at full occupancy (74 beds) treating patients for a virus with a 15% mortality rate. Patients are considered cured after 3 consecutive fever-free days. Today, the entire workflow is paper-based:

- Nurses log temperatures in a shared journal, with no record of who has/hasn't been measured on a given day.
- Doctors review journals to decide treatment and manually track the "3-day no-fever" rule.
- Doctors verbally/manually inform admin staff of discharges.
- There is no system of record for who measured what, when, or who visited whom.

**Consequences:**
- Duplicate or missed temperature checks
- Doctors visiting patients before vitals are recorded, wasting clinical time
- Delayed discharges due to missed communication, keeping beds occupied longer than necessary
- No visibility into mortality rate vs. the 85% survival benchmark, so quality issues can't be caught early

**Core product objective:** Remove the coordination gap between Nurses, Doctors, and Admin, automate the discharge-eligibility calculation, and give facility leadership real-time visibility into throughput and outcomes — so the facility can treat more patients, faster, more safely.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Eliminate duplicate/missed temperature checks | % of patients with exactly 1 temp log/day | >95% |
| Reduce doctor time wasted on vitals-taking | # of doctor visits logged before a same-day temp exists | ~0 (blocked by system) |
| Reduce discharge delay | Avg. hours between discharge-eligibility and actual discharge | <4 hrs (from current multi-day lag) |
| Increase bed turnover | Avg. patient length-of-stay | Decrease vs. baseline |
| Track quality of care | Real-time facility mortality rate vs. 85% survival benchmark | Visible on dashboard, alertable |
| System reliability | Uptime | 99.9% |

**Non-goals (v1):** Billing/insurance, multi-facility support, patient-facing app, treatment/medication ordering logic beyond doctor notes, lab integration.

---

## 3. User Roles & Permissions

| Role | Core Responsibility | Key Permissions |
|---|---|---|
| **Nurse** | Record daily temperature; general patient care logging | Add/edit own temp entries (same-day only); view assigned patients; cannot mark discharge |
| **Doctor** | Clinical review, treatment decisions, discharge sign-off | View patient history & fever-streak; log visit notes/treatment; approve discharge; cannot log a temp check |
| **Admin Staff** | Bed & intake management, discharge execution | Admit/discharge patients (post-doctor approval); manage bed assignment; view task-completion status; cannot enter clinical data |
| **Facility Head / Quality Lead** | Oversight of outcomes and operations | Read-only dashboards: mortality rate, occupancy, SLA breaches, staff task completion; receives alerts |
| **System Admin (IT)** | User & access management | Create/deactivate accounts, assign roles, audit logs |

---

## 4. Functional Requirements (v1 — MVP)

### 4.1 Patient Intake & Bed Management (Admin)
- Admit a new patient only if occupied beds < 74; system blocks admission at full capacity and surfaces a waitlist.
- Assign bed/room number on admission.
- Auto-release bed on discharge.

### 4.2 Daily Temperature Logging (Nurse)
- Nurse sees a daily task list of assigned patients with clear status: **Not yet measured today / Measured**.
- Logging a temperature requires: value, timestamp (auto), nurse ID (auto).
- If a temperature is already logged today for that patient, system warns "already logged today — confirm re-entry?" rather than silently allowing duplicates; the original entry is preserved (append, not overwrite), with the latest value used for clinical calculations.
- Fever threshold configurable (e.g., ≥100.4°F / 38°C) — auto-flags "fever" or "no fever" against the entry.

### 4.3 Doctor Visit & Review (Doctor)
- Doctor's daily list shows patients still needing a visit, sorted by priority (e.g., fever days, unmeasured flag).
- **System should discourage — not silently allow — a doctor initiating a "visit" for a patient with no temperature logged today.** Show a warning: "No temperature recorded today for this patient — recommend nurse measurement first," with an option to proceed anyway (e.g., in urgent cases) which is logged as an exception.
- Doctor can add visit notes, update treatment, and see a running **fever-free streak counter** per patient, auto-calculated from logged temps.
- Streak resets to 0 automatically the moment a fever is logged; 3 consecutive fever-free calendar days auto-flags the patient as **"Discharge Eligible."**

### 4.4 Discharge Workflow
- Once a patient is marked "Discharge Eligible," the doctor must actively confirm/approve discharge (system does not auto-discharge without clinical sign-off, since edge cases like relapse risk exist).
- On doctor approval, Admin gets a real-time notification/queue item to execute discharge and free the bed.
- Discharge action is logged with timestamp, approving doctor, and executing admin staff member.

### 4.5 Mortality/Outcome Tracking
- Admin/clinical staff can log a patient outcome: **Discharged (cured) / Deceased / Transferred**.
- System computes live mortality rate = deceased / (discharged + deceased), excluding still-admitted patients.
- Dashboard alert triggers if mortality rate trends above 15% (configurable threshold), visible to Facility Head.

### 4.6 Dashboards & Reporting
- **Facility Head view:** occupancy (current/max 74), mortality rate vs. 85% benchmark, avg. length of stay, daily task-completion rate (% patients measured/visited).
- **Admin view:** today's discharge queue, bed availability, intake waitlist.
- **Doctor/Nurse view:** personal task list for the day, completion status.

### 4.7 Audit Trail
- Every temperature log, visit, discharge approval, and outcome entry is immutable and timestamped with the acting user — needed for both clinical safety and accountability given the current "no one knows who did what" problem.

---

## 5. Key Business Logic & Edge Cases (for engineering)

These are constraints not visible on screen mockups but required for correct behavior:

1. **Duplicate temp entries:** Never overwrite; always append with timestamp. Clinical calculations (fever streak) use the latest reading of the day, but audit trail retains all entries.
2. **Doctor-before-nurse ordering:** Not hard-blocked (clinical urgency may require it), but flagged and logged as an exception with a mandatory reason field.
3. **Fever-streak reset logic:** Any single fever reading on a calendar day resets the streak to 0, even if earlier readings that day were normal — patient safety takes precedence over convenience.
4. **Time zone/day boundary:** "Day" is defined by facility-local midnight, not a rolling 24-hour window, to keep nurse/doctor daily task lists unambiguous.
5. **Discharge requires explicit doctor approval** even after auto-eligibility — system flags, humans decide, per the original requirement ("doctor informs admin... based on 3-day no-fever criterion").
6. **Full occupancy handling:** At 74/74, new admissions are blocked with a clear error and routed to a waitlist queue; system does not allow silent overbooking.
7. **Role-based write restrictions:** Nurses cannot edit doctor notes; doctors cannot log temperatures (prevents workflow shortcuts that reintroduce the original chaos); admin cannot alter clinical data, only execute discharge/admission logistics.
8. **Mortality alerting:** Threshold-based alert (e.g., rolling 7/30-day mortality rate) to avoid false alarms from small sample noise early in facility operation.
9. **Data correction:** Any correction to a logged temperature or outcome requires a reason code and is logged as an amendment, never a silent overwrite (audit integrity).
10. **Offline/connectivity resilience:** Given clinical settings often have poor connectivity, nurse/doctor logging should queue locally and sync when back online, to avoid lost entries.

---

## 6. Non-Functional Requirements (Production Readiness)

| Category | Requirement |
|---|---|
| **Availability** | 99.9% uptime target; app must be usable in a clinical setting with degraded connectivity (offline-first logging with sync) |
| **Data integrity** | All clinical entries immutable/append-only with full audit trail; no hard deletes |
| **Security & Privacy** | Patient health data (PHI-equivalent) encrypted at rest and in transit; role-based access control enforced server-side, not just UI-side; access logs retained |
| **Compliance** | Design with HIPAA-equivalent (or local health data regulation) principles in mind: least-privilege access, audit logging, data retention policy |
| **Performance** | Task lists and dashboards load in <2s at full 74-patient occupancy |
| **Scalability** | Architecture should not hard-code the 74-bed limit — configurable capacity for future facility expansion |
| **Auditability** | Every write action (log, visit, discharge, outcome) attributable to a user and timestamp |
| **Usability** | Optimized for fast entry on shared/shift-based devices (tablets at bedside); minimal taps to log a temperature |
| **Monitoring** | Error tracking, uptime monitoring, and alerting for the engineering team; alerting for mortality-rate threshold breaches for clinical leadership |

---

## 7. Release Plan

**v1 (MVP — this PRD's scope):**
Roles & auth, temperature logging, doctor visit + discharge-eligibility logic, discharge workflow, admission/bed management, basic dashboards, audit trail.

**v2 (nice-to-have, deferred):**
- Push notifications (e.g., "your patient is discharge-eligible")
- Treatment/medication tracking module
- Multi-facility / multi-ward support
- Patient/family-facing status view
- Advanced analytics (readmission trends, staff performance)
- Integration with lab systems

---

## 8. Open Questions for Stakeholders

1. What is the exact fever threshold to use for auto-flagging (facility-specific vs. clinical standard)?
2. Should the "3-day no-fever" rule require consecutive calendar days or a rolling 72-hour window?
3. What's the acceptable exception process when a doctor must visit before a nurse has measured (urgent cases)?
4. What data retention period is required for audit logs / compliance?
5. Is there an existing EHR or hospital system this needs to integrate with, now or later?
