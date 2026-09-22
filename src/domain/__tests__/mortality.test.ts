/**
 * Unit + property tests for the mortality engine.
 * TRD §6.7, DECISIONS.md G9
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeMortality,
  isAlertReArmed,
  getSurvivalBenchmarkStatus,
  type OutcomeCounts,
  type MortalityConfig,
} from "../mortality";

const defaultConfig: MortalityConfig = {
  minSample: 10,
  threshold: 0.15,
  alertCurrentlyActive: false,
  hysteresisDelta: 0.02,
};

function makeCounts(cured: number, deceased: number): OutcomeCounts {
  return { cured, deceased, active: 0, transferred: 0 };
}

// ─── Basic correctness ────────────────────────────────────────────────────────

describe("computeMortality — basic cases", () => {
  it("returns null rate when no outcomes", () => {
    const result = computeMortality(makeCounts(0, 0), defaultConfig);
    expect(result.rate).toBeNull();
    expect(result.alertShouldFire).toBe(false);
  });

  it("correctly computes 15% mortality", () => {
    // 15% exactly should NOT fire (threshold is >15%)
    const result = computeMortality(makeCounts(17, 3), { ...defaultConfig, minSample: 10 });
    expect(result.rate).toBeCloseTo(3 / 20, 5);
    expect(result.rate).toBeCloseTo(0.15, 5);
    expect(result.alertShouldFire).toBe(false); // 0.15 is not > 0.15
  });

  it("fires alert when rate > threshold with sufficient sample", () => {
    const result = computeMortality(makeCounts(15, 5), defaultConfig);
    // 5/20 = 25% > 15%
    expect(result.rate).toBeCloseTo(0.25);
    expect(result.hasSufficientSample).toBe(true);
    expect(result.alertShouldFire).toBe(true);
  });

  it("does NOT fire alert when sample is below minimum", () => {
    // 5/7 = 71% mortality — but only 7 outcomes, below minSample=10
    const result = computeMortality(makeCounts(2, 5), defaultConfig);
    expect(result.hasSufficientSample).toBe(false);
    expect(result.alertShouldFire).toBe(false);
  });

  it("totalClosed excludes active and transferred", () => {
    const counts: OutcomeCounts = { cured: 10, deceased: 2, active: 50, transferred: 5 };
    const result = computeMortality(counts, defaultConfig);
    expect(result.totalClosed).toBe(12);
    expect(result.rate).toBeCloseTo(2 / 12);
  });
});

// ─── Hysteresis (G9) ──────────────────────────────────────────────────────────

describe("isAlertReArmed — hysteresis", () => {
  it("returns false when alert is not active", () => {
    expect(isAlertReArmed(0.10, { ...defaultConfig, alertCurrentlyActive: false })).toBe(false);
  });

  it("returns false when rate is still above threshold (alert should stay active)", () => {
    // rate=0.16 > threshold=0.15 — not re-armed yet
    expect(isAlertReArmed(0.16, { ...defaultConfig, alertCurrentlyActive: true })).toBe(false);
  });

  it("returns false when rate is between threshold and hysteresis boundary", () => {
    // threshold=0.15, hysteresisDelta=0.02, so re-arm at <0.13
    // rate=0.14 is between 0.13 and 0.15 — not yet re-armed
    expect(isAlertReArmed(0.14, { ...defaultConfig, alertCurrentlyActive: true })).toBe(false);
  });

  it("returns true when rate drops below (threshold - hysteresisDelta)", () => {
    // Re-arms at rate < 0.13
    expect(isAlertReArmed(0.12, { ...defaultConfig, alertCurrentlyActive: true })).toBe(true);
  });

  it("re-arms when rate is null (all patients active — no outcomes)", () => {
    expect(isAlertReArmed(null, { ...defaultConfig, alertCurrentlyActive: true })).toBe(true);
  });
});

// ─── Survival benchmark ───────────────────────────────────────────────────────

describe("getSurvivalBenchmarkStatus", () => {
  it("returns unknown when rate is null", () => {
    expect(getSurvivalBenchmarkStatus(null, 0.15)).toBe("unknown");
  });

  it("returns on_track when well below threshold", () => {
    expect(getSurvivalBenchmarkStatus(0.05, 0.15)).toBe("on_track"); // 5% < 70% of 15%
  });

  it("returns warning when approaching threshold", () => {
    expect(getSurvivalBenchmarkStatus(0.12, 0.15)).toBe("warning"); // 12% between 70% and 100% of 15%
  });

  it("returns critical when above threshold", () => {
    expect(getSurvivalBenchmarkStatus(0.20, 0.15)).toBe("critical");
  });
});

// ─── Property tests ───────────────────────────────────────────────────────────

describe("computeMortality — property tests", () => {
  it("rate is always in [0, 1] when non-null", () => {
    fc.assert(
      fc.property(
        fc.nat(100), // cured
        fc.nat(100), // deceased
        (cured, deceased) => {
          const result = computeMortality(makeCounts(cured, deceased), defaultConfig);
          if (result.rate === null) return true; // ok when 0 total
          return result.rate >= 0 && result.rate <= 1;
        }
      )
    );
  });

  it("alert never fires when sample is below minSample", () => {
    fc.assert(
      fc.property(
        fc.nat(9), // 0-9 — below minSample=10
        fc.nat(50),
        (deceased, cured) => {
          const result = computeMortality(
            { cured, deceased, active: 0, transferred: 0 },
            defaultConfig
          );
          // totalClosed must be < minSample for this to apply
          if (result.totalClosed >= defaultConfig.minSample) return true; // skip
          return !result.alertShouldFire;
        }
      )
    );
  });

  it("totalClosed = cured + deceased (transferred and active excluded)", () => {
    fc.assert(
      fc.property(
        fc.nat(100), fc.nat(100), fc.nat(100), fc.nat(100),
        (cured, deceased, active, transferred) => {
          const counts: OutcomeCounts = { cured, deceased, active, transferred };
          const result = computeMortality(counts, defaultConfig);
          return result.totalClosed === cured + deceased;
        }
      )
    );
  });
});
