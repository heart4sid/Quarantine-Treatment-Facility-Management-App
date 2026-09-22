/**
 * Unit tests for discharge approval, admin execution, and outcome recording.
 * TRD §6.3, §6.7, V1-§4.4, V1-§4.5, V1-§5.5, DECISIONS.md G3, G5
 */

import { describe, it, expect } from "vitest";
import {
  dischargeApprovalSchema,
  executeDischargeSchema,
  recordOutcomeSchema,
} from "@/server/api/schemas";
import { authorize } from "@/server/authz/matrix";
import { randomUUID } from "crypto";

describe("Discharge and Outcome Schemas", () => {
  it("dischargeApprovalSchema accepts optional clinical notes", () => {
    expect(dischargeApprovalSchema.safeParse({}).success).toBe(true);
    expect(
      dischargeApprovalSchema.safeParse({
        notes: "Patient completed 3 fever-free days. Lungs clear, vital signs stable. Approved.",
      }).success
    ).toBe(true);
  });

  it("executeDischargeSchema requires valid approvalId and confirmed: true", () => {
    const approvalId = randomUUID();
    expect(executeDischargeSchema.safeParse({ approvalId, confirmed: true }).success).toBe(true);

    // Rejects confirmed: false
    expect(executeDischargeSchema.safeParse({ approvalId, confirmed: false }).success).toBe(false);

    // Rejects missing confirmed
    expect(executeDischargeSchema.safeParse({ approvalId }).success).toBe(false);
  });

  it("recordOutcomeSchema accepts DECEASED and TRANSFERRED with optional notes", () => {
    expect(
      recordOutcomeSchema.safeParse({
        outcome: "DECEASED",
        notes: "Cardiorespiratory failure secondary to viral pneumonia.",
      }).success
    ).toBe(true);

    expect(
      recordOutcomeSchema.safeParse({
        outcome: "TRANSFERRED",
        notes: "Transferred to tertiary ICU for advanced ECMO support.",
      }).success
    ).toBe(true);

    // Rejects DISCHARGED_CURED (handled by executeDischarge, not manual outcome entry)
    expect(
      recordOutcomeSchema.safeParse({
        outcome: "DISCHARGED_CURED",
      }).success
    ).toBe(false);
  });
});

describe("Role Authorization Matrix for Discharge & Outcomes (TRD §7.2, DECISIONS.md G5)", () => {
  it("allows only doctor to approve discharge", () => {
    expect(authorize(["doctor"], "discharge:approve").allowed).toBe(true);
    expect(authorize(["admin_staff"], "discharge:approve").allowed).toBe(false);
    expect(authorize(["nurse"], "discharge:approve").allowed).toBe(false);
    expect(authorize(["facility_head"], "discharge:approve").allowed).toBe(false);
  });

  it("allows only admin_staff to execute discharge", () => {
    expect(authorize(["admin_staff"], "discharge:execute").allowed).toBe(true);
    expect(authorize(["doctor"], "discharge:execute").allowed).toBe(false);
    expect(authorize(["nurse"], "discharge:execute").allowed).toBe(false);
    expect(authorize(["facility_head"], "discharge:execute").allowed).toBe(false);
  });

  it("allows only doctor to record DECEASED and TRANSFERRED outcomes (G5)", () => {
    expect(authorize(["doctor"], "outcome:record_deceased").allowed).toBe(true);
    expect(authorize(["admin_staff"], "outcome:record_deceased").allowed).toBe(false);
    expect(authorize(["nurse"], "outcome:record_deceased").allowed).toBe(false);

    expect(authorize(["doctor"], "outcome:record_transferred").allowed).toBe(true);
    expect(authorize(["admin_staff"], "outcome:record_transferred").allowed).toBe(false);
    expect(authorize(["nurse"], "outcome:record_transferred").allowed).toBe(false);
  });

  it("outcome:record_cured cannot be directly invoked by any user role (system-only)", () => {
    expect(authorize(["doctor"], "outcome:record_cured").allowed).toBe(false);
    expect(authorize(["admin_staff"], "outcome:record_cured").allowed).toBe(false);
    expect(authorize(["nurse"], "outcome:record_cured").allowed).toBe(false);
    expect(authorize(["system_admin"], "outcome:record_cured").allowed).toBe(false);
  });
});
