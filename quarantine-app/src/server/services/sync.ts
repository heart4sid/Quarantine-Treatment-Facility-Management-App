/**
 * Offline Sync Service — batch synchronization of offline outbox.
 * TRD §8.2, §9, V1-§5.10
 *
 * Rules:
 * 1. Batch size ≤ 100 items, payload ≤ 1 MB.
 * 2. Processes items independently and idempotently via client_uuid.
 * 3. Clock skew handling:
 *    - Valid skew: within 72h past and not > 5 min in the future.
 *    - Invalid skew: flag clock_suspect = true, use server time for local_date.
 *    - Skew > 5 minutes is logged.
 * 4. Response lists per-item results (created / duplicate / rejected + reason).
 */

import { db } from "@/db/client";
import { temperatureReadings, visits } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logTemperature } from "./temperatures";
import { recordVisit } from "./visits";
import { AppError } from "@/lib/errors";
import type { AuthContext } from "@/server/api/handler";

export interface SyncItem {
  clientUuid: string;
  type: "temperature" | "visit";
  clientRecordedAt: string; // ISO 8601 UTC
  admissionId: string;
  payload: Record<string, any>;
}

export interface SyncItemResult {
  clientUuid: string;
  type: "temperature" | "visit";
  status: "created" | "duplicate" | "rejected";
  id?: string;
  reason?: string;
}

export interface BatchSyncResult {
  total: number;
  created: number;
  duplicates: number;
  rejected: number;
  results: SyncItemResult[];
}

/**
 * Process batch of offline sync items.
 */
export async function processBatchSync(
  items: SyncItem[],
  ctx: AuthContext
): Promise<BatchSyncResult> {
  if (!items || items.length === 0) {
    return { total: 0, created: 0, duplicates: 0, rejected: 0, results: [] };
  }

  if (items.length > 100) {
    throw new AppError("VALIDATION_ERROR", 400, "Batch size exceeds maximum of 100 items (TRD §8.2)");
  }

  const results: SyncItemResult[] = [];
  let created = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const item of items) {
    try {
      if (item.type === "temperature") {
        // Idempotency check: see if reading already stored
        const [existing] = await db
          .select({ id: temperatureReadings.id })
          .from(temperatureReadings)
          .where(eq(temperatureReadings.clientUuid, item.clientUuid));

        if (existing) {
          results.push({
            clientUuid: item.clientUuid,
            type: "temperature",
            status: "duplicate",
            id: existing.id,
          });
          duplicates++;
          continue;
        }

        // Clock skew check
        const clientDate = new Date(item.clientRecordedAt);
        const serverNow = new Date();
        const skewMs = serverNow.getTime() - clientDate.getTime();
        const isTooOld = skewMs > 72 * 60 * 60 * 1000;
        const isInFuture = skewMs < -5 * 60 * 1000;
        const clockSuspect = isTooOld || isInFuture;

        if (Math.abs(skewMs) > 5 * 60 * 1000) {
          console.warn(
            `[SYNC_CLOCK_SKEW] client_uuid=${item.clientUuid} skewMs=${skewMs} clockSuspect=${clockSuspect}`
          );
        }

        const reading = await logTemperature(
          item.admissionId,
          {
            valueC: Number(item.payload.valueC),
            clientRecordedAt: item.clientRecordedAt,
            clientUuid: item.clientUuid,
            // Offline duplicates for the same day are both retained (TRD §9)
            confirmedDuplicate: item.payload.confirmedDuplicate ?? true,
          },
          ctx
        );

        results.push({
          clientUuid: item.clientUuid,
          type: "temperature",
          status: "created",
          id: reading.readingId,
        });
        created++;
      } else if (item.type === "visit") {
        // Idempotency check for visit
        const [existingVisit] = await db
          .select({ id: visits.id })
          .from(visits)
          .where(eq(visits.clientUuid, item.clientUuid));

        if (existingVisit) {
          results.push({
            clientUuid: item.clientUuid,
            type: "visit",
            status: "duplicate",
            id: existingVisit.id,
          });
          duplicates++;
          continue;
        }

        const visit = await recordVisit(
          item.admissionId,
          {
            notes: item.payload.notes,
            noTempException: Boolean(item.payload.noTempException),
            exceptionReason: item.payload.exceptionReason,
            clientStartedAt: item.clientRecordedAt,
            clientUuid: item.clientUuid,
          },
          ctx
        );

        results.push({
          clientUuid: item.clientUuid,
          type: "visit",
          status: "created",
          id: visit.visitId,
        });
        created++;
      } else {
        results.push({
          clientUuid: item.clientUuid,
          type: item.type,
          status: "rejected",
          reason: `Unsupported sync item type: ${item.type}`,
        });
        rejected++;
      }
    } catch (err: any) {
      console.error(`[SYNC_ITEM_ERROR] clientUuid=${item.clientUuid}`, err);
      results.push({
        clientUuid: item.clientUuid,
        type: item.type,
        status: "rejected",
        reason: err?.message || "Failed to process item",
      });
      rejected++;
    }
  }

  return {
    total: items.length,
    created,
    duplicates,
    rejected,
    results,
  };
}
