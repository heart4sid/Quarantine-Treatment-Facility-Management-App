/**
 * Fever-free streak and discharge eligibility engine.
 * TRD §6.2, V1-§4.3, V1-§5.3
 *
 * RULES ENCODED (see DECISIONS.md G1, G2 — PENDING clinical sign-off):
 *
 * G1: A day is a FEVER DAY if ANY effective temperature reading on that
 *     calendar day has is_fever = true (safety-first). Wrong readings are
 *     removed by amendment — not by overwriting with a "correct" value.
 *
 * G2: Calendar days (facility-local date). An unmeasured past day BREAKS
 *     the streak. Today before first measurement is NEUTRAL (streak stops
 *     counting at today and doesn't penalise unmeasured today).
 *
 * This module is PURE (no I/O). The database provides per-day facts;
 * this function computes the result. This makes it 100% testable.
 *
 * Configurable thresholds come from facilities.settings and are passed in
 * as parameters — this module has no knowledge of the database.
 */

/** One entry per calendar day that has at least one effective reading. */
export interface DayFact {
  /** Facility-local date, YYYY-MM-DD format */
  date: string;
  /** true if ANY effective reading that day had is_fever = true (G1) */
  anyFever: boolean;
}

/**
 * Compute the current fever-free streak for a patient.
 *
 * @param days - Array of DayFacts from effective_temperature_readings,
 *               sorted ASCENDING by date. One entry per calendar day.
 * @param today - Today's date in facility-local YYYY-MM-DD format.
 * @returns Number of consecutive fever-free calendar days (0 or more).
 *
 * Algorithm:
 * Walk backwards from today. For each day:
 *   - If no reading exists AND day is today: skip (neutral — G2)
 *   - If no reading exists AND day is in the past: BREAK (G2)
 *   - If reading exists AND is_fever = true: BREAK (G1)
 *   - If reading exists AND is_fever = false: streak++
 */
export function computeStreak(days: DayFact[], today: string): number {
  const byDate = new Map<string, boolean>(days.map((d) => [d.date, d.anyFever]));

  let streak = 0;
  let current = today;

  // Walk backwards day by day. Cap at a reasonable maximum to avoid
  // infinite loops if today is far in the past (clock error or test input).
  const MAX_LOOK_BACK = 365;

  for (let i = 0; i < MAX_LOOK_BACK; i++) {
    const fever = byDate.get(current);

    if (fever === undefined) {
      if (current === today) {
        // Today not yet measured — neutral, continue backward (G2)
        current = prevDate(current);
        continue;
      }
      // Past day with no reading — breaks streak (G2)
      break;
    }

    if (fever) {
      // Any fever reading on this day — breaks streak (G1)
      break;
    }

    // Fever-free day with a valid reading
    streak++;
    current = prevDate(current);
  }

  return streak;
}

/**
 * Determine if a patient is eligible for discharge.
 *
 * @param streak - Result of computeStreak()
 * @param requiredDays - Minimum consecutive fever-free days required.
 *                       From facilities.settings.discharge_streak_days (default 3).
 * @returns true if streak >= requiredDays
 */
export function isDischargeEligible(streak: number, requiredDays: number): boolean {
  if (requiredDays < 1) {
    throw new Error("requiredDays must be >= 1");
  }
  return streak >= requiredDays;
}

/**
 * Get the previous calendar date.
 * Input/output format: YYYY-MM-DD
 */
export function prevDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Format a Date to YYYY-MM-DD in a given IANA timezone.
 * Used to derive local_date at insert time. (TRD §6.1)
 */
export function toLocalDate(utcTimestamp: Date, ianaTimezone: string): string {
  return utcTimestamp.toLocaleDateString("en-CA", {
    timeZone: ianaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA locale produces YYYY-MM-DD format
}

/**
 * Determine if a timestamp is within the accepted clock-skew window.
 * Used to validate offline readings on sync. (TRD §9)
 *
 * @param clientTime - The client_recorded_at timestamp from the offline device
 * @param serverNow - Current server time (passed in for testability)
 * @param maxFutureMs - How far in the future (ms) a client timestamp can be (default: 0)
 * @param maxPastMs - How far in the past (ms) a client timestamp can be (default: 72h)
 * @returns "ok" | "future" | "too_old"
 */
export function validateClockSkew(
  clientTime: Date,
  serverNow: Date,
  maxFutureMs = 0,
  maxPastMs = 72 * 60 * 60 * 1000 // 72 hours
): "ok" | "future" | "too_old" {
  const diff = clientTime.getTime() - serverNow.getTime();
  if (diff > maxFutureMs) return "future";
  if (Math.abs(diff) > maxPastMs && diff < 0) return "too_old";
  return "ok";
}
