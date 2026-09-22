/**
 * Unit tests for doctor visits and 428 TEMP_MISSING_TODAY flow.
 * TRD §6.5, §8.2, V1-§4.3, V1-§5.2
 */

import { describe, it, expect } from "vitest";
import { startVisitSchema, doctorTaskQuerySchema } from "@/server/api/schemas";
import { authorize } from "@/server/authz/matrix";
import { randomUUID } from "crypto";

describe("startVisitSchema validation (V1-§4.3, V1-§5.2)", () => {
  it("accepts valid visit with notes", () => {
    const valid = {
      notes: "Patient alert and oriented, chest clear on auscultation.",
      noTempException: false,
      clientUuid: randomUUID(),
    };
    const res = startVisitSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("accepts visit with exception when exceptionReason is provided (>= 10 chars)", () => {
    const validException = {
      notes: "Emergency visit prior to nurse rounds.",
      noTempException: true,
      exceptionReason: "Acute respiratory distress requiring immediate clinical review",
      clientUuid: randomUUID(),
    };
    const res = startVisitSchema.safeParse(validException);
    expect(res.success).toBe(true);
  });

  it("rejects noTempException = true when exceptionReason is missing or too short", () => {
    const missingReason = {
      notes: "Routine check",
      noTempException: true,
      clientUuid: randomUUID(),
    };
    expect(startVisitSchema.safeParse(missingReason).success).toBe(false);

    const shortReason = {
      notes: "Routine check",
      noTempException: true,
      exceptionReason: "Urgent", // < 10 chars
      clientUuid: randomUUID(),
    };
    expect(startVisitSchema.safeParse(shortReason).success).toBe(false);
  });

  it("requires clientUuid for idempotency", () => {
    const missingUuid = {
      notes: "Checked patient",
      noTempException: false,
    };
    expect(startVisitSchema.safeParse(missingUuid).success).toBe(false);
  });
});

describe("doctorTaskQuerySchema validation", () => {
  it("accepts optional date or valid YYYY-MM-DD", () => {
    expect(doctorTaskQuerySchema.safeParse({}).success).toBe(true);
    expect(doctorTaskQuerySchema.safeParse({ date: "2026-09-22" }).success).toBe(true);
  });

  it("rejects invalid date strings", () => {
    expect(doctorTaskQuerySchema.safeParse({ date: "yesterday" }).success).toBe(false);
    expect(doctorTaskQuerySchema.safeParse({ date: "2026/09/22" }).success).toBe(false);
  });
});

describe("Role Authorization Matrix for Visits (TRD §7.2, V1-§5.7)", () => {
  it("allows only doctor to start visits", () => {
    expect(authorize(["doctor"], "visit:start").allowed).toBe(true);
    expect(authorize(["nurse"], "visit:start").allowed).toBe(false);
    expect(authorize(["admin_staff"], "visit:start").allowed).toBe(false);
    expect(authorize(["facility_head"], "visit:start").allowed).toBe(false);
    expect(authorize(["system_admin"], "visit:start").allowed).toBe(false);
  });

  it("allows only doctor to update visit notes", () => {
    expect(authorize(["doctor"], "visit:note:update").allowed).toBe(true);
    expect(authorize(["nurse"], "visit:note:update").allowed).toBe(false);
  });
});
