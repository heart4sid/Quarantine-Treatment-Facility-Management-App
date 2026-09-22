/**
 * Mortality rate computation and alert logic.
 * TRD §6.7, V1-§4.5, V1-§5.8
 *
 * RULES ENCODED (see DECISIONS.md G9 — PENDING clinical sign-off):
 *
 * Formula: mortality_rate = DECEASED / (DISCHARGED_CURED + DECEASED)
 * - TRANSFERRED is excluded (patient still alive, just moved)
 * - Still-admitted patients are excluded (outcome unknown)
 *
 * Alert fires ONLY when:
 *   1. closed_outcomes (cured + deceased) >= mortality_alert_min_sample (default 10)
 *   2. rate > mortality_alert_threshold (default 0.15)
 *
 * Hysteresis: once alert fires, it will NOT re-fire until the rate drops
 * below (threshold - 0.02) and then crosses the threshold again.
 * This prevents alert spam on small fluctuations. (TRD §6.7)
 *
 * This module is PURE (no I/O). Testable in isolation.
 */

export interface OutcomeCounts {
  /** Count of admissions with outcome = DISCHARGED_CURED in the window */
  cured: number;
  /** Count of admissions with outcome = DECEASED in the window */
  deceased: number;
  /** Count of still-open admissions (excluded from rate; informational) */
  active: number;
  /** Count of TRANSFERRED (excluded from rate; informational) */
  transferred: number;
}

export interface MortalityResult {
  rate: number | null;         // null when totalClosed === 0
  totalClosed: number;         // cured + deceased
  deceased: number;
  cured: number;
  hasSufficientSample: boolean;
  alertShouldFire: boolean;
  description: string;         // human-readable for dashboards
}

export interface MortalityConfig {
  /** Minimum closed outcomes before alert can fire (default 10 — G9) */
  minSample: number;
  /** Threshold above which alert fires (default 0.15 = 15% — G9) */
  threshold: number;
  /**
   * Hysteresis: alert armed? Only relevant when computing re-arm logic.
   * Pass false initially; the caller tracks this state.
   * Once armed=true, the alert fires again only when rate crosses threshold
   * again AFTER falling below (threshold - hysteresisDelta).
   */
  alertCurrentlyActive: boolean;
  /** Hysteresis delta (default 0.02 = 2 percentage points — G9) */
  hysteresisDelta: number;
}

/**
 * Compute mortality rate and determine if alert should fire.
 *
 * @param counts - Outcome counts for the window
 * @param config - Mortality alert configuration
 * @returns MortalityResult with rate, sample check, and alert flag
 */
export function computeMortality(
  counts: OutcomeCounts,
  config: MortalityConfig
): MortalityResult {
  const totalClosed = counts.cured + counts.deceased;
  const rate = totalClosed === 0 ? null : counts.deceased / totalClosed;
  const hasSufficientSample = totalClosed >= config.minSample;

  let alertShouldFire = false;
  if (rate !== null && hasSufficientSample) {
    if (config.alertCurrentlyActive) {
      // Alert is already active — suppress until rate falls below re-arm threshold
      // (Caller tracks alertCurrentlyActive; we only report alertShouldFire here)
      alertShouldFire = rate > config.threshold;
    } else {
      alertShouldFire = rate > config.threshold;
    }
  }

  const pct = rate !== null ? `${(rate * 100).toFixed(1)}%` : "N/A";
  const description = hasSufficientSample
    ? `Mortality rate: ${pct} (${counts.deceased}/${totalClosed})`
    : `Insufficient sample: ${totalClosed}/${config.minSample} minimum closed outcomes`;

  return {
    rate,
    totalClosed,
    deceased: counts.deceased,
    cured: counts.cured,
    hasSufficientSample,
    alertShouldFire,
    description,
  };
}

/**
 * Determine if the alert has "re-armed" — i.e., was previously active and
 * the rate has dropped below the re-arm threshold.
 *
 * The caller should track whether the alert was previously active.
 * When re-armed, the alert can fire again the next time rate > threshold.
 *
 * @param rate - Current mortality rate (null if no sample)
 * @param config - Mortality config
 * @returns true if the alert transitions from active to re-armed
 */
export function isAlertReArmed(
  rate: number | null,
  config: Pick<MortalityConfig, "threshold" | "hysteresisDelta" | "alertCurrentlyActive">
): boolean {
  if (!config.alertCurrentlyActive) return false;
  if (rate === null) return true; // rate disappeared (no outcomes) — re-arm
  return rate < config.threshold - config.hysteresisDelta;
}

/**
 * Benchmark status for dashboard display.
 * The PRD uses 85% survival rate = 15% mortality as the threshold.
 */
export function getSurvivalBenchmarkStatus(
  rate: number | null,
  alertThreshold: number
): "unknown" | "on_track" | "warning" | "critical" {
  if (rate === null) return "unknown";
  if (rate <= alertThreshold * 0.7) return "on_track";
  if (rate <= alertThreshold) return "warning";
  return "critical";
}
