/**
 * Client-Side Offline Outbox using Dexie (IndexedDB).
 * TRD §9, V1-§5.10
 *
 * Captures offline writes:
 * - Daily temperature logging
 * - Doctor visits / notes
 *
 * Flushes to POST /api/v1/sync in FIFO order with idempotent client_uuid.
 */

import Dexie, { type Table } from "dexie";
import { v7 as uuidv7 } from "uuid";

export interface OutboxRecord {
  id?: number;
  clientUuid: string;
  type: "temperature" | "visit";
  admissionId: string;
  payload: Record<string, any>;
  clientRecordedAt: string; // ISO 8601 UTC
  status: "pending" | "syncing" | "failed";
  attempts: number;
  errorMessage?: string;
  createdAt: number;
}

export class QuarantineOutboxDB extends Dexie {
  outbox!: Table<OutboxRecord, number>;

  constructor() {
    super("QuarantineOutboxDB");
    this.version(1).stores({
      outbox: "++id, clientUuid, type, status, createdAt",
    });
  }
}

export const outboxDb = typeof window !== "undefined" ? new QuarantineOutboxDB() : null;

/**
 * Enqueue a temperature reading offline.
 */
export async function queueOfflineTemperature(
  admissionId: string,
  valueC: number,
  confirmedDuplicate: boolean = false
): Promise<string> {
  const clientUuid = uuidv7();
  const clientRecordedAt = new Date().toISOString();

  if (outboxDb) {
    await outboxDb.outbox.add({
      clientUuid,
      type: "temperature",
      admissionId,
      payload: { valueC, confirmedDuplicate },
      clientRecordedAt,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    });
  }

  // If online, trigger background flush
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flushOutbox();
  }

  return clientUuid;
}

/**
 * Enqueue a doctor visit offline.
 */
export async function queueOfflineVisit(
  admissionId: string,
  notes?: string,
  noTempException?: boolean,
  exceptionReason?: string
): Promise<string> {
  const clientUuid = uuidv7();
  const clientRecordedAt = new Date().toISOString();

  if (outboxDb) {
    await outboxDb.outbox.add({
      clientUuid,
      type: "visit",
      admissionId,
      payload: { notes, noTempException, exceptionReason },
      clientRecordedAt,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    });
  }

  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flushOutbox();
  }

  return clientUuid;
}

/**
 * Flushes all pending records to POST /api/v1/sync.
 */
export async function flushOutbox(): Promise<{
  success: boolean;
  syncedCount: number;
  remainingCount: number;
}> {
  if (!outboxDb) return { success: false, syncedCount: 0, remainingCount: 0 };

  const pending = await outboxDb.outbox
    .where("status")
    .anyOf(["pending", "failed"])
    .limit(100)
    .toArray();

  if (pending.length === 0) {
    return { success: true, syncedCount: 0, remainingCount: 0 };
  }

  // Mark syncing
  await outboxDb.outbox
    .where("id")
    .anyOf(pending.map((p) => p.id!).filter(Boolean))
    .modify({ status: "syncing" });

  try {
    const items = pending.map((p) => ({
      clientUuid: p.clientUuid,
      type: p.type,
      admissionId: p.admissionId,
      clientRecordedAt: p.clientRecordedAt,
      payload: p.payload,
    }));

    const token = typeof localStorage !== "undefined" ? localStorage.getItem("tablet_pin_token") : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["X-Tablet-PIN-Token"] = token;
    }

    const res = await fetch("/api/v1/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
    });

    if (!res.ok) {
      throw new Error(`Sync failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    let synced = 0;

    for (const result of data.results ?? []) {
      const match = pending.find((p) => p.clientUuid === result.clientUuid);
      if (!match?.id) continue;

      if (result.status === "created" || result.status === "duplicate") {
        await outboxDb.outbox.delete(match.id);
        synced++;
      } else if (result.status === "rejected") {
        await outboxDb.outbox.update(match.id, {
          status: "failed",
          errorMessage: result.reason,
          attempts: match.attempts + 1,
        });
      }
    }

    const remaining = await outboxDb.outbox.count();
    return { success: true, syncedCount: synced, remainingCount: remaining };
  } catch (err: any) {
    console.error("[OUTBOX_FLUSH_ERROR]", err);
    // Revert status to failed
    await outboxDb.outbox
      .where("id")
      .anyOf(pending.map((p) => p.id!).filter(Boolean))
      .modify((item) => {
        item.status = "failed";
        item.attempts = (item.attempts ?? 0) + 1;
        item.errorMessage = err?.message ?? "Network error";
      });

    const remaining = await outboxDb.outbox.count();
    return { success: false, syncedCount: 0, remainingCount: remaining };
  }
}

/**
 * Get count of pending outbox items.
 */
export async function getOutboxPendingCount(): Promise<number> {
  if (!outboxDb) return 0;
  return outboxDb.outbox.where("status").anyOf(["pending", "failed", "syncing"]).count();
}
