/**
 * Unit tests for Facility Head Dashboard and mortality alerting logic.
 * TRD §6.7, §8.2, V1-§4.5, V1-§4.6, DECISIONS.md G9
 */

import { describe, it, expect } from "vitest";
import { authorize } from "@/server/authz/matrix";
import { computeMortality, isAlertReArmed, type MortalityConfig, type OutcomeCounts } from "@/domain/mortality";

const testConfig: MortalityConfig = {
  minSample: 10,
  threshold: 0.15,
  alertCurrentlyActive: false,
  hysteresisDelta: 0.02,
};

function makeCounts(cured: number, deceased: number): OutcomeCounts {
  return { cured, deceased, active: 0, transferred: 0 };
}

describe("Facility Dashboard Authorization (TRD §7.2)", () => {
  it("allows Facility Head to view facility oversight dashboard", () => {
    expect(authorize(["facility_head"], "dashboard:facility").allowed).toBe(true);
  });

  it("denies other roles from viewing facility oversight dashboard", () => {
    expect(authorize(["nurse"], "dashboard:facility").allowed).toBe(false);
    expect(authorize(["doctor"], "dashboard:facility").allowed).toBe(false);
    expect(authorize(["admin_staff"], "dashboard:facility").allowed).toBe(false);
    expect(authorize(["system_admin"], "dashboard:facility").allowed).toBe(false);
  });
});

describe("Mortality Dashboard Alerting Calculations (TRD §6.7, DECISIONS.md G9)", () => {
  it("triggers alert when rolling mortality rate exceeds 15% threshold with sufficient sample (>= 10)", () => {
    // 3 deaths, 10 cured = 3 / 13 = 23.1% (above 15%, sample size 13 >= 10)
    const result = computeMortality(makeCounts(10, 3), testConfig);

    expect(result.hasSufficientSample).toBe(true);
    expect(result.alertShouldFire).toBe(true);
    expect(result.rate).toBeCloseTo(3 / 13, 3);
  });

  it("suppresses alert when sample size is below minimum gate (< 10) even with high mortality", () => {
    // 2 deaths, 2 cured = 50% mortality, but total sample = 4 < 10
    const result = computeMortality(makeCounts(2, 2), testConfig);

    expect(result.hasSufficientSample).toBe(false);
    expect(result.alertShouldFire).toBe(false);
  });

  it("re-arms alert only when mortality falls below threshold minus hysteresis (13%)", () => {
    const activeConfig = { ...testConfig, alertCurrentlyActive: true };

    // Rate = 14% (between 13% and 15%)
    // Should NOT re-arm (returns false) because 0.14 >= 0.13
    expect(isAlertReArmed(0.14, activeConfig)).toBe(false);

    // Rate drops to 12% (< 13% re-arm threshold) -> re-arms
    expect(isAlertReArmed(0.12, activeConfig)).toBe(true);
  });
});
