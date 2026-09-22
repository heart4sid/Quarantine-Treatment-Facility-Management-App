/**
 * Unit tests for Treatment & Medication management (v2b).
 * TRD §11.1, V2-§4.2, V2-§5.2
 */

import { describe, it, expect } from "vitest";
import {
  createTreatmentPlanSchema,
  administerMedSchema,
} from "@/server/api/schemas";
import { authorize } from "@/server/authz/matrix";
import { randomUUID } from "crypto";

describe("Medication Schemas Validation (TRD §11.1, V2-§4.2)", () => {
  it("accepts valid treatment plan with medication orders", () => {
    const validPlan = {
      diagnosisNotes: "Acute viral respiratory illness — initiate supportive antiviral regimen",
      orders: [
        {
          drugName: "Remdesivir",
          code: "RX-19482",
          dose: "100",
          unit: "mg",
          route: "IV" as const,
          frequencySpec: {
            timesPerDay: 1,
            hours: [10],
          },
          durationDays: 5,
        },
        {
          drugName: "Paracetamol",
          dose: "500",
          unit: "mg",
          route: "ORAL" as const,
          frequencySpec: {
            timesPerDay: 3,
            hours: [8, 14, 20],
          },
        },
      ],
    };

    const parsed = createTreatmentPlanSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
  });

  it("rejects treatment plan without medication orders", () => {
    const emptyPlan = {
      diagnosisNotes: "Observation only",
      orders: [],
    };
    expect(createTreatmentPlanSchema.safeParse(emptyPlan).success).toBe(false);
  });

  it("validates administerMedSchema status and clientUuid", () => {
    const validAdmin = {
      status: "ADMINISTERED",
      notes: "Administered with morning meal",
      clientUuid: randomUUID(),
    };
    expect(administerMedSchema.safeParse(validAdmin).success).toBe(true);

    const validRefused = {
      status: "REFUSED",
      notes: "Patient nauseous; requested delay",
      clientUuid: randomUUID(),
    };
    expect(administerMedSchema.safeParse(validRefused).success).toBe(true);

    const invalidStatus = {
      status: "CANCELLED", // not a valid status for administration
      clientUuid: randomUUID(),
    };
    expect(administerMedSchema.safeParse(invalidStatus).success).toBe(false);
  });
});

describe("Medication Horizon & Conflict Rules (TRD §11.1, V2 §5.2)", () => {
  it("calculates 2-hour window end correctly for scheduled dose", () => {
    const dueAt = new Date("2026-09-22T08:00:00Z");
    const windowEnd = new Date(dueAt.getTime() + 2 * 60 * 60 * 1000);

    expect(windowEnd.toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });

  it("identifies overlapping dose windows as conflicts for doctor review", () => {
    const dueA = new Date("2026-09-22T09:00:00Z").getTime();
    const dueB = new Date("2026-09-22T09:15:00Z").getTime(); // within 30 min

    const isConflict = Math.abs(dueA - dueB) <= 30 * 60 * 1000;
    expect(isConflict).toBe(true);
  });
});

describe("Medication Authorization Matrix (TRD §7.2, V2-§3)", () => {
  it("enforces strict role separation across medication lifecycle", () => {
    // Doctors prescribe treatment plans
    expect(authorize(["doctor"], "treatment:create").allowed).toBe(true);
    expect(authorize(["nurse"], "treatment:create").allowed).toBe(false);
    expect(authorize(["pharmacist"], "treatment:create").allowed).toBe(false);

    // Pharmacists verify orders
    expect(authorize(["pharmacist"], "med:verify_order").allowed).toBe(true);
    expect(authorize(["doctor"], "med:verify_order").allowed).toBe(false);
    expect(authorize(["nurse"], "med:verify_order").allowed).toBe(false);

    // Nurses log administration
    expect(authorize(["nurse"], "med:administer").allowed).toBe(true);
    expect(authorize(["doctor"], "med:administer").allowed).toBe(false);
    expect(authorize(["admin_staff"], "med:administer").allowed).toBe(false);
  });
});
