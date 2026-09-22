/**
 * M2 Integration tests — Temperature service, amendments, and immutability triggers.
 * Tests against real DB (or skips if DATABASE_URL is not set).
 *
 * TRD §5.4: "Immutability triggers on temperature_readings"
 * TRD §6.1, §6.2: "Effective-reading view, streak engine edge-triggering"
 * TRD §6.6: "Duplicate temperature entries: 409 DUPLICATE_TODAY"
 * TRD §6.8: "Amendments and corrections: new row with amends_id"
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

const shouldRun = !!process.env.DATABASE_URL;
const describeIf = shouldRun ? describe : describe.skip;

const sql = shouldRun ? neon(process.env.DATABASE_URL!) : (null as any);

describeIf("M2 Integration — Temperature service & DB invariants", () => {
  let facilityId: string;
  let wardId: string;
  let bedId: string;
  let nurseUserId: string;
  let doctorUserId: string;
  let patientId: string;
  let admissionId: string;

  beforeAll(async () => {
    facilityId = randomUUID();
    await sql`
      INSERT INTO facilities (id, name, timezone, settings)
      VALUES (
        ${facilityId}, 'Temp Test Facility', 'UTC',
        '{"fever_threshold_c":38.0,"discharge_streak_days":3,"streak_mode":"calendar",
          "mortality_alert_threshold":0.15,"mortality_alert_min_sample":10,
          "mortality_window_days":[7,30],"occupancy_alert_pct":0.90,
          "readmission_window_days":14,"require_pharmacist_verification":false,
          "display_unit":"C"}'::jsonb
      )
    `;

    wardId = randomUUID();
    await sql`INSERT INTO wards (id, facility_id, name) VALUES (${wardId}, ${facilityId}, 'Isolation Ward')`;

    bedId = randomUUID();
    await sql`INSERT INTO beds (id, facility_id, ward_id, label) VALUES (${bedId}, ${facilityId}, ${wardId}, 'BED-T1')`;

    nurseUserId = randomUUID();
    await sql`
      INSERT INTO users (id, email, password_hash)
      VALUES (${nurseUserId}, ${`nurse-${randomUUID().slice(0, 6)}@test.local`}, 'argon2id$mock')
    `;
    await sql`INSERT INTO user_roles (id, user_id, role) VALUES (${randomUUID()}, ${nurseUserId}, 'nurse')`;
    await sql`INSERT INTO user_facility_scopes (id, user_id, facility_id) VALUES (${randomUUID()}, ${nurseUserId}, ${facilityId})`;

    doctorUserId = randomUUID();
    await sql`
      INSERT INTO users (id, email, password_hash)
      VALUES (${doctorUserId}, ${`doctor-${randomUUID().slice(0, 6)}@test.local`}, 'argon2id$mock')
    `;
    await sql`INSERT INTO user_roles (id, user_id, role) VALUES (${randomUUID()}, ${doctorUserId}, 'doctor')`;
    await sql`INSERT INTO user_facility_scopes (id, user_id, facility_id) VALUES (${randomUUID()}, ${doctorUserId}, ${facilityId})`;
  });

  beforeEach(async () => {
    patientId = randomUUID();
    await sql`
      INSERT INTO patients (id, name_enc, created_by)
      VALUES (${patientId}, 'v1:mockEncryptedPatientName', ${nurseUserId})
    `;

    admissionId = randomUUID();
    await sql`
      INSERT INTO admissions (id, patient_id, facility_id, ward_id, bed_id, admitted_at, admitted_by)
      VALUES (${admissionId}, ${patientId}, ${facilityId}, ${wardId}, ${bedId}, NOW(), ${nurseUserId})
    `;
  });

  afterAll(async () => {
    if (!shouldRun) return;
    try {
      await sql`DELETE FROM audit_log WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM temperature_readings WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM discharge_approvals WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM admissions WHERE facility_id = ${facilityId}`;
      await sql`DELETE FROM patients WHERE id = ${patientId}`;
      await sql`DELETE FROM beds WHERE id = ${bedId}`;
      await sql`DELETE FROM wards WHERE id = ${wardId}`;
      await sql`DELETE FROM user_roles WHERE user_id IN (${nurseUserId}, ${doctorUserId})`;
      await sql`DELETE FROM user_facility_scopes WHERE user_id IN (${nurseUserId}, ${doctorUserId})`;
      await sql`DELETE FROM users WHERE id IN (${nurseUserId}, ${doctorUserId})`;
      await sql`DELETE FROM facilities WHERE id = ${facilityId}`;
    } catch {
      // Best-effort cleanup
    }
  });

  it("TRD §5.4 invariant: temperature_readings table is immutable (forbid_mutation trigger)", async () => {
    const readingId = randomUUID();
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, local_date,
        recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (
        ${readingId}, ${admissionId}, ${facilityId}, 37.0, '2026-09-22',
        ${nurseUserId}, false, 38.0, ${randomUUID()}
      )
    `;

    // Attempting UPDATE must fail due to trigger
    let updateFailed = false;
    try {
      await sql`UPDATE temperature_readings SET value_c = 38.5 WHERE id = ${readingId}`;
    } catch (err: any) {
      updateFailed = true;
      expect(err.message).toMatch(/append-only|forbid_mutation/i);
    }
    expect(updateFailed).toBe(true);

    // Attempting DELETE must fail due to trigger
    let deleteFailed = false;
    try {
      await sql`DELETE FROM temperature_readings WHERE id = ${readingId}`;
    } catch (err: any) {
      deleteFailed = true;
      expect(err.message).toMatch(/append-only|forbid_mutation/i);
    }
    expect(deleteFailed).toBe(true);
  });

  it("TRD §6.1: effective_temperature_readings view excludes superseded amendments", async () => {
    const origId = randomUUID();
    const amendId = randomUUID();

    // 1. Insert original reading
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, local_date,
        recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (
        ${origId}, ${admissionId}, ${facilityId}, 39.5, '2026-09-21',
        ${nurseUserId}, true, 38.0, ${randomUUID()}
      )
    `;

    // Check it appears in effective view
    const [viewRow1] = await sql`
      SELECT id, value_c FROM effective_temperature_readings WHERE id = ${origId}
    `;
    expect(viewRow1).toBeDefined();
    expect(Number(viewRow1.value_c)).toBeCloseTo(39.5, 1);

    // 2. Insert amendment reading correcting to 37.1
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, local_date,
        recorded_by, is_fever, threshold_c_used, amends_id, reason_code, client_uuid
      )
      VALUES (
        ${amendId}, ${admissionId}, ${facilityId}, 37.1, '2026-09-21',
        ${nurseUserId}, false, 38.0, ${origId}, 'DATA_ENTRY_ERROR', ${randomUUID()}
      )
    `;

    // Original must NO LONGER appear in effective view
    const viewOrigAfter = await sql`
      SELECT id FROM effective_temperature_readings WHERE id = ${origId}
    `;
    expect(viewOrigAfter.length).toBe(0);

    // Amendment row MUST appear in effective view
    const [viewAmendRow] = await sql`
      SELECT id, value_c FROM effective_temperature_readings WHERE id = ${amendId}
    `;
    expect(viewAmendRow).toBeDefined();
    expect(Number(viewAmendRow.value_c)).toBeCloseTo(37.1, 1);
  });

  it("TRD §6.8: void amendment (value_c = null) completely removes reading from effective view", async () => {
    const readingId = randomUUID();
    const voidId = randomUUID();

    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, local_date,
        recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (
        ${readingId}, ${admissionId}, ${facilityId}, 38.8, '2026-09-20',
        ${nurseUserId}, true, 38.0, ${randomUUID()}
      )
    `;

    // Void the reading (Doctor void)
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, local_date,
        recorded_by, threshold_c_used, amends_id, reason_code, client_uuid
      )
      VALUES (
        ${voidId}, ${admissionId}, ${facilityId}, NULL, '2026-09-20',
        ${doctorUserId}, 38.0, ${readingId}, 'WRONG_PATIENT', ${randomUUID()}
      )
    `;

    // Neither original nor void row should appear in effective_temperature_readings
    const effectiveRows = await sql`
      SELECT id FROM effective_temperature_readings WHERE id IN (${readingId}, ${voidId})
    `;
    expect(effectiveRows.length).toBe(0);
  });
});
