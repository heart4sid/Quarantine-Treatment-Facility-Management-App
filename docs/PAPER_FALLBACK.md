# PAPER_FALLBACK.md — Facility Downtime Operating Procedure & Runbook
## Quarantine & Treatment Facility Management System (Stage 0 / v1.0)

> **PURPOSE:** This operational runbook governs facility operations when the digital application is unavailable due to network outage, server unavailability, power failure, or device battery depletion.
> **INVARIANT:** Clinical care and patient safety must continue uninterrupted. The 3-day fever-free cured threshold and bed capacity limits must still be strictly enforced during paper operations.

---

## 1. Trigger Conditions

Transition to paper operations is triggered immediately if:
1. Both Wi-Fi and cellular connectivity fail simultaneously across the facility for >15 minutes.
2. Bedside tablets cannot access the local offline PWA cache (e.g. tablet hardware failure).
3. The facility central server / database reports sustained 5xx errors for >15 minutes.
4. Directed by the **Facility Head** or **Charge Nurse on duty**.

---

## 2. Emergency Paper Kit Locations

Standardized Paper Downtime Kits are maintained in sealed binders at:
- **Admin Triage & Reception Desk** (Binder #1)
- **Ward A Nursing Station** (Binder #2)
- **Ward B Nursing Station** (Binder #3)
- **Facility Head Office** (Binder #4)

Each binder contains:
- 100 × Form D-1: Emergency Patient Intake & Bed Assignment Sheets
- 200 × Form D-2: Bedside Daily Temperature & Clinical Observation Sheets
- 100 × Form D-3: Doctor Review & Discharge Sign-Off Forms
- Carbon paper copies for administrative reconciliation
- Laminated Facility Bed Map (74 beds) with physical whiteboard markers

---

## 3. Downtime Clinical Procedures

### 3.1 Patient Intake & Bed Allocation (Admin Staff)
1. **Capacity Verification:** Check the physical laminated Bed Board. Count marked beds.
   - If marked beds = total beds (74), **HALT ADMISSIONS**.
   - Record patient on paper Waitlist Sheet (Form D-1W) with timestamp and contact.
2. **Form D-1 Completion:** Record patient full name, date of birth, MRN / National ID, and symptoms.
3. **Bed Tagging:** Write assigned bed number (e.g. `A-12`) on patient wristband and Bed Board.
4. **Filing:** Place Carbon Copy A in the central Admin Downtime Box; attach Copy B to the patient's bedside clipboard.

### 3.2 Daily Temperature Logging (Nursing Staff)
1. Use Form D-2 on the bedside clipboard.
2. Record:
   - Date (`YYYY-MM-DD`)
   - Time (24h format)
   - Temperature in °C (to 1 decimal point, e.g. `38.2`)
   - Fever Flag: Circle **FEVER** if reading ≥ 38.0°C; Circle **NORMAL** if < 38.0°C
   - Nurse Signature & Employee ID
3. **Duplicate Readings:** If a second reading is taken on the same day, record it on a new line. Never cross out or erase previous readings (append-only principle).
4. **Streak Calculation:**
   - If reading ≥ 38.0°C: Write `Streak = 0` (Reset).
   - If reading < 38.0°C: Increment previous day's streak by 1 (e.g. `Streak = 2`).

### 3.3 Doctor Daily Rounds & Review (Doctors)
1. Review bedside Form D-2 before seeing patient.
   - **Exception Protocol:** If no morning temperature is recorded, the doctor must write the clinical justification in the "Exception Reason" box before proceeding.
2. Record visit notes, oxygen saturation, and lung auscultation on Form D-3.
3. **Discharge Eligibility Sign-off:**
   - Doctor confirms 3 consecutive fever-free calendar days.
   - Doctor signs Form D-3 Section B: "Approved for Discharge (Cured)".
   - Doctor hands signed Form D-3 to Charge Nurse for delivery to Admin.

---

## 4. Recovery & Post-Downtime Data Reconciliation

Once digital system connectivity is restored:

### Step 1: System Readiness Verification
1. Verify `/api/health` and `/api/health/deep` return `status: healthy`.
2. Confirm database connection pool and local time synchronization.

### Step 2: Reconciliation Order of Operations
Data must be entered in exact chronological order:
1. **Admissions:** Admin staff enters Form D-1 records first. Ensure bed assignments match physical reality.
2. **Temperature Readings:** Nurses transcribe Form D-2 records using the **Batch Sync** or Nurse Task interface:
   - Provide original paper recording timestamp (`clientRecordedAt`).
   - The system automatically derives `localDate` and computes fever flags.
3. **Doctor Visits:** Doctors enter Form D-3 visit notes and exception reasons.
4. **Discharge Approvals & Executions:**
   - Verify digital streak engine calculates `streak ≥ 3`.
   - Doctor approves discharge digitally.
   - Admin executes discharge to release bed records.

### Step 3: Dual-Sign-Off & Audit Verification
1. The **Charge Nurse** and **Facility Head** must review the digital audit log against paper originals.
2. Stamp paper forms: **RECONCILED TO DIGITAL SYSTEM [Date / Time / Sign]**.
3. Archive physical paper binders in secure records storage for the statutory retention period (DECISIONS.md OQ6).

---

## 5. Printable Downtime Form Templates

### Form D-2: Bedside Daily Temperature Log Sheet

```
+-------------------------------------------------------------------------------+
|                      QUARANTINE & TREATMENT FACILITY                         |
|                    FORM D-2: BEDSIDE TEMPERATURE RECORD                       |
+-------------------------------------------------------------------------------+
| Patient Name: ____________________________  MRN / ID: ______________________ |
| Ward: [   ] A   [   ] B   Bed Label: _________  Admit Date: _________________ |
+------------+-------+-----------+--------------------+----------------+--------+
| Date       | Time  | Temp (°C) | Fever? (>= 38.0°C) | Nurse Sig & ID | Streak |
+------------+-------+-----------+--------------------+----------------+--------+
| YYYY-MM-DD | HH:MM |  __.__    | [ ] YES   [ ] NO   |                |  ___   |
+------------+-------+-----------+--------------------+----------------+--------+
| YYYY-MM-DD | HH:MM |  __.__    | [ ] YES   [ ] NO   |                |  ___   |
+------------+-------+-----------+--------------------+----------------+--------+
| YYYY-MM-DD | HH:MM |  __.__    | [ ] YES   [ ] NO   |                |  ___   |
+------------+-------+-----------+--------------------+----------------+--------+
| YYYY-MM-DD | HH:MM |  __.__    | [ ] YES   [ ] NO   |                |  ___   |
+------------+-------+-----------+--------------------+----------------+--------+
| RULE: 3 consecutive calendar days with NO fever (< 38.0°C) = Discharge Ready. |
| ANY fever resets streak to 0. Do NOT erase or alter previous entries.         |
+-------------------------------------------------------------------------------+
```

### Form D-3: Doctor Review & Discharge Sign-Off

```
+-------------------------------------------------------------------------------+
|                      QUARANTINE & TREATMENT FACILITY                         |
|                 FORM D-3: CLINICAL REVIEW & DISCHARGE SIGN-OFF                |
+-------------------------------------------------------------------------------+
| Patient Name: ____________________________  Bed: _________ Date: ____________ |
+-------------------------------------------------------------------------------+
| [ ] Temp missing today? MANDATORY EXCEPTION REASON:                           |
|     _________________________________________________________________________ |
|                                                                               |
| Clinical Examination Notes:                                                   |
| _____________________________________________________________________________ |
| _____________________________________________________________________________ |
|                                                                               |
| DISCHARGE SIGN-OFF (Requires streak >= 3 fever-free calendar days):          |
| [ ] APPROVED FOR DISCHARGE (CURED)                                            |
| [ ] NOT ELIGIBLE - CONTINUED QUARANTINE REQUIRED                              |
|                                                                               |
| Doctor Name: ___________________________ Doctor Signature: __________________ |
+-------------------------------------------------------------------------------+
```
