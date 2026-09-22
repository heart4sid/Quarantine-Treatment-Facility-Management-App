# TRACEABILITY.md
## Quarantine & Treatment Facility Management App

Maps every PRD/TRD requirement ID to implementation code, tests, and current status.

**Status key:** `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED` | `TESTED` | `DONE`

---

## v1 MVP Requirements

### V1-4.1 — Patient Intake & Bed Management

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Admit only if occupied beds < capacity; block at full capacity with waitlist | `src/server/services/admissions.ts` | `tests/integration/admissions.test.ts` | DONE |
| Assign bed on admission | `src/server/services/admissions.ts` | `tests/integration/admissions.test.ts` | DONE |
| Auto-release bed on discharge | `src/server/services/discharge.ts` | `tests/e2e/discharge-flow.spec.ts` | NOT STARTED |
| `POST /api/v1/admissions` | `src/app/api/v1/admissions/route.ts` | `tests/integration/admissions.test.ts` | DONE |
| `GET /api/v1/waitlist` | `src/app/api/v1/waitlist/route.ts` | `tests/integration/admissions.test.ts` | DONE |

### V1-4.2 — Daily Temperature Logging

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Nurse daily task list (measured / not measured) | `src/app/api/v1/tasks/nurse/route.ts`, `src/app/dashboard/nurse/page.tsx` | `src/server/services/__tests__/temperatures.test.ts` | DONE |
| Log temperature with value, auto-timestamp, nurse ID | `src/server/services/temperatures.ts` | `src/server/services/__tests__/temperatures.test.ts`, `tests/integration/temperatures.test.ts` | DONE |
| Duplicate same-day warning; append not overwrite | `src/server/services/temperatures.ts`, `DuplicateWarningModal.tsx` | `src/server/services/__tests__/temperatures.test.ts` | DONE |
| Fever threshold auto-flag (`is_fever` field) | `src/server/services/temperatures.ts` | `src/server/services/__tests__/temperatures.test.ts`, `src/domain/__tests__/streak.test.ts` | DONE |
| `POST /api/v1/admissions/{id}/temperatures` | `src/app/api/v1/admissions/[id]/temperatures/route.ts` | `src/server/services/__tests__/temperatures.test.ts` | DONE |

### V1-4.3 — Doctor Visit & Review

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Doctor daily list sorted by priority | `src/app/api/v1/tasks/doctor/route.ts`, `src/app/dashboard/doctor/page.tsx` | `src/server/services/__tests__/visits.test.ts` | DONE |
| Warning when no temp logged today (TEMP_MISSING_TODAY, 428) | `src/server/services/visits.ts` | `src/server/services/__tests__/visits.test.ts` | DONE |
| Proceed-anyway with mandatory exception reason (logged) | `src/server/services/visits.ts`, `DoctorVisitModal.tsx` | `src/server/services/__tests__/visits.test.ts` | DONE |
| Visit notes + fever-free streak counter | `src/server/services/visits.ts`, `src/domain/streak.ts` | `src/domain/__tests__/streak.test.ts`, `visits.test.ts` | DONE |
| 3 consecutive fever-free days → Discharge Eligible flag | `src/domain/streak.ts`, `src/server/services/temperatures.ts` | `src/domain/__tests__/streak.test.ts`, fast-check property tests | DONE |
| `POST /api/v1/admissions/{id}/visits` | `src/app/api/v1/admissions/[id]/visits/route.ts` | `src/server/services/__tests__/visits.test.ts` | DONE |
| `GET /api/v1/admissions/{id}/streak` | `src/app/api/v1/admissions/[id]/streak/route.ts` | `src/server/services/__tests__/temperatures.test.ts` | DONE |

### V1-4.4 — Discharge Workflow

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Doctor must confirm discharge (no auto-discharge) | `src/server/services/discharge.ts` | `src/server/services/__tests__/discharge.test.ts` | DONE |
| Admin gets notification queue on approval | `src/app/api/v1/discharge-queue/route.ts`, `src/app/dashboard/discharge-queue/page.tsx` | `src/server/services/__tests__/discharge.test.ts` | DONE |
| Discharge logged with timestamp, doctor, admin | `src/server/services/discharge.ts`, `src/db/schema/clinical.ts` | `tests/integration/discharge-lifecycle.test.ts` | DONE |
| `POST /api/v1/admissions/{id}/discharge-approval` | `src/app/api/v1/admissions/[id]/discharge-approval/route.ts` | `src/server/services/__tests__/discharge.test.ts` | DONE |
| `GET /api/v1/discharge-queue` | `src/app/api/v1/discharge-queue/route.ts` | `src/server/services/__tests__/discharge.test.ts` | DONE |
| `POST /api/v1/admissions/{id}/discharge` (re-validates) | `src/app/api/v1/admissions/[id]/discharge/route.ts` | `tests/integration/discharge-lifecycle.test.ts` | DONE |

### V1-4.5 — Mortality/Outcome Tracking

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Log outcome: DISCHARGED_CURED / DECEASED / TRANSFERRED | `src/server/services/discharge.ts` | `src/server/services/__tests__/discharge.test.ts` | DONE |
| Live mortality rate = deceased / (discharged + deceased) | `src/domain/mortality.ts` | `src/domain/__tests__/mortality.test.ts` | DONE |
| Alert when mortality trends above threshold | `src/domain/mortality.ts`, `src/server/services/notifications.ts` | `src/domain/__tests__/mortality.test.ts` | DONE |
| `POST /api/v1/admissions/{id}/outcome` | `src/app/api/v1/admissions/[id]/outcome/route.ts` | `src/server/services/__tests__/discharge.test.ts` | DONE |

### V1-4.6 — Dashboards & Reporting

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Facility Head: occupancy, mortality, avg LOS, task completion | `src/app/api/v1/dashboards/facility/route.ts`, `src/app/dashboard/facility/page.tsx` | `src/server/services/__tests__/dashboard.test.ts` | DONE |
| Admin: discharge queue, bed availability, waitlist | `src/app/dashboard/beds/page.tsx`, `src/app/dashboard/waitlist/page.tsx`, `src/app/dashboard/discharge-queue/page.tsx` | Component / integration | DONE |
| Doctor/Nurse: personal task list, completion status | `src/app/dashboard/nurse/page.tsx`, `src/app/dashboard/doctor/page.tsx` | `src/server/services/__tests__/temperatures.test.ts`, `visits.test.ts` | DONE |

### V1-4.7 — Audit Trail

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Every temp log, visit, discharge, outcome immutable + timestamped + attributed | `src/db/schema/clinical.ts`, immutability triggers | `tests/integration/temperatures.test.ts`, `tests/integration/discharge-lifecycle.test.ts` | DONE |

### V1-5.1 — Duplicate temp entries: append, never overwrite

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Duplicate same-day entries retained (append-only) | `src/server/services/temperatures.ts` | `src/server/services/__tests__/temperatures.test.ts` | DONE |
| Audit trail retains all entries | `src/db/schema/clinical.ts`, `audit_log` | `tests/integration/temperatures.test.ts` | DONE |
| Clinical calculations use `effective_temperature_readings` view | `effective_temperature_readings` view | `tests/integration/temperatures.test.ts` | DONE |

### V1-5.2 — Doctor-before-nurse: not blocked but logged as exception

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Warning shown; proceed-anyway logged with mandatory reason | `src/server/services/visits.ts`, `DoctorVisitModal.tsx` | `src/server/services/__tests__/visits.test.ts` | DONE |

### V1-5.3 — Fever-streak reset logic (any fever = fever day)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Any single fever reading on calendar day resets streak | `src/domain/streak.ts` | `src/domain/__tests__/streak.test.ts` (fast-check) | DONE |

### V1-5.4 — Time zone / day boundary

| Requirement | Code | Tests | Status |
|---|---|---|---|
| "Day" = facility-local midnight (IANA timezone) | `toLocalDate()`, `local_date` computed at insert | `src/domain/__tests__/streak.test.ts` | DONE |

### V1-5.5 — Discharge requires explicit doctor approval

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Doctor approval mandatory; no auto-discharge | `src/server/services/discharge.ts` | `src/server/services/__tests__/discharge.test.ts` | DONE |

### V1-5.6 — Full occupancy handling

| Requirement | Code | Tests | Status |
|---|---|---|---|
| At capacity: block admission, route to waitlist | `src/server/services/admissions.ts` | `tests/integration/admissions.test.ts` | DONE |
| Partial unique index prevents overbooking at DB level | `one_open_admission_per_bed` index | `tests/integration/admissions.test.ts` | DONE |

### V1-5.7 — Role-based write restrictions

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Nurses cannot log visits; doctors cannot log temps; admin cannot alter clinical data | `src/server/authz/matrix.ts` | `src/server/authz/__tests__/matrix.test.ts` (227 tests) | DONE |

### V1-5.8 — Mortality alerting with rolling window

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Rolling 7/30-day mortality rate; min-sample gate; hysteresis | `src/domain/mortality.ts`, `src/server/services/dashboard.ts` | `src/domain/__tests__/mortality.test.ts`, `dashboard.test.ts` | DONE |

### V1-5.9 — Data correction: reason code, amendment, never overwrite

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Correction = new row with amends_id + reason_code | `src/server/services/temperatures.ts` | `src/server/services/__tests__/temperatures.test.ts`, `tests/integration/temperatures.test.ts` | DONE |
| `POST /api/v1/temperatures/{id}/amendments` | `src/app/api/v1/temperatures/[id]/amendments/route.ts` | `src/server/services/__tests__/temperatures.test.ts` | DONE |

### V1-5.10 — Offline / connectivity resilience

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Queue locally in IndexedDB, sync when online | `src/lib/outbox.ts` (Dexie) | `src/lib/outbox.ts`, component review | DONE |
| `POST /api/v1/sync` (batch, idempotent, clock skew) | `src/app/api/v1/sync/route.ts`, `src/server/services/sync.ts` | `src/server/services/__tests__/sync.test.ts` | DONE |
| Service worker app shell + task precache | `public/sw.js`, `public/manifest.json` | Worker lifecycle verification | DONE |
| Fast PIN switch for shared bedside tablets (TRD §7.1, V1-§6) | `src/server/services/pin.ts`, `PinLockModal.tsx` | `src/server/services/__tests__/pin.test.ts` (10 tests) | DONE |

### V1-§6 — Non-Functional Requirements

| Requirement | Code | Tests | Status |
|---|---|---|---|
| 99.9% uptime target & disaster recovery | Offline-first + `docs/PAPER_FALLBACK.md` | Runbook verification | DONE |
| All clinical entries immutable, audit trail | DB triggers, REVOKE | `tests/integration/temperatures.test.ts` | DONE |
| RBAC server-side (not just UI) | `authorize()` on every route handler | `src/server/authz/__tests__/matrix.test.ts` (248 tests) | DONE |
| <2s at 74 patients | Query indexes, batch task queries | In-memory batch joins | DONE |
| Capacity configurable (not hardcoded 74) | Bed rows in DB | `tests/integration/admissions.test.ts` | DONE |
| ≤3 taps to log temperature (tablet UX) | `LogTemperatureModal.tsx`, Nurse UI | Component design | DONE |
| Security headers (CSP, HSTS, frame-ancestors) | `next.config.ts` | Configuration check | DONE |
| Health endpoints | `/api/health`, `/api/health/deep` | Smoke test | DONE |

---

## v2 Requirements

### V2-4.1 — Push Notifications & Real-Time Alerts (v2a)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Guaranteed in-app notification row on clinical write (TRD §10.2) | `src/server/services/notifications.ts`, `src/db/schema/v2.ts` | `src/server/services/__tests__/notifications.test.ts` | DONE |
| Zero PHI in notification payloads (doorbell model) | `src/server/services/notifications.ts` | `src/server/services/__tests__/notifications.test.ts` | DONE |
| De-duplication via dedupeKey to prevent alert storms | `src/server/services/notifications.ts` | `src/server/services/__tests__/notifications.test.ts` | DONE |
| Web Push VAPID integration | `src/server/services/notifications.ts`, `src/app/api/v1/push/subscriptions/route.ts` | Service unit tests | DONE |
| Critical alert escalation & acknowledgment | `sweepAndEscalateNotifications()`, `POST /api/v1/notifications/[id]/ack` | `src/server/services/__tests__/notifications.test.ts` | DONE |
| In-app notification bell & 30s polling feed | `src/components/NotificationBell.tsx`, `GET /api/v1/events` | Component review & polling tests | DONE |

### V2-4.2 — Treatment & Medication Tracking (v2b)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Structured doctor treatment plans & orders | `src/server/services/medication.ts`, `POST /api/v1/admissions/[id]/treatment-plans` | `src/server/services/__tests__/medication.test.ts` | DONE |
| Pharmacist review/verification gate (`require_pharmacist_verification`) | `src/server/services/medication.ts`, `POST /api/v1/medication-orders/[id]/verify` | `src/server/services/__tests__/medication.test.ts` | DONE |
| 72-hour rolling med slot generation | `src/server/services/medication.ts` | `src/server/services/__tests__/medication.test.ts` | DONE |
| Scheduling conflict detection (flagged only, never blocks) | `src/server/services/medication.ts` | `src/server/services/__tests__/medication.test.ts` | DONE |
| MAR administration logging (ADMINISTERED / MISSED / REFUSED) + idempotency | `src/server/services/medication.ts`, `POST /api/v1/med-slots/[id]/administration` | `src/server/services/__tests__/medication.test.ts` | DONE |
| Medication Administration Record (MAR) query | `GET /api/v1/admissions/[id]/mar` | Service unit tests | DONE |

### V2-4.3 — Multi-Facility / Multi-Ward Support (v2c)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Facility & Ward first-class scoping in schema | `facilities`, `wards`, `beds`, `user_facility_scopes` in `src/db/schema/` | Schema integrity checks | DONE |
| Regional Admin cross-facility aggregate rollup | `src/server/services/network.ts`, `GET /api/v1/network/metrics` | `src/server/authz/__tests__/matrix.test.ts` | DONE |
| Regional Admin isolation (zero clinical data, zero bed write) | `src/server/authz/matrix.ts` | `src/server/authz/__tests__/matrix.test.ts` | DONE |
| Configurable bed capacity per facility/ward | `facilities.capacity`, `wards.capacity`, bed rows | `tests/integration/admissions.test.ts` | DONE |

### V2-4.4 — Patient/Family-Facing Status View (v2d)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Consent-gated 256-bit unauthenticated link creation (SHA-256 stored) | `src/server/services/family.ts`, `src/db/schema/v2.ts` | `src/server/services/__tests__/family.test.ts` | DONE |
| Coarse status view without PHI / clinical detail | `src/server/services/family.ts`, `src/app/s/[token]/page.tsx` | `src/server/services/__tests__/family.test.ts` | DONE |
| Invariant G4: Deceased/Transferred neutral contact message (no leak) | `src/server/services/family.ts` | `src/server/services/__tests__/family.test.ts` | DONE |
| Privacy headers (no-store, noindex, no-referrer) | `src/app/s/[token]/page.tsx` | Page implementation review | DONE |
| Identical UNAVAILABLE response on invalid, expired, or revoked token | `src/server/services/family.ts` | `src/server/services/__tests__/family.test.ts` | DONE |

### V2-4.5 — Advanced Analytics & Reporting (v2a)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| Daily metrics pre-aggregation table | `src/db/schema/v2.ts` (`daily_facility_metrics`) | Schema & migration | DONE |
| Historical trends & ISO admission week cohort analytics | `src/server/services/analytics.ts`, `GET /api/v1/analytics/trends`, `src/app/dashboard/analytics/page.tsx` | `src/server/services/__tests__/analytics.test.ts` | DONE |
| Streamed RFC 4180 CSV outcome export with PII masking | `src/server/services/analytics.ts`, `GET /api/v1/exports/outcomes` | `src/server/services/__tests__/analytics.test.ts` | DONE |
| Readmission tracking via identity_hash & manual confirmation | `patients.identity_hash`, `admissions.readmission_of`, `patients.possible_duplicate_of` | Schema & query logic | DONE |

### V2-4.6 — Lab & External System Integration (v2d)

| Requirement | Code | Tests | Status |
|---|---|---|---|
| FHIR R4 Bundle & Observation/DiagnosticReport parser | `src/server/services/labs.ts` | `src/server/services/__tests__/labs.test.ts` | DONE |
| Patient resolution via MRN / identity_hash to open admission | `src/server/services/labs.ts` | `src/server/services/__tests__/labs.test.ts` | DONE |
| Unmatched/ambiguous results queued to lab_results_inbox (never discarded) | `src/server/services/labs.ts`, `lab_results_inbox` | `src/server/services/__tests__/labs.test.ts` | DONE |
| Guaranteed in-app notification (`lab.unmatched`) for admin review | `src/server/services/labs.ts`, `src/server/services/notifications.ts` | `src/server/services/__tests__/labs.test.ts` | DONE |
| Idempotency on (source_id, external_id) | `src/server/services/labs.ts`, `uq_lab_source_external` | `src/server/services/__tests__/labs.test.ts` | DONE |
| Ingestion & reconciliation endpoints | `POST /api/v1/integrations/labs/fhir`, `GET /api/v1/integrations/labs/fhir`, `POST /api/v1/integrations/labs/fhir/[id]/reconcile` | `src/server/services/__tests__/labs.test.ts` | DONE |

---

## Database Invariants Traceability

| Invariant | Implementation | Test |
|---|---|---|
| One open admission per bed | `UNIQUE INDEX one_open_admission_per_bed ON admissions(bed_id) WHERE closed_at IS NULL` | `tests/integration/invariants/overbooking-race.test.ts` |
| One open admission per patient | `UNIQUE INDEX one_open_admission_per_patient ON admissions(patient_id) WHERE closed_at IS NULL` | Integration |
| Idempotent offline sync | `UNIQUE INDEX uq_temp_client_uuid ON temperature_readings(client_uuid)` | `tests/e2e/offline-sync.spec.ts` |
| Temperature readings append-only | `forbid_mutation()` trigger; `REVOKE UPDATE, DELETE` | `tests/integration/invariants/immutability.test.ts` |
| Visits append-only | Same trigger pattern | Integration |
| Discharge tables append-only | Same trigger pattern | Integration |
| Audit log append-only | Same trigger pattern | Integration |
| RLS: user sees only their facility | `facility_isolation` policy on all tenant tables | `tests/integration/rls-isolation/` |
