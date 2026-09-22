/**
 * Regional Multi-Facility Network Service (v2c).
 * TRD §11.2, V2-§4.3, V2-§5.7
 *
 * Invariant: Regional Admin has NO write path to beds, cannot override capacity,
 * and accesses aggregate facility metrics only (NO patient-level clinical data).
 */

import { db } from "@/db/client";
import { facilities, beds, admissions, waitlistEntries } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { computeMortality } from "@/domain/mortality";

export interface FacilityNetworkSummary {
  id: string;
  name: string;
  timezone: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyPct: number;
  waitlistCount: number;
  mortalityRate7d: number;
  dischargeEligibleCount: number;
}

export interface NetworkMetricsResult {
  networkId: string;
  facilityCount: number;
  totalBeds: number;
  totalOccupied: number;
  overallOccupancyPct: number;
  totalWaitlist: number;
  networkMortalityRate: number;
  facilities: FacilityNetworkSummary[];
}

export async function getNetworkMetrics(networkId?: string): Promise<NetworkMetricsResult> {
  const facilityRows = await db
    .select({
      id: facilities.id,
      name: facilities.name,
      timezone: facilities.timezone,
      settings: facilities.settings,
    })
    .from(facilities)
    .where(isNull(facilities.deactivatedAt));

  const facilitySummaries: FacilityNetworkSummary[] = [];

  let networkTotalBeds = 0;
  let networkTotalOccupied = 0;
  let networkTotalWaitlist = 0;
  let networkTotalDeceased = 0;
  let networkTotalCured = 0;

  for (const fac of facilityRows) {
    // 1. Bed capacity
    const [bedCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(beds)
      .where(and(eq(beds.facilityId, fac.id), eq(beds.isActive, true)));
    const totalBeds = bedCountRow?.count ?? 0;

    // 2. Open admissions
    const [openAdmissionsRow] = await db
      .select({
        occupied: sql<number>`count(*)::int`,
        eligible: sql<number>`count(*) filter (where discharge_eligible_since is not null)::int`,
      })
      .from(admissions)
      .where(and(eq(admissions.facilityId, fac.id), isNull(admissions.closedAt)));

    const occupiedBeds = openAdmissionsRow?.occupied ?? 0;
    const dischargeEligibleCount = openAdmissionsRow?.eligible ?? 0;
    const availableBeds = Math.max(0, totalBeds - occupiedBeds);
    const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // 3. Waitlist count
    const [waitlistRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.facilityId, fac.id), eq(waitlistEntries.status, "WAITING")));
    const waitlistCount = waitlistRow?.count ?? 0;

    // 4. Rolling 7-day mortality
    const outcomeRows = await db.execute(sql`
      SELECT outcome, count(*)::int as count
      FROM admissions
      WHERE facility_id = ${fac.id}
        AND closed_at >= NOW() - INTERVAL '7 days'
        AND outcome IS NOT NULL
      GROUP BY outcome
    `);

    let cured7d = 0;
    let deceased7d = 0;
    for (const r of outcomeRows as unknown as any[]) {
      if (r.outcome === "DISCHARGED_CURED") cured7d = Number(r.count);
      if (r.outcome === "DECEASED") deceased7d = Number(r.count);
    }

    const closed7d = cured7d + deceased7d;
    const mortalityRate7d = closed7d > 0 ? Math.round((deceased7d / closed7d) * 1000) / 1000 : 0.15;

    // Accumulate network totals
    networkTotalBeds += totalBeds;
    networkTotalOccupied += occupiedBeds;
    networkTotalWaitlist += waitlistCount;
    networkTotalCured += cured7d;
    networkTotalDeceased += deceased7d;

    facilitySummaries.push({
      id: fac.id,
      name: fac.name,
      timezone: fac.timezone,
      totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyPct,
      waitlistCount,
      mortalityRate7d,
      dischargeEligibleCount,
    });
  }

  const overallOccupancyPct =
    networkTotalBeds > 0 ? Math.round((networkTotalOccupied / networkTotalBeds) * 100) : 0;
  const netClosed = networkTotalCured + networkTotalDeceased;
  const networkMortalityRate =
    netClosed > 0 ? Math.round((networkTotalDeceased / netClosed) * 1000) / 1000 : 0.15;

  return {
    networkId: networkId || "default-regional-network",
    facilityCount: facilitySummaries.length,
    totalBeds: networkTotalBeds,
    totalOccupied: networkTotalOccupied,
    overallOccupancyPct,
    totalWaitlist: networkTotalWaitlist,
    networkMortalityRate,
    facilities: facilitySummaries,
  };
}
