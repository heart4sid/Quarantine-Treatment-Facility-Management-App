/**
 * M1 Integration tests — Admission service
 * Tests the overbooking race condition protection and admission invariants.
 *
 * These are INTEGRATION tests — they run against a real test database.
 * Skipped automatically if DATABASE_URL is not set (unit test runs).
 *
 * TRD §6.1: "No two concurrent admits may map to the same bed"
 * TRD DB Invariant: "UNIQUE INDEX one_open_admission_per_bed WHERE closed_at IS NULL"
 *
 * Run with: node node_modules/vitest/vitest.mjs run tests/integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

// Skip all integration tests if no DATABASE_URL (unit test environment)
const shouldRun = !!process.env.DATABASE_URL;
const describeIf = shouldRun ? describe : describe.skip;

const sql = shouldRun ? neon(process.env.DATABASE_URL!) : (null as any);

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function createTestFacility() {
  const id = randomUUID();
  await sql`
    INSERT INTO facilities (id, name, timezone, settings)
    VALUES (
      ${id}, 'Test Facility', 'UTC',
      '{"fever_threshold_c":38.0,"discharge_streak_days":3,"streak_mode":"calendar",
        "mortality_alert_threshold":0.15,"mortality_alert_min_sample":10,
        "mortality_window_days":[7,30],"occupancy_alert_pct":0.90,
        "readmission_window_days":14,"require_pharmacist_verification":false,
        "display_unit":"C"}'::jsonb
    )
  `;
  return id;
}

async function createTestWard(facilityId: string) {
  const id = randomUUID();
  await sql`
    INSERT INTO wards (id, facility_id, name)
    VALUES (${id}, ${facilityId}, 'Test Ward')
  `;
  return id;
}

async function createTestBed(facilityId: string, wardId: string, label = "T-01") {
  const id = randomUUID();
  await sql`
    INSERT INTO beds (id, facility_id, ward_id, label)
    VALUES (${id}, ${facilityId}, ${wardId}, ${label})
  `;
  return id;
}

async function createTestPatient(userId: string) {
  const id = randomUUID();
  await sql`
    INSERT INTO patients (id, name_enc, created_by)
    VALUES (${id}, 'enc:test_patient', ${userId})
  `;
  return id;
}

async function createTestUser() {
  const id = randomUUID();
  await sql`
    INSERT INTO users (id, email, display_name, password_hash)
    VALUES (${id}, ${`test+${id.slice(0,8)}@test.com`}, 'Test User', 'hash')
  `;
  return id;
}

async function admitPatientDirectly(
  patientId: string,
  facilityId: string,
  wardId: string,
  bedId: string,
  userId: string
): Promise<string> {
  const admissionId = randomUUID();
  await sql`
    INSERT INTO admissions (id, patient_id, facility_id, ward_id, bed_id, admitted_at, admitted_by)
    VALUES (${admissionId}, ${patientId}, ${facilityId}, ${wardId}, ${bedId}, NOW(), ${userId})
  `;
  return admissionId;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describeIf("M1 Integration — Admission invariants (TRD §6.1)", () => {
  let facilityId: string;
  let wardId: string;
  let userId: string;

  beforeAll(async () => {
    facilityId = await createTestFacility();
    wardId = await createTestWard(facilityId);
    userId = await createTestUser();
  });

  afterAll(async () => {
    // Clean up test data (reverse dependency order)
    await sql`DELETE FROM admissions WHERE facility_id = ${facilityId}`;
    await sql`DELETE FROM patients WHERE created_by = ${userId}`;
    await sql`DELETE FROM beds WHERE facility_id = ${facilityId}`;
    await sql`DELETE FROM wards WHERE facility_id = ${facilityId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql`DELETE FROM facilities WHERE id = ${facilityId}`;
  });

  // ── Test 1: Basic admission ──────────────────────────────────────────────────

  it("admits a patient to an empty bed", async () => {
    const bedId = await createTestBed(facilityId, wardId, "T-01");
    const patientId = await createTestPatient(userId);

    const admissionId = await admitPatientDirectly(patientId, facilityId, wardId, bedId, userId);

    const [result] = await sql`
      SELECT id, patient_id, bed_id, closed_at
      FROM admissions WHERE id = ${admissionId}
    `;

    expect(result.id).toBe(admissionId);
    expect(result.patient_id).toBe(patientId);
    expect(result.bed_id).toBe(bedId);
    expect(result.closed_at).toBeNull();
  });

  // ── Test 2: Overbooking prevention (sequential) ──────────────────────────────

  it("prevents sequential overbooking via DB unique constraint", async () => {
    const bedId = await createTestBed(facilityId, wardId, "T-02");
    const patient1 = await createTestPatient(userId);
    const patient2 = await createTestPatient(userId);

    // First admission — should succeed
    await admitPatientDirectly(patient1, facilityId, wardId, bedId, userId);

    // Second admission to same bed — must fail with unique constraint violation
    await expect(
      admitPatientDirectly(patient2, facilityId, wardId, bedId, userId)
    ).rejects.toThrow(); // PostgreSQL 23505 unique violation

    // Verify only one admission exists for this bed
    const [countResult] = await sql`
      SELECT COUNT(*) as cnt FROM admissions
      WHERE bed_id = ${bedId} AND closed_at IS NULL
    `;
    expect(Number(countResult.cnt)).toBe(1);
  });

  // ── Test 3: Concurrent overbooking prevention ────────────────────────────────

  it(
    "prevents concurrent overbooking — race condition safety",
    async () => {
      const bedId = await createTestBed(facilityId, wardId, "T-03");

      // Create N patients to race
      const CONCURRENT = 10;
      const patientIds = await Promise.all(
        Array.from({ length: CONCURRENT }, () => createTestPatient(userId))
      );

      // Fire all admissions concurrently
      const results = await Promise.allSettled(
        patientIds.map((pid) =>
          admitPatientDirectly(pid, facilityId, wardId, bedId, userId)
        )
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      // Exactly 1 must succeed — the DB constraint must serialize concurrent INSERTs
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(CONCURRENT - 1);

      // Verify only one open admission for this bed
      const [countResult] = await sql`
        SELECT COUNT(*) as cnt FROM admissions
        WHERE bed_id = ${bedId} AND closed_at IS NULL
      `;
      expect(Number(countResult.cnt)).toBe(1);
    },
    15_000 // Allow up to 15s for concurrent DB operations
  );

  // ── Test 4: One open admission per patient ────────────────────────────────────

  it("prevents duplicate open admissions for the same patient", async () => {
    const bed1 = await createTestBed(facilityId, wardId, "T-04");
    const bed2 = await createTestBed(facilityId, wardId, "T-05");
    const patientId = await createTestPatient(userId);

    // First admission — should succeed
    await admitPatientDirectly(patientId, facilityId, wardId, bed1, userId);

    // Second admission for same patient — must fail
    await expect(
      admitPatientDirectly(patientId, facilityId, wardId, bed2, userId)
    ).rejects.toThrow();

    // Verify only one admission for this patient
    const [countResult] = await sql`
      SELECT COUNT(*) as cnt FROM admissions
      WHERE patient_id = ${patientId} AND closed_at IS NULL
    `;
    expect(Number(countResult.cnt)).toBe(1);
  });

  // ── Test 5: Bed available after discharge ─────────────────────────────────────

  it("allows re-admission to same bed after discharge", async () => {
    const bedId = await createTestBed(facilityId, wardId, "T-06");
    const patient1 = await createTestPatient(userId);
    const patient2 = await createTestPatient(userId);

    // Admit patient 1
    const admissionId = await admitPatientDirectly(patient1, facilityId, wardId, bedId, userId);

    // Discharge patient 1
    await sql`
      UPDATE admissions
      SET closed_at = NOW(), outcome = 'DISCHARGED_CURED'
      WHERE id = ${admissionId}
    `;

    // Admit patient 2 to the same bed — should succeed now
    const admission2Id = await admitPatientDirectly(patient2, facilityId, wardId, bedId, userId);

    const [result] = await sql`
      SELECT id FROM admissions WHERE id = ${admission2Id} AND closed_at IS NULL
    `;
    expect(result.id).toBe(admission2Id);
  });

  // ── Test 6: Immutability — temperature_readings ───────────────────────────────

  it("prevents UPDATE on temperature_readings (immutability trigger)", async () => {
    const bedId = await createTestBed(facilityId, wardId, "T-07");
    const patientId = await createTestPatient(userId);
    const admissionId = await admitPatientDirectly(patientId, facilityId, wardId, bedId, userId);
    const clientUuid = randomUUID();

    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, recorded_at,
        local_date, recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (
        ${randomUUID()}, ${admissionId}, ${facilityId},
        37.5, NOW(), '2026-01-01', ${userId}, false, 38.0, ${clientUuid}
      )
    `;

    // Attempt UPDATE — must be blocked by the immutability trigger
    await expect(
      sql`UPDATE temperature_readings SET value_c = 40.0 WHERE client_uuid = ${clientUuid}`
    ).rejects.toThrow(/Mutation of temperature_readings is not permitted/);
  });

  // ── Test 7: Immutability — visit records ──────────────────────────────────────

  it("prevents DELETE on visits (immutability trigger)", async () => {
    const bedId = await createTestBed(facilityId, wardId, "T-08");
    const patientId = await createTestPatient(userId);
    const admissionId = await admitPatientDirectly(patientId, facilityId, wardId, bedId, userId);
    const clientUuid = randomUUID();

    await sql`
      INSERT INTO visits (
        id, admission_id, facility_id, doctor_id,
        started_at, local_date, client_uuid
      )
      VALUES (
        ${randomUUID()}, ${admissionId}, ${facilityId}, ${userId},
        NOW(), '2026-01-01', ${clientUuid}
      )
    `;

    // Attempt DELETE — must be blocked by the immutability trigger
    await expect(
      sql`DELETE FROM visits WHERE client_uuid = ${clientUuid}`
    ).rejects.toThrow(/Mutation of visits is not permitted/);
  });

  // ── Test 8: Idempotency — duplicate client_uuid ───────────────────────────────

  it("deduplicates temperature readings by client_uuid (offline sync idempotency)", async () => {
    const bedId = await createTestBed(facilityId, wardId, "T-09");
    const patientId = await createTestPatient(userId);
    const admissionId = await admitPatientDirectly(patientId, facilityId, wardId, bedId, userId);
    const clientUuid = randomUUID();

    // Insert once
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, recorded_at,
        local_date, recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (${randomUUID()}, ${admissionId}, ${facilityId},
        37.5, NOW(), '2026-01-01', ${userId}, false, 38.0, ${clientUuid})
    `;

    // Insert again (replay) — must be silently ignored by ON CONFLICT
    await sql`
      INSERT INTO temperature_readings (
        id, admission_id, facility_id, value_c, recorded_at,
        local_date, recorded_by, is_fever, threshold_c_used, client_uuid
      )
      VALUES (${randomUUID()}, ${admissionId}, ${facilityId},
        39.9, NOW(), '2026-01-01', ${userId}, true, 38.0, ${clientUuid})
      ON CONFLICT (client_uuid) DO NOTHING
    `;

    // Verify only one record with the original value
    const [result] = await sql`
      SELECT value_c FROM temperature_readings WHERE client_uuid = ${clientUuid}
    `;
    expect(Number(result.value_c)).toBeCloseTo(37.5, 1);
  });
});
