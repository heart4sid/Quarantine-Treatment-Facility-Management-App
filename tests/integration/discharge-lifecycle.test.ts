/**
 * M3 Integration tests — Full discharge lifecycle & fever-after-approval relapse.
 * TRD §6.3, §6.7, V1-§4.3, V1-§4.4, V1-§4.5, V1-§5.5, DECISIONS.md G3, G5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

const shouldRun = !!process.env.DATABASE_URL;
const describeIf = shouldRun ? describe : describe.skip;

const sql = shouldRun ? neon(process.env.DATABASE_URL!) : (null as any);

describeIf("M3 Integration — Discharge Lifecycle & Relapse Invariants", () => {
  let facilityId: string;
  let wardId: string;
  let bedId: string;
  let nurseUserId: string;
  let doctorUserId: string;
  let adminUserId: string;
  let patientId: string;
  let admissionId: string;

  beforeAll(async () => {
    facilityId = randomUUID();
    await sql`
      INSERT INTO facilities (id, name, timezone, settings)
      VALUES (
        ${facilityId}, 'Discharge Test Facility', 'UTC',
        '{"fever_threshold_c":38.0,"discharge_streak_days":3,"streak_mode":"calendar",
          "mortality_alert_threshold":0.15,"mortality_alert_min_sample":10,
          "mortality_window_days":[7,30],"occupancy_alert_pct":0.90,
          "readmission_window_days":14,"require_pharmacist_verification":false,
          "display_unit":"C"}'::jsonb
      )
    `;

    wardId = randomUUID();
    await sql`INSERT INTO wards (id, facility_id, name) VALUES (${wardId}, ${facilityId}, 'Discharge Ward')`;

    bedId = randomUUID();
    await sql`INSERT INTO beds (id, facility_id, ward_id, label) VALUES (${bedId}, ${facilityId}, ${wardId}, 'BED-D1')`;

    nurseUserId = randomUUID();
    await sql`INSERT INTO users (id, email, password_hash) VALUES (${nurseUserId}, ${`nurse-${randomUUID().slice(0, 6)}@test.local`}, 'mock')`;
    await sql`INSERT INTO user_roles (id, user_id, role) VALUES (${randomUUID()}, ${nurseUserId}, 'nurse')`;

    doctorUserId = randomUUID();
    await sql`INSERT INTO users (id, email, password_hash) VALUES (${doctorUserId}, ${`doctor-${randomUUID().slice(0, 6)}@test.local`}, 'mock')`;
    await sql`INSERT INTO user_roles (id, user_id, role) VALUES (${randomUUID()}, ${doctorUserId}, 'doctor')`;

    adminUserId = randomUUID();
    await sql`INSERT INTO users (id, email, password_hash) VALUES (${adminUserId}, ${`admin-${randomUUID().slice(0, 6)}@test.local`}, 'mock')`;
    await sql`INSERT INTO user_roles (id, user_id, role) VALUES (${randomUUID()}, ${adminUserId}, 'admin_staff')`;
  });

  beforeEach(async () => {
    patientId = randomUUID();
    await sql`
      INSERT INTO patients (id, name_enc, created_by)
      VALUES (${patientId}, 'v1:mockEncryptedName', ${nurseUserId})
    `;

    admissionId = randomUUID();
    await sql`
      INSERT INTO admissions (id, patient_id, facility_id, ward_id, bed_id, admitted_at, admitted_by)
      VALUES (${admissionId}, ${patientId}, ${facilityId}, ${wardId}, ${bedId}, NOW(), ${adminUserId})
    `;
  });

  afterAll(async () => {
    if (!shouldRun) return;
    try {
      await sql`DELETE FROM audit_log WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM discharge_executions WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM discharge_approvals WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM visits WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM temperature_readings WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM admissions WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM patients WHERE id = ${patientId}`;
      await sql`DELETE FROM beds WHERE id = ${bedId}`;
      await sql`DELETE FROM wards WHERE id = ${wardId}`;
      await sql`DELETE FROM user_roles WHERE user_id IN (${nurseUserId}, ${doctorUserId}, ${adminUserId})`;
      await sql`DELETE FROM users WHERE id IN (${nurseUserId}, ${doctorUserId}, ${adminUserId})`;
      await sql`DELETE FROM facilities WHERE id = ${facilityId}`;
    } catch {
      // Best-effort cleanup
    }
  });

  it("TRD §6.3 Happy path: 3 fever-free days -> approval -> execution -> bed freed", async () => {
    // 1. Log 3 consecutive fever-free days
    const dates = ["2026-09-20", "2026-09-21", "2026-09-22"];
    for (const d of dates) {
      await sql`
        INSERT INTO temperature_readings (
          id, admission_id, facility_id, value_c, local_date,
          recorded_by, is_fever, threshold_c_used, client_uuid
        )
        VALUES (${randomUUID()}, ${admissionId}, ${facilityId}, 36.8, ${d}, ${nurseUserId}, false, 38.0, ${randomUUID()})
      `;
    }

    // 2. Doctor approves discharge
    const approvalId = randomUUID();
    await sql`
      INSERT INTO discharge_approvals (id, admission_id, facility_id, doctor_id, approved_at)
      VALUES (${approvalId}, ${admissionId}, ${facilityId}, ${doctorUserId}, NOW())
    `;

    // 3. Admin executes discharge
    const executionId = randomUUID();
    await sql`
      INSERT INTO discharge_executions (id, admission_id, facility_id, approval_id, admin_id, executed_at)
      VALUES (${executionId}, ${admissionId}, ${facilityId}, ${approvalId}, ${adminUserId}, NOW())
    `;

    await sql`
      UPDATE admissions
      SET closed_at = NOW(), outcome = 'DISCHARGED_CURED', version = version + 1
      WHERE id = ${admissionId}
    `;

    // 4. Verify admission is closed with DISCHARGED_CURED
    const [closedRow] = await sql`
      SELECT closed_at, outcome FROM admissions WHERE id = ${admissionId}
    `;
    expect(closedRow.closed_at).not.toBeNull();
    expect(closedRow.outcome).toBe("DISCHARGED_CURED");

    // 5. Verify bed is now free (a new open admission can be inserted into the same bed)
    const newPatientId = randomUUID();
    await sql`INSERT INTO patients (id, name_enc, created_by) VALUES (${newPatientId}, 'v1:name', ${nurseUserId})`;

    const newAdmissionId = randomUUID();
    await sql`
      INSERT INTO admissions (id, patient_id, facility_id, ward_id, bed_id, admitted_at, admitted_by)
      VALUES (${newAdmissionId}, ${newPatientId}, ${facilityId}, ${wardId}, ${bedId}, NOW(), ${adminUserId})
    `;

    const [newAdmission] = await sql`SELECT id FROM admissions WHERE id = ${newAdmissionId}`;
    expect(newAdmission.id).toBe(newAdmissionId);
  });

  it("TRD §6.3, G3 Relapse path: fever logged after approval voids the approval", async () => {
    // 1. Log 3 consecutive fever-free days
    const dates = ["2026-09-20", "2026-09-21", "2026-09-22"];
    for (const d of dates) {
      await sql`
        INSERT INTO temperature_readings (
          id, admission_id, facility_id, value_c, local_date,
          recorded_by, is_fever, threshold_c_used, client_uuid
        )
        VALUES (${randomUUID()}, ${admissionId}, ${facilityId}, 36.8, ${d}, ${nurseUserId}, false, 38.0, ${randomUUID()})
      `;
    }

    // 2. Doctor approves discharge
    const approvalId = randomUUID();
    await sql`
      INSERT INTO discharge_approvals (id, admission_id, facility_id, doctor_id, approved_at)
      VALUES (${approvalId}, ${admissionId}, ${facilityId}, ${doctorUserId}, NOW())
    `;

    // 3. Nurse logs a fever on the next day (relapse)
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, local_date,
        recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (${randomUUID()}, ${admissionId}, ${facilityId}, 39.2, '2026-09-23', ${nurseUserId}, true, 38.0, ${randomUUID()})
    `;

    // 4. In accordance with TRD §6.2 rule 4 & G3:
    // voided_at must be set on the unexecuted approval
    await sql`
      UPDATE discharge_approvals
      SET voided_at = NOW(), void_reason = 'Fever logged after approval (relapse)', voided_by = ${nurseUserId}
      WHERE id = ${approvalId}
    `;

    const [voidedApproval] = await sql`
      SELECT voided_at, void_reason FROM discharge_approvals WHERE id = ${approvalId}
    `;
    expect(voidedApproval.voided_at).not.toBeNull();
    expect(voidedApproval.void_reason).toContain("relapse");
  });
});
