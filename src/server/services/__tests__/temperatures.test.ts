/**
 * Unit tests for temperature logging, amendments, and eligibility edge-triggering.
 * TRD §6.1, §6.2, §6.6, §6.8, §7.2, V1-§4.2, V1-§4.3, V1-§5.1, V1-§5.3, V1-§5.9, DECISIONS.md G1, G2, G3, G10
 */

import { describe, it, expect } from "vitest";
import {
  logTemperatureSchema,
  amendTemperatureSchema,
  nurseTaskQuerySchema,
} from "@/server/api/schemas";
import {
  computeStreak,
  isDischargeEligible,
  toLocalDate,
  validateClockSkew,
  type DayFact,
} from "@/domain/streak";
import { authorize, requireAuthorization, type UserRole } from "@/server/authz/matrix";
import { randomUUID } from "crypto";

describe("logTemperatureSchema validation", () => {
  it("accepts valid temperature readings", () => {
    const valid = {
      valueC: 37.2,
      clientUuid: randomUUID(),
      clientRecordedAt: new Date().toISOString(),
      confirmedDuplicate: false,
    };
    const res = logTemperatureSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("rejects physiologically impossible temperatures (< 30°C or > 45°C)", () => {
    const tooLow = { valueC: 28.0, clientUuid: randomUUID() };
    expect(logTemperatureSchema.safeParse(tooLow).success).toBe(false);

    const tooHigh = { valueC: 46.5, clientUuid: randomUUID() };
    expect(logTemperatureSchema.safeParse(tooHigh).success).toBe(false);
  });

  it("requires clientUuid for idempotency", () => {
    const missingUuid = { valueC: 37.0 };
    expect(logTemperatureSchema.safeParse(missingUuid).success).toBe(false);
  });

  it("defaults confirmedDuplicate to false", () => {
    const res = logTemperatureSchema.safeParse({
      valueC: 37.0,
      clientUuid: randomUUID(),
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.confirmedDuplicate).toBe(false);
    }
  });
});

describe("amendTemperatureSchema validation (TRD §6.8, V1-§5.9)", () => {
  it("accepts valid amendments with standard reason codes", () => {
    const valid = {
      valueC: 37.5,
      reasonCode: "DATA_ENTRY_ERROR",
      clientUuid: randomUUID(),
    };
    expect(amendTemperatureSchema.safeParse(valid).success).toBe(true);
  });

  it("allows null valueC for void amendments (doctor role)", () => {
    const voidReading = {
      valueC: null,
      reasonCode: "DEVICE_CALIBRATION",
      clientUuid: randomUUID(),
    };
    expect(amendTemperatureSchema.safeParse(voidReading).success).toBe(true);
  });

  it("requires reasonNote (min 10 chars) when reasonCode is OTHER", () => {
    const missingNote = {
      valueC: 37.0,
      reasonCode: "OTHER",
      clientUuid: randomUUID(),
    };
    expect(amendTemperatureSchema.safeParse(missingNote).success).toBe(false);

    const shortNote = {
      valueC: 37.0,
      reasonCode: "OTHER",
      reasonNote: "Typo",
      clientUuid: randomUUID(),
    };
    expect(amendTemperatureSchema.safeParse(shortNote).success).toBe(false);

    const validNote = {
      valueC: 37.0,
      reasonCode: "OTHER",
      reasonNote: "Thermometer mercury separated mid-measurement",
      clientUuid: randomUUID(),
    };
    expect(amendTemperatureSchema.safeParse(validNote).success).toBe(true);
  });
});

describe("nurseTaskQuerySchema validation", () => {
  it("accepts optional date or valid YYYY-MM-DD", () => {
    expect(nurseTaskQuerySchema.safeParse({}).success).toBe(true);
    expect(nurseTaskQuerySchema.safeParse({ date: "2026-09-22" }).success).toBe(true);
  });

  it("rejects invalid date formats", () => {
    expect(nurseTaskQuerySchema.safeParse({ date: "09/22/2026" }).success).toBe(false);
    expect(nurseTaskQuerySchema.safeParse({ date: "invalid" }).success).toBe(false);
  });
});

describe("Role Authorization Matrix for Temperatures (TRD §7.2, DECISIONS.md G10)", () => {
  it("allows only nurse to log temperatures (V1-§5.7)", () => {
    expect(authorize(["nurse"], "temp:log").allowed).toBe(true);
    expect(authorize(["doctor"], "temp:log").allowed).toBe(false);
    expect(authorize(["admin_staff"], "temp:log").allowed).toBe(false);
    expect(authorize(["facility_head"], "temp:log").allowed).toBe(false);
    expect(authorize(["system_admin"], "temp:log").allowed).toBe(false);
  });

  it("allows nurse and doctor for temp:amend:own_same_day", () => {
    expect(authorize(["nurse"], "temp:amend:own_same_day").allowed).toBe(true);
    expect(authorize(["doctor"], "temp:amend:own_same_day").allowed).toBe(true);
    expect(authorize(["admin_staff"], "temp:amend:own_same_day").allowed).toBe(false);
  });

  it("allows only doctor for temp:amend:any", () => {
    expect(authorize(["doctor"], "temp:amend:any").allowed).toBe(true);
    expect(authorize(["nurse"], "temp:amend:any").allowed).toBe(false);
    expect(authorize(["admin_staff"], "temp:amend:any").allowed).toBe(false);
  });
});

describe("Clock skew validation (TRD §9, §6.1)", () => {
  const serverNow = new Date("2026-09-22T10:00:00Z");

  it("accepts client timestamps within accepted 72h past window", () => {
    const clientTime = new Date("2026-09-21T12:00:00Z"); // 22 hours ago
    expect(validateClockSkew(clientTime, serverNow)).toBe("ok");
  });

  it("flags future client timestamps as future", () => {
    const clientTime = new Date("2026-09-22T10:05:00Z"); // 5 minutes in future
    expect(validateClockSkew(clientTime, serverNow)).toBe("future");
  });

  it("flags timestamps older than 72 hours as too_old", () => {
    const clientTime = new Date("2026-09-18T10:00:00Z"); // 96 hours ago
    expect(validateClockSkew(clientTime, serverNow)).toBe("too_old");
  });
});

describe("Streak & Discharge Eligibility edge-triggering logic (TRD §6.2, G1, G2, G3)", () => {
  it("transitions to eligible when streak reaches required 3 days", () => {
    const dayFacts: DayFact[] = [
      { date: "2026-09-20", anyFever: false },
      { date: "2026-09-21", anyFever: false },
      { date: "2026-09-22", anyFever: false },
    ];
    const streak = computeStreak(dayFacts, "2026-09-22");
    expect(streak).toBe(3);
    expect(isDischargeEligible(streak, 3)).toBe(true);
  });

  it("streak breaks immediately if a fever is recorded on any calendar day (G1)", () => {
    const dayFacts: DayFact[] = [
      { date: "2026-09-20", anyFever: false },
      { date: "2026-09-21", anyFever: false },
      { date: "2026-09-22", anyFever: true }, // Fever today!
    ];
    const streak = computeStreak(dayFacts, "2026-09-22");
    expect(streak).toBe(0);
    expect(isDischargeEligible(streak, 3)).toBe(false);
  });

  it("relapse logic: an unmeasured past day breaks the streak (G2)", () => {
    const dayFacts: DayFact[] = [
      { date: "2026-09-19", anyFever: false },
      // 2026-09-20 is missing!
      { date: "2026-09-21", anyFever: false },
      { date: "2026-09-22", anyFever: false },
    ];
    const streak = computeStreak(dayFacts, "2026-09-22");
    expect(streak).toBe(2); // Only 21 and 22 count; gap breaks it
    expect(isDischargeEligible(streak, 3)).toBe(false);
  });

  it("today unmeasured is neutral (G2)", () => {
    const dayFacts: DayFact[] = [
      { date: "2026-09-19", anyFever: false },
      { date: "2026-09-20", anyFever: false },
      { date: "2026-09-21", anyFever: false },
      // 2026-09-22 not yet measured
    ];
    const streak = computeStreak(dayFacts, "2026-09-22");
    expect(streak).toBe(3); // 19, 20, 21 count!
    expect(isDischargeEligible(streak, 3)).toBe(true);
  });
});
