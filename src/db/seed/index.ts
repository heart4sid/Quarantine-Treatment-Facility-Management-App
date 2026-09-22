/**
 * Synthetic seed script — STAGE 0 ONLY.
 * Creates realistic-looking but completely fabricated data.
 * NEVER run against a database with real patient data.
 *
 * Usage:
 *   npm run db:seed          — add synthetic data (safe to run multiple times)
 *   npm run db:seed:reset    — wipe all data and re-seed
 *
 * Run with: dotenv-cli -e .env.local tsx src/db/seed/index.ts [--reset]
 *
 * TRD §4.2: Seed data requirements for testing:
 *   - 1 facility (74 beds across 3 wards)
 *   - 1 system_admin, 1 facility_head, 2 admin_staff, 4 doctors, 8 nurses
 *   - 60 admitted patients (80% beds occupied)
 *   - 14 waitlisted entries
 *   - Temperature readings for last 7 days
 *   - 5 discharge-eligible patients (3+ day streaks)
 *   - 2 discharge-approved patients
 *   - Historical outcomes: 28 cured, 4 deceased (≈12.5% mortality, under 15% threshold)
 */

import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";
import { encryptField } from "../../lib/crypto.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE0_WARNING = `
⚠️  STAGE 0 SYNTHETIC SEED
This script populates the database with FABRICATED data for development and demo purposes.
It must NEVER be run against a production database containing real patient data.
Proceeding in 2 seconds...
`;

const isReset = process.argv.includes("--reset");

// Synthetic name lists (all fictional)
const FIRST_NAMES = [
  "Amara", "Kwame", "Fatima", "Ibrahim", "Zara", "Emeka", "Aisha", "Chidi",
  "Nadia", "Yusuf", "Blessing", "Tunde", "Adaeze", "Seun", "Kemi", "Femi",
  "Ngozi", "Bayo", "Chioma", "Sola", "Ola", "Dayo", "Funmi", "Gbenga",
  "Halima", "Idris", "Jumoke", "Kunle", "Lanre", "Musa", "Nkechi", "Oluseun",
  "Patience", "Rasheed", "Shade", "Tobi", "Ugochi", "Victor", "Wale", "Xolani",
];

const LAST_NAMES = [
  "Okonkwo", "Adeyemi", "Ibrahim", "Musa", "Abubakar", "Okafor", "Nwosu",
  "Adeleke", "Balogun", "Chukwu", "Danjuma", "Eze", "Fashola", "Gana",
  "Hassan", "Ihejirika", "Jakande", "Kalu", "Lawal", "Mohammed",
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function toISOLocal(date: Date, tz = "Africa/Lagos"): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

function uuidv4(): string {
  return randomUUID();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(STAGE0_WARNING);
  await new Promise((r) => setTimeout(r, 2000));

  const sql = neon(process.env.DATABASE_URL!);

  // ── Reset if requested ──────────────────────────────────────────────────────
  if (isReset) {
    console.log("🗑️  Resetting database...");
    await sql`TRUNCATE TABLE
      access_log, audit_log, feature_flags, discharge_executions,
      discharge_approvals, visits, temperature_readings, waitlist_entries,
      admissions, patients, patient_assignments, sessions, user_facility_scopes,
      user_roles, users, shifts, beds, wards, facilities
      RESTART IDENTITY CASCADE`;
    console.log("✅  Database cleared.");
  }

  // ── 1. Facility ─────────────────────────────────────────────────────────────
  console.log("🏥  Creating facility...");
  const facilityId = uuidv4();
  await sql`
    INSERT INTO facilities (id, name, timezone, settings)
    VALUES (
      ${facilityId},
      'Quarantine Treatment Facility — Synthetic Demo',
      'Africa/Lagos',
      ${JSON.stringify({
        fever_threshold_c: 38.0,
        discharge_streak_days: 3,
        streak_mode: "calendar",
        mortality_alert_threshold: 0.15,
        mortality_alert_min_sample: 10,
        mortality_window_days: [7, 30],
        occupancy_alert_pct: 0.90,
        readmission_window_days: 14,
        require_pharmacist_verification: false,
        display_unit: "C",
      })}
    )
    ON CONFLICT DO NOTHING
  `;

  // ── 2. Wards (3 wards) ──────────────────────────────────────────────────────
  console.log("🏨  Creating wards and beds...");
  const wards = [
    { id: uuidv4(), name: "Ward A", bedCount: 30 },
    { id: uuidv4(), name: "Ward B", bedCount: 24 },
    { id: uuidv4(), name: "Ward C (Isolation)", bedCount: 20 },
  ];

  const allBedIds: string[] = [];

  for (const ward of wards) {
    await sql`
      INSERT INTO wards (id, facility_id, name)
      VALUES (${ward.id}, ${facilityId}, ${ward.name})
      ON CONFLICT DO NOTHING
    `;

    for (let i = 1; i <= ward.bedCount; i++) {
      const bedId = uuidv4();
      const label = `${ward.name.slice(-1)}-${String(i).padStart(2, "0")}`;
      await sql`
        INSERT INTO beds (id, facility_id, ward_id, label)
        VALUES (${bedId}, ${facilityId}, ${ward.id}, ${label})
        ON CONFLICT DO NOTHING
      `;
      allBedIds.push(bedId);
    }
  }

  // ── 3. Shifts ───────────────────────────────────────────────────────────────
  console.log("⏰  Creating shifts...");
  const shifts = [
    { id: uuidv4(), name: "Morning", start: "07:00", end: "15:00" },
    { id: uuidv4(), name: "Evening", start: "15:00", end: "23:00" },
    { id: uuidv4(), name: "Night", start: "23:00", end: "07:00" },
  ];
  for (const shift of shifts) {
    await sql`
      INSERT INTO shifts (id, facility_id, name, start_time, end_time)
      VALUES (${shift.id}, ${facilityId}, ${shift.name}, ${shift.start}, ${shift.end})
      ON CONFLICT DO NOTHING
    `;
  }

  // ── 4. Staff users ──────────────────────────────────────────────────────────
  console.log("👤  Creating staff users...");

  // Argon2id hash of "Password123!" — for seed only
  const SEED_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$SEED_PLACEHOLDER_NOT_FOR_PRODUCTION";

  const staffUsers = [
    { name: "System Administrator", email: "sysadmin@demo.qtf", role: "system_admin" },
    { name: "Dr. Facility Head", email: "head@demo.qtf", role: "facility_head" },
    { name: "Admin Staff Alpha", email: "admin1@demo.qtf", role: "admin_staff" },
    { name: "Admin Staff Beta", email: "admin2@demo.qtf", role: "admin_staff" },
    { name: "Dr. Amara Okonkwo", email: "doctor1@demo.qtf", role: "doctor" },
    { name: "Dr. Kwame Adeyemi", email: "doctor2@demo.qtf", role: "doctor" },
    { name: "Dr. Fatima Ibrahim", email: "doctor3@demo.qtf", role: "doctor" },
    { name: "Dr. Chidi Nwosu", email: "doctor4@demo.qtf", role: "doctor" },
    { name: "Nurse Zara Hassan", email: "nurse1@demo.qtf", role: "nurse" },
    { name: "Nurse Emeka Lawal", email: "nurse2@demo.qtf", role: "nurse" },
    { name: "Nurse Aisha Eze", email: "nurse3@demo.qtf", role: "nurse" },
    { name: "Nurse Tunde Kalu", email: "nurse4@demo.qtf", role: "nurse" },
    { name: "Nurse Adaeze Balogun", email: "nurse5@demo.qtf", role: "nurse" },
    { name: "Nurse Seun Adeleke", email: "nurse6@demo.qtf", role: "nurse" },
    { name: "Nurse Kemi Fashola", email: "nurse7@demo.qtf", role: "nurse" },
    { name: "Nurse Femi Okafor", email: "nurse8@demo.qtf", role: "nurse" },
  ];

  const userIds: Record<string, string> = {};

  for (const u of staffUsers) {
    const userId = uuidv4();
    userIds[u.email] = userId;

    await sql`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, ${u.email}, ${SEED_PASSWORD_HASH}, ${u.name})
      ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `;

    await sql`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (${uuidv4()}, ${userId}, ${u.role}::user_role)
      ON CONFLICT (user_id, role) DO NOTHING
    `;

    await sql`
      INSERT INTO user_facility_scopes (id, user_id, facility_id)
      VALUES (${uuidv4()}, ${userId}, ${facilityId})
      ON CONFLICT (user_id, facility_id) DO NOTHING
    `;
  }

  const doctorIds = staffUsers
    .filter((u) => u.role === "doctor")
    .map((u) => userIds[u.email]!);
  const nurseIds = staffUsers
    .filter((u) => u.role === "nurse")
    .map((u) => userIds[u.email]!);
  const adminId = userIds["admin1@demo.qtf"]!;
  const sysAdminId = userIds["sysadmin@demo.qtf"]!;

  // ── 5. Active patients & admissions (60 beds occupied) ─────────────────────
  console.log("🛏️   Admitting 60 patients...");

  const occupiedBedIds = allBedIds.slice(0, 60);
  const admissionIds: string[] = [];
  const admissionPatientIds: string[] = [];

  for (let i = 0; i < 60; i++) {
    const patientId = uuidv4();
    const admissionId = uuidv4();
    const nameEnc = encryptField(randomName());
    const admittedDaysAgo = Math.floor(Math.random() * 12) + 1;

    await sql`
      INSERT INTO patients (id, name_enc, created_at, created_by)
      VALUES (${patientId}, ${nameEnc}, ${daysAgo(admittedDaysAgo).toISOString()}, ${adminId})
      ON CONFLICT DO NOTHING
    `;

    await sql`
      INSERT INTO admissions (id, patient_id, facility_id, ward_id, bed_id, admitted_at, admitted_by)
      SELECT
        ${admissionId},
        ${patientId},
        ${facilityId},
        b.ward_id,
        ${occupiedBedIds[i]},
        ${daysAgo(admittedDaysAgo).toISOString()},
        ${adminId}
      FROM beds b WHERE b.id = ${occupiedBedIds[i]}
      ON CONFLICT DO NOTHING
    `;

    admissionIds.push(admissionId);
    admissionPatientIds.push(patientId);
  }

  // ── 6. Temperature readings (last 7 days for all 60 patients) ───────────────
  console.log("🌡️   Logging temperature readings...");

  const today = toISOLocal(new Date());

  for (const admissionId of admissionIds) {
    const nurseId = pick(nurseIds);

    for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
      // 85% chance of having a reading (simulates occasional missed days)
      if (Math.random() > 0.85) continue;

      const readingDate = toISOLocal(daysAgo(dayOffset));
      // 20% chance of fever on any day (except day 0, 1, 2 for eligible patients)
      const isFever = Math.random() < 0.20;
      const tempC = isFever
        ? 38.0 + Math.random() * 2  // 38.0–40.0°C
        : 36.0 + Math.random() * 1.8; // 36.0–37.8°C

      const clientUuid = uuidv4();
      const recordedAt = daysAgo(dayOffset);
      recordedAt.setHours(8 + Math.floor(Math.random() * 4)); // 08:00-12:00

      await sql`
        INSERT INTO temperature_readings (
          id, admission_id, facility_id, value_c, recorded_at,
          local_date, recorded_by, is_fever, threshold_c_used, client_uuid
        )
        VALUES (
          ${uuidv4()},
          ${admissionId},
          ${facilityId},
          ${Math.round(tempC * 10) / 10},
          ${recordedAt.toISOString()},
          ${readingDate},
          ${nurseId},
          ${isFever},
          38.0,
          ${clientUuid}
        )
        ON CONFLICT (client_uuid) DO NOTHING
      `;
    }

    // For the first 5 admissions: create 3+ consecutive fever-free days (discharge-eligible)
    if (admissionIds.indexOf(admissionId) < 5) {
      const doctorId = pick(doctorIds);

      // Override last 3 days with fever-free readings
      for (let d = 0; d <= 2; d++) {
        const overrideDate = toISOLocal(daysAgo(d));
        const tempC = 36.5 + Math.random() * 0.8;

        await sql`
          INSERT INTO temperature_readings (
            id, admission_id, facility_id, value_c, recorded_at,
            local_date, recorded_by, is_fever, threshold_c_used, client_uuid
          )
          VALUES (
            ${uuidv4()}, ${admissionId}, ${facilityId},
            ${Math.round(tempC * 10) / 10},
            ${daysAgo(d).toISOString()},
            ${overrideDate}, ${pick(nurseIds)},
            false, 38.0, ${uuidv4()}
          )
          ON CONFLICT (client_uuid) DO NOTHING
        `;
      }

      // Mark discharge_eligible_since for first 2 (doctor approved for discharge)
      if (admissionIds.indexOf(admissionId) < 2) {
        await sql`
          UPDATE admissions
          SET discharge_eligible_since = ${daysAgo(3).toISOString()}
          WHERE id = ${admissionId}
        `;

        // Create discharge approval for the first patient
        if (admissionIds.indexOf(admissionId) === 0) {
          await sql`
            INSERT INTO discharge_approvals (
              id, admission_id, facility_id, doctor_id, approved_at
            )
            VALUES (
              ${uuidv4()}, ${admissionId}, ${facilityId},
              ${pick(doctorIds)}, ${daysAgo(0).toISOString()}
            )
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }
  }

  // ── 7. Historical closed admissions ─────────────────────────────────────────
  console.log("📊  Creating historical outcomes (28 cured, 4 deceased)...");

  const historicalCount = 32; // 28 cured + 4 deceased
  for (let i = 0; i < historicalCount; i++) {
    const patientId = uuidv4();
    const admissionId = uuidv4();
    const nameEnc = encryptField(randomName());
    const stayDays = Math.floor(Math.random() * 10) + 3;
    const closedDaysAgo = Math.floor(Math.random() * 30) + 1;
    const isDeceased = i < 4; // first 4 are deceased
    const outcome = isDeceased ? "DECEASED" : "DISCHARGED_CURED";
    const unusedBedId = allBedIds[60 + i % 14]; // reuse unoccupied beds for history

    await sql`
      INSERT INTO patients (id, name_enc, created_at, created_by)
      VALUES (${patientId}, ${nameEnc}, ${daysAgo(stayDays + closedDaysAgo).toISOString()}, ${adminId})
      ON CONFLICT DO NOTHING
    `;

    await sql`
      INSERT INTO admissions (
        id, patient_id, facility_id, ward_id, bed_id,
        admitted_at, admitted_by, closed_at, outcome
      )
      SELECT
        ${admissionId}, ${patientId}, ${facilityId}, b.ward_id, ${unusedBedId!},
        ${daysAgo(stayDays + closedDaysAgo).toISOString()}, ${adminId},
        ${daysAgo(closedDaysAgo).toISOString()}, ${outcome}::admission_outcome
      FROM beds b WHERE b.id = ${unusedBedId!}
      ON CONFLICT DO NOTHING
    `;
  }

  // ── 8. Waitlist (14 entries) ─────────────────────────────────────────────────
  console.log("📋  Creating waitlist...");
  for (let i = 0; i < 14; i++) {
    await sql`
      INSERT INTO waitlist_entries (id, facility_id, patient_ref, priority, created_by)
      VALUES (
        ${uuidv4()}, ${facilityId},
        ${encryptField(JSON.stringify({ name: randomName(), contact: "N/A" }))},
        ${100 + i},
        ${adminId}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  // ── 9. Feature flags (all off in Stage 0) ────────────────────────────────────
  console.log("🚩  Initializing feature flags...");
  const flags = ["notifications", "medications", "family_view", "lab_ingest", "sms"];
  for (const key of flags) {
    await sql`
      INSERT INTO feature_flags (id, facility_id, key, enabled, updated_by)
      VALUES (${uuidv4()}, ${facilityId}, ${key}, false, ${sysAdminId})
      ON CONFLICT (facility_id, key) DO NOTHING
    `;
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log(`
✅  Seed complete!
    Facility: ${facilityId}
    Beds: 74 (60 occupied, 14 free)
    Staff: ${staffUsers.length} users
    Active patients: 60
    Discharge-eligible: 5
    Discharge-approved: 1
    Waitlisted: 14
    Historical outcomes: 28 cured, 4 deceased (12.5% mortality — below 15% threshold)
    Feature flags: ${flags.length} (all OFF)

Demo login: doctor1@demo.qtf / Password123!
⚠️  These are SYNTHETIC credentials for development only.
`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
