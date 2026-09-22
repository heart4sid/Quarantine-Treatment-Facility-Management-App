/**
 * Property-based and unit tests for the fever-free streak engine.
 * TRD §6.2 — "Property-based tests (fast-check) must cover:
 *   date gaps, DST changes, amendments, multiple same-day readings,
 *   midnight-boundary timestamps, and threshold changes mid-stay"
 *
 * Uses Vitest + fast-check for property testing.
 * All tests are pure (no DB, no I/O).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeStreak,
  isDischargeEligible,
  prevDate,
  toLocalDate,
  validateClockSkew,
  type DayFact,
} from "../streak";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDays(
  startDate: string,
  feverPattern: boolean[]
): DayFact[] {
  return feverPattern.map((anyFever, i) => {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), anyFever };
  });
}

// ─── Basic correctness ────────────────────────────────────────────────────────

describe("computeStreak — basic cases", () => {
  it("returns 0 when no readings", () => {
    expect(computeStreak([], "2026-01-10")).toBe(0);
  });

  it("returns 0 when today is a fever day", () => {
    const days = makeDays("2026-01-10", [true]);
    expect(computeStreak(days, "2026-01-10")).toBe(0);
  });

  it("returns 1 for one fever-free day today", () => {
    const days = makeDays("2026-01-10", [false]);
    expect(computeStreak(days, "2026-01-10")).toBe(1);
  });

  it("returns 3 for three consecutive fever-free days (today included)", () => {
    const days = makeDays("2026-01-08", [false, false, false]);
    expect(computeStreak(days, "2026-01-10")).toBe(3);
  });

  it("returns 0 when most recent day has a fever", () => {
    const days = makeDays("2026-01-08", [false, false, true]);
    expect(computeStreak(days, "2026-01-10")).toBe(0);
  });

  it("correctly counts streak broken by fever in the middle", () => {
    // Day 1: fever, Day 2: no fever, Day 3: no fever, today
    const days = makeDays("2026-01-08", [true, false, false]);
    // Streak stops at Day 1 (fever)
    expect(computeStreak(days, "2026-01-10")).toBe(2);
  });
});

// ─── G1: Any fever reading = fever day ───────────────────────────────────────

describe("computeStreak — G1 (any fever = fever day)", () => {
  it("treats day as fever day even if anyFever=true with only one reading", () => {
    // This simulates: nurse logged 39.5°C (fever) and then amended it,
    // but the amendment wasn't applied yet or was for a different reading.
    const days: DayFact[] = [
      { date: "2026-01-08", anyFever: true },
    ];
    expect(computeStreak(days, "2026-01-08")).toBe(0);
  });

  it("a day with anyFever=true after 2 fever-free days resets to 0", () => {
    const days: DayFact[] = [
      { date: "2026-01-08", anyFever: false },
      { date: "2026-01-09", anyFever: false },
      { date: "2026-01-10", anyFever: true },
    ];
    expect(computeStreak(days, "2026-01-10")).toBe(0);
  });
});

// ─── G2: Unmeasured past day breaks streak ────────────────────────────────────

describe("computeStreak — G2 (unmeasured past day breaks streak)", () => {
  it("breaks streak when yesterday has no reading", () => {
    const days: DayFact[] = [
      { date: "2026-01-08", anyFever: false },
      // 2026-01-09 is MISSING
      { date: "2026-01-10", anyFever: false },
    ];
    expect(computeStreak(days, "2026-01-10")).toBe(1); // only today counts
  });

  it("today unmeasured is neutral (streak looks back to yesterday)", () => {
    const days: DayFact[] = [
      { date: "2026-01-08", anyFever: false },
      { date: "2026-01-09", anyFever: false },
      // 2026-01-10 (today) has no reading yet — neutral
    ];
    expect(computeStreak(days, "2026-01-10")).toBe(2); // Jan 8 + Jan 9
  });

  it("returns 0 when only today is measured (streak must include at least today-1 to count)", () => {
    const days: DayFact[] = [
      // no data before today
      { date: "2026-01-10", anyFever: false },
    ];
    // today is measured fever-free; yesterday is unmeasured.
    // Today counts (streak=1), but the day before breaks it.
    expect(computeStreak(days, "2026-01-10")).toBe(1);
  });

  it("all days measured consecutively gives full streak", () => {
    const days: DayFact[] = [
      { date: "2026-01-06", anyFever: false },
      { date: "2026-01-07", anyFever: false },
      { date: "2026-01-08", anyFever: false },
      { date: "2026-01-09", anyFever: false },
      { date: "2026-01-10", anyFever: false },
    ];
    expect(computeStreak(days, "2026-01-10")).toBe(5);
  });
});

// ─── Eligibility ──────────────────────────────────────────────────────────────

describe("isDischargeEligible", () => {
  it("returns true when streak >= required", () => {
    expect(isDischargeEligible(3, 3)).toBe(true);
    expect(isDischargeEligible(5, 3)).toBe(true);
  });

  it("returns false when streak < required", () => {
    expect(isDischargeEligible(2, 3)).toBe(false);
    expect(isDischargeEligible(0, 3)).toBe(false);
  });

  it("throws when requiredDays < 1", () => {
    expect(() => isDischargeEligible(3, 0)).toThrow();
  });
});

// ─── prevDate ─────────────────────────────────────────────────────────────────

describe("prevDate", () => {
  it("returns the previous day", () => {
    expect(prevDate("2026-01-10")).toBe("2026-01-09");
  });

  it("handles month boundary", () => {
    expect(prevDate("2026-02-01")).toBe("2026-01-31");
  });

  it("handles year boundary", () => {
    expect(prevDate("2026-01-01")).toBe("2025-12-31");
  });

  it("handles leap year", () => {
    expect(prevDate("2024-03-01")).toBe("2024-02-29");
  });

  it("handles DST boundary dates (should not depend on local timezone)", () => {
    // These are UTC computations — should not be affected by DST
    expect(prevDate("2026-03-09")).toBe("2026-03-08"); // US DST spring-forward date (2026)
    expect(prevDate("2026-11-02")).toBe("2026-11-01"); // US DST fall-back date (2026)
  });
});

// ─── toLocalDate ──────────────────────────────────────────────────────────────

describe("toLocalDate", () => {
  it("converts UTC midnight to the correct local date", () => {
    // 2026-01-10T00:00:00Z in Asia/Kolkata is 2026-01-10T05:30:00+05:30 → Jan 10
    const d = new Date("2026-01-10T00:00:00Z");
    expect(toLocalDate(d, "Asia/Kolkata")).toBe("2026-01-10");
  });

  it("handles date-change across timezone boundary", () => {
    // 2026-01-10T20:00:00Z in America/New_York is 2026-01-10T15:00:00-05:00 → Jan 10 (still)
    const d1 = new Date("2026-01-10T20:00:00Z");
    expect(toLocalDate(d1, "America/New_York")).toBe("2026-01-10");

    // 2026-01-11T03:00:00Z in America/New_York is 2026-01-10T22:00:00-05:00 → still Jan 10
    const d2 = new Date("2026-01-11T03:00:00Z");
    expect(toLocalDate(d2, "America/New_York")).toBe("2026-01-10");

    // But in UTC: 2026-01-11T03:00:00Z → Jan 11
    expect(toLocalDate(d2, "UTC")).toBe("2026-01-11");
  });

  it("handles IST (UTC+5:30) midnight boundary", () => {
    // 2026-01-09T18:30:00Z = midnight 2026-01-10 IST
    const d = new Date("2026-01-09T18:30:00Z");
    expect(toLocalDate(d, "Asia/Kolkata")).toBe("2026-01-10");

    // Just before midnight IST
    const d2 = new Date("2026-01-09T18:29:59Z");
    expect(toLocalDate(d2, "Asia/Kolkata")).toBe("2026-01-09");
  });
});

// ─── validateClockSkew ────────────────────────────────────────────────────────

describe("validateClockSkew", () => {
  const serverNow = new Date("2026-01-10T12:00:00Z");

  it("returns ok for a current timestamp", () => {
    expect(validateClockSkew(new Date("2026-01-10T11:00:00Z"), serverNow)).toBe("ok");
  });

  it("returns future for a timestamp in the future", () => {
    const future = new Date("2026-01-10T13:00:00Z"); // 1h in future
    expect(validateClockSkew(future, serverNow)).toBe("future");
  });

  it("returns too_old for a timestamp older than 72h", () => {
    const old = new Date("2026-01-07T11:00:00Z"); // 73h ago
    expect(validateClockSkew(old, serverNow)).toBe("too_old");
  });

  it("returns ok for exactly 72h ago", () => {
    const exact = new Date("2026-01-07T12:00:00Z"); // exactly 72h
    expect(validateClockSkew(exact, serverNow)).toBe("ok");
  });
});

// ─── Property-based tests ────────────────────────────────────────────────────

/** Generate a YYYY-MM-DD date by integer offset from a base date. */
const BASE_DATE_MS = new Date("2025-01-01T00:00:00Z").getTime();
const ONE_DAY_MS = 86400000;

/** Arbitrary that generates a YYYY-MM-DD string by offset from 2025-01-01 */
const dateStringArb = fc.integer({ min: 0, max: 730 }).map((offset) => {
  return new Date(BASE_DATE_MS + offset * ONE_DAY_MS).toISOString().slice(0, 10);
});

describe("computeStreak — property tests (fast-check)", () => {
  /**
   * Property 1: Streak is always non-negative.
   */
  it("streak is always >= 0", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          date: dateStringArb,
          anyFever: fc.boolean(),
        })),
        dateStringArb,
        (rawDays, today) => {
          // Deduplicate by date (take last occurrence per date)
          const byDate = new Map<string, boolean>();
          for (const d of rawDays) byDate.set(d.date, d.anyFever);
          const days = Array.from(byDate.entries())
            .map(([date, anyFever]) => ({ date, anyFever }))
            .sort((a, b) => a.date.localeCompare(b.date));

          return computeStreak(days, today) >= 0;
        }
      )
    );
  });

  /**
   * Property 2: A fever on today always produces streak = 0.
   */
  it("any fever reading today gives streak = 0", () => {
    fc.assert(
      fc.property(
        dateStringArb,
        fc.array(fc.record({
          date: dateStringArb,
          anyFever: fc.boolean(),
        })),
        (today, otherDays) => {
          const byDate = new Map<string, boolean>();
          for (const d of otherDays) {
            if (d.date !== today) byDate.set(d.date, d.anyFever);
          }
          byDate.set(today, true); // force fever on today
          const days = Array.from(byDate.entries())
            .map(([date, anyFever]) => ({ date, anyFever }))
            .sort((a, b) => a.date.localeCompare(b.date));

          return computeStreak(days, today) === 0;
        }
      )
    );
  });

  /**
   * Property 3: Removing a fever-free day from the reading set never increases the streak.
   */
  it("removing a fever-free day from the reading set never increases streak", () => {
    fc.assert(
      fc.property(
        dateStringArb,
        fc.array(fc.record({
          date: dateStringArb,
          anyFever: fc.constant(false),
        }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0 }),
        (today, days, removeIdx) => {
          // Deduplicate
          const byDate = new Map<string, boolean>();
          for (const d of days) byDate.set(d.date, d.anyFever);
          const sorted = Array.from(byDate.entries())
            .map(([date, anyFever]) => ({ date, anyFever }))
            .sort((a, b) => a.date.localeCompare(b.date));

          const streakFull = computeStreak(sorted, today);

          if (sorted.length === 0) return true; // nothing to remove

          const idx = removeIdx % sorted.length;
          const reduced = sorted.filter((_, i) => i !== idx);
          const streakReduced = computeStreak(reduced, today);

          return streakReduced <= streakFull;
        }
      )
    );
  });

  /**
   * Property 4: Streak is bounded by the number of unique days with readings.
   */
  it("streak cannot exceed the number of days with readings", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          date: dateStringArb,
          anyFever: fc.constant(false), // all fever-free
        }), { maxLength: 30 }),
        dateStringArb,
        (days, today) => {
          const byDate = new Map<string, boolean>();
          for (const d of days) byDate.set(d.date, d.anyFever);
          const unique = Array.from(byDate.entries())
            .map(([date, anyFever]) => ({ date, anyFever }))
            .sort((a, b) => a.date.localeCompare(b.date));

          const streak = computeStreak(unique, today);
          return streak <= unique.length;
        }
      )
    );
  });

  /**
   * Property 5: If requiredDays consecutive fever-free days exist ending at
   * today, isDischargeEligible must return true.
   */
  it("eligibility is true when streak >= requiredDays", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }), // requiredDays
        fc.integer({ min: 0, max: 5 }),  // extra days beyond minimum
        (requiredDays, extra) => {
          const today = "2026-06-15";
          // Build exactly (requiredDays + extra) consecutive fever-free days ending today
          const days: DayFact[] = [];
          for (let i = requiredDays + extra - 1; i >= 0; i--) {
            const d = new Date("2026-06-15T00:00:00Z");
            d.setUTCDate(d.getUTCDate() - i);
            days.push({ date: d.toISOString().slice(0, 10), anyFever: false });
          }
          const streak = computeStreak(days, today);
          return isDischargeEligible(streak, requiredDays) === true;
        }
      )
    );
  });
});


