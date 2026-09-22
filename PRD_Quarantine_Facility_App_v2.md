# Product Requirements Document
## Quarantine & Treatment Facility Management App — Version 2

**Document owner:** Technical Product Manager
**Status:** Draft for Engineering Review
**Version:** 2.0
**Depends on:** v1 (core temperature tracking, roles, discharge workflow, audit trail) — assumed live in production

---

## 1. Background

v1 solved the facility's core coordination crisis: nurses/doctors now have a reliable system of record for temperature checks, visits, and discharge eligibility, and leadership has basic visibility into occupancy and mortality rate.

With the operational fire put out, v2 focuses on **efficiency at scale, clinical depth, and expansion readiness** — closing gaps that weren't urgent for a single-ward MVP but matter as the facility (or a network of facilities) grows and as clinical needs deepen beyond fever tracking.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Reduce staff response latency to eligibility/task events | Median time from event (e.g., discharge-eligible) to staff action | <30 min, down from hours |
| Enable structured treatment tracking, not just notes | % of patients with structured medication/treatment records | >90% |
| Support facility growth beyond one ward/site | # of facilities/wards supported per deployment | Configurable, no code changes needed |
| Improve family/patient communication without extra staff burden | % of discharge-eligible patients with family notified automatically | >95% |
| Catch outcome/quality issues earlier | Time-to-detect abnormal readmission or mortality trend | Same-day, via analytics alerting |
| Reduce manual data entry from external labs | % of lab results auto-ingested vs. manually typed | >80% |

**Non-goals (still out of scope for v2):** Billing/insurance integration, full EHR replacement, telemedicine/video consults, public patient portal (self-service beyond status view).

---

## 3. New/Updated User Roles

v1 roles (Nurse, Doctor, Admin, Facility Head, System Admin) carry forward unchanged. v2 adds:

| Role | Core Responsibility | Key Permissions |
|---|---|---|
| **Pharmacist / Treatment Coordinator** *(optional, config-driven)* | Manage medication orders tied to doctor treatment plans | View/enter medication orders; cannot alter clinical diagnosis or discharge status |
| **Regional/Network Admin** | Oversee multiple facilities in a multi-site deployment | Cross-facility dashboards; cannot access patient-level clinical data outside permission scope |
| **Family Contact (view-only, external)** | Receive status updates on a specific patient | Read-only status view (admitted / stable / discharge-eligible / discharged) via secure link or SMS — no clinical detail |

---

## 4. Functional Requirements

### 4.1 Push Notifications & Real-Time Alerts
- Nurses/doctors receive push notifications for: assigned tasks due today, overdue tasks, patient flagged discharge-eligible.
- Admin receives notification the moment a doctor approves a discharge (replacing today's dashboard-polling pattern).
- Facility Head receives alert notifications (not just dashboard visibility) when mortality rate crosses threshold, or occupancy nears capacity (e.g., ≥90%).
- Configurable per-role notification preferences (push, SMS, in-app only) with quiet hours support for shift workers.

### 4.2 Treatment & Medication Tracking Module
- Doctors can create structured treatment plans (medication, dosage, frequency, start/end date) tied to a patient record, in addition to free-text visit notes.
- Nurses can log medication administration against the plan (administered / missed / refused), separate from temperature logging.
- System flags missed doses and overdue administration windows.
- Treatment history becomes part of the patient's permanent record, viewable by doctors on future visits.
- Optional Pharmacist role can review/verify medication orders before administration (configurable per facility policy).

### 4.3 Multi-Facility / Multi-Ward Support
- Facility becomes a first-class entity in the data model; beds, staff, and patients are scoped to a facility/ward.
- Bed capacity (the "74" constant from v1) becomes fully configurable per facility, with support for sub-units (e.g., wards within a facility).
- Regional Admin role can view aggregated metrics (occupancy, mortality, throughput) across facilities without drilling into individual patient data unless explicitly authorized.
- Staff accounts can be scoped to one or multiple facilities depending on role.

### 4.4 Patient/Family-Facing Status View
- On admission, admin can optionally register a family contact (phone/email).
- Family contact receives a secure, no-login status link showing only: admission date, current high-level status (Stable / Under Observation / Discharge-Eligible / Discharged), and discharge notification.
- No clinical detail (temperatures, treatment, diagnosis) is exposed — this view is explicitly status-only to avoid PHI-equivalent exposure without proper consent/authentication.
- Automated discharge notification to family contact when admin executes discharge.

### 4.5 Advanced Analytics & Reporting
- Readmission tracking: flag and report patients readmitted within a configurable window (e.g., 14 days) post-discharge, as a quality signal.
- Staff performance/workload views (e.g., tasks completed per shift) for operational planning — explicitly framed as workload/capacity insight, not individual punitive scoring, to avoid perverse incentives around care shortcuts.
- Trend dashboards: mortality rate, average length of stay, and occupancy over time (weekly/monthly), with export (CSV/PDF) for regulatory or board reporting.
- Cohort views: outcome breakdowns by admission week, to spot whether treatment protocol changes are improving outcomes.

### 4.6 Lab & External System Integration
- API-based ingestion of lab results (e.g., test confirmations) into the patient record, reducing manual transcription.
- Integration layer designed against a standard health data format (e.g., HL7/FHIR-compatible where feasible) to ease future EHR interoperability, even though full EHR integration remains out of scope.
- Manual entry remains available as fallback for facilities without compatible lab systems.

---

## 5. Key Business Logic & Edge Cases (New in v2)

1. **Notification delivery guarantees:** Critical alerts (discharge-eligible, mortality threshold breach) must have in-app fallback if push/SMS delivery fails — never silently drop a clinical alert.
2. **Medication conflicts:** System should flag (not block) potential scheduling conflicts (e.g., overlapping medication windows) for doctor review, not auto-resolve clinically.
3. **Multi-facility data isolation:** A staff member scoped to Facility A must never see Facility B's patient-level data, even if both are visible in aggregate to a Regional Admin — enforced at the query/authorization layer, not just UI hiding.
4. **Family view consent:** Family status view requires explicit consent captured at admission (or from the patient/guardian); the link must be revocable by admin at any time.
5. **Readmission window logic:** A "readmission" only counts if the same patient identity is admitted again within the configured window — requires reliable patient identity matching (not just name-based) to avoid false positives/negatives.
6. **Lab result ingestion failures:** If an inbound lab result fails to map to an existing patient record, it must queue for manual review rather than being silently discarded or mismatched.
7. **Cross-facility bed capacity:** Each facility/ward enforces its own capacity independently; a Regional Admin cannot override a single facility's hard capacity limit from the aggregate view.
8. **Deprecation/backward compatibility:** All v2 features must be additive to v1's data model — existing v1 patient records, audit logs, and role permissions must remain valid and unaffected by the migration.

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Interoperability** | Lab/EHR integration layer should follow HL7/FHIR-compatible standards where feasible, to ease future integrations |
| **Data privacy (family view)** | Family-facing links must be time-limited, revocable, and expose no PHI-equivalent beyond high-level status |
| **Multi-tenancy security** | Strict facility-level data isolation enforced server-side; regular access-control audits |
| **Notification infra** | Push/SMS delivery must degrade gracefully (in-app fallback) and be rate-limited to avoid alert fatigue |
| **Scalability** | Data model and infra must support N facilities without architectural rework beyond config |
| **Analytics performance** | Trend/cohort dashboards should compute over rolling windows efficiently (pre-aggregated where needed) even as historical data grows |
| **Backward compatibility** | Zero-downtime migration path from v1 schema; no disruption to in-progress v1 workflows during rollout |

---

## 7. Release Plan (Phased within v2)

**Phase 2a (highest leverage, lowest new-infra cost):**
Push notifications & real-time alerts, advanced analytics/trend dashboards.

**Phase 2b:**
Treatment & medication tracking module.

**Phase 2c (requires more infra investment):**
Multi-facility/multi-ward support, Regional Admin role.

**Phase 2d:**
Patient/family-facing status view, lab/external system integration.

*Sequencing rationale:* Phases 2a/2b deliver clinical and operational value on the existing single-facility footprint; 2c is a structural change best done once the single-facility product is stable; 2d introduces external-facing surfaces (family, third-party labs) and should follow once internal multi-facility architecture is proven.

---

## 8. Open Questions for Stakeholders

1. Is multi-facility support driven by actual near-term expansion plans, or is it purely future-proofing — this affects Phase 2c prioritization.
2. What consent/legal framework governs the family-facing status view in the relevant jurisdiction?
3. Which lab systems (if any) does the facility currently use, and do they expose an API or only manual reports?
4. Should staff workload analytics be visible to staff themselves, or only to Facility Head/management?
5. What readmission window is clinically meaningful for this specific virus (14 days? 30 days?) — needs clinical input, not just a product default.
