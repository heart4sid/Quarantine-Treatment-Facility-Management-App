/**
 * Authorization matrix tests — generated from TRD §7.2.
 * Tests that every role × action combination produces the correct allow/deny.
 *
 * Adding a new action to the Action type requires adding rows to this file.
 * CI will fail if the matrix is incomplete.
 */

import { describe, it, expect } from "vitest";
import { authorize, type UserRole, type Action } from "../matrix";

type MatrixRow = {
  action: Action;
  allowed: UserRole[];
  denied: UserRole[];
};

/**
 * The exhaustive role × action matrix from TRD §7.2.
 * Rows map each action to its allowed and explicitly denied roles.
 */
const MATRIX: MatrixRow[] = [
  // ── Temperature ────────────────────────────────────────────────────────────
  {
    action: "temp:log",
    allowed: ["nurse"],
    denied: ["doctor", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "temp:amend:own_same_day",
    allowed: ["nurse", "doctor"],
    denied: ["admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "temp:amend:any",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── Visits ─────────────────────────────────────────────────────────────────
  {
    action: "visit:start",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "visit:note:update",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── Discharge ──────────────────────────────────────────────────────────────
  {
    action: "discharge:approve",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "discharge:execute",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── Admissions ─────────────────────────────────────────────────────────────
  {
    action: "admission:create",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "admission:assign_bed",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "admission:view:clinical",
    allowed: ["nurse", "doctor", "admin_staff", "pharmacist"],
    denied: ["facility_head", "system_admin", "regional_admin"],
  },
  // ── Outcomes ───────────────────────────────────────────────────────────────
  {
    action: "outcome:record_deceased",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "outcome:record_transferred",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "outcome:record_cured",
    allowed: [], // system-only; no user role can call this directly
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── Waitlist ───────────────────────────────────────────────────────────────
  {
    action: "waitlist:view",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "waitlist:manage",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── Medication (v2b) ───────────────────────────────────────────────────────
  {
    action: "treatment:create",
    allowed: ["doctor"],
    denied: ["nurse", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "med:administer",
    allowed: ["nurse"],
    denied: ["doctor", "admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "med:verify_order",
    allowed: ["pharmacist"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "system_admin", "regional_admin"],
  },
  // ── Dashboards ─────────────────────────────────────────────────────────────
  {
    action: "dashboard:facility",
    allowed: ["facility_head"],
    denied: ["nurse", "doctor", "admin_staff", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "dashboard:network",
    allowed: ["regional_admin"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "system_admin", "pharmacist"],
  },
  {
    action: "dashboard:tasks:own",
    allowed: ["nurse", "doctor"],
    denied: ["admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "dashboard:admin_queues",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── User management ────────────────────────────────────────────────────────
  {
    action: "user:create",
    allowed: ["system_admin"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "regional_admin"],
  },
  {
    action: "user:deactivate",
    allowed: ["system_admin"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "regional_admin"],
  },
  {
    action: "user:assign_role",
    allowed: ["system_admin"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "regional_admin"],
  },
  {
    action: "audit:view",
    allowed: ["system_admin"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "regional_admin"],
  },
  {
    action: "feature_flag:manage",
    allowed: ["system_admin"],
    denied: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "regional_admin"],
  },
  // ── Family / external (v2d) ────────────────────────────────────────────────
  {
    action: "family_contact:manage",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "lab_result:view",
    allowed: ["doctor", "admin_staff"],
    denied: ["nurse", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "lab_result:ingest",
    allowed: ["admin_staff", "system_admin"],
    denied: ["nurse", "doctor", "facility_head", "pharmacist", "regional_admin"],
  },
  // ── Patient assignment ──────────────────────────────────────────────────────
  {
    action: "patient:assign",
    allowed: ["admin_staff"],
    denied: ["nurse", "doctor", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  // ── Offline Sync & Fast PIN ────────────────────────────────────────────────
  {
    action: "sync:batch",
    allowed: ["nurse", "doctor"],
    denied: ["admin_staff", "facility_head", "system_admin", "pharmacist", "regional_admin"],
  },
  {
    action: "auth:pin_manage",
    allowed: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist"],
    denied: ["system_admin", "regional_admin"],
  },
  // ── v2a: Notifications & Analytics ──────────────────────────────────────────
  {
    action: "notification:feed",
    allowed: ["nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "system_admin", "regional_admin"],
    denied: [],
  },
  {
    action: "analytics:view",
    allowed: ["facility_head", "system_admin", "regional_admin"],
    denied: ["nurse", "doctor", "admin_staff", "pharmacist"],
  },
];

describe("Authorization Matrix (TRD §7.2)", () => {
  for (const row of MATRIX) {
    describe(`Action: ${row.action}`, () => {
      for (const role of row.allowed) {
        it(`ALLOWS ${role}`, () => {
          const result = authorize([role], row.action);
          expect(result.allowed, result.reason).toBe(true);
        });
      }

      for (const role of row.denied) {
        it(`DENIES ${role}`, () => {
          const result = authorize([role], row.action);
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeTruthy(); // must explain the denial
        });
      }
    });
  }

  describe("Multi-role combinations", () => {
    it("nurse + doctor combination can do both nurse and doctor actions", () => {
      const roles: UserRole[] = ["nurse", "doctor"];
      expect(authorize(roles, "temp:log").allowed).toBe(true);
      expect(authorize(roles, "visit:start").allowed).toBe(true);
    });

    it("system_admin cannot log temperatures (deny-by-default)", () => {
      expect(authorize(["system_admin"], "temp:log").allowed).toBe(false);
    });

    it("empty roles are denied everything", () => {
      expect(authorize([], "temp:log").allowed).toBe(false);
      expect(authorize([], "admission:create").allowed).toBe(false);
      expect(authorize([], "dashboard:facility").allowed).toBe(false);
    });
  });
});
