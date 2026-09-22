/**
 * Unit tests for offline sync schema, clock skew, and batch validation.
 * TRD §8.2, §9, V1-§5.10
 */

import { describe, it, expect } from "vitest";
import { batchSyncSchema, syncItemSchema } from "@/server/api/schemas";
import { authorize } from "@/server/authz/matrix";
import { randomUUID } from "crypto";

describe("Offline Sync Schemas (TRD §8.2, §9)", () => {
  it("validates temperature sync item", () => {
    const item = {
      clientUuid: randomUUID(),
      type: "temperature",
      admissionId: randomUUID(),
      clientRecordedAt: new Date().toISOString(),
      payload: {
        valueC: 37.8,
        confirmedDuplicate: false,
      },
    };
    expect(syncItemSchema.safeParse(item).success).toBe(true);
  });

  it("validates visit sync item", () => {
    const item = {
      clientUuid: randomUUID(),
      type: "visit",
      admissionId: randomUUID(),
      clientRecordedAt: new Date().toISOString(),
      payload: {
        notes: "Examined patient during rounds",
        noTempException: false,
      },
    };
    expect(syncItemSchema.safeParse(item).success).toBe(true);
  });

  it("enforces batch size limits (1 to 100 items)", () => {
    // Empty batch is rejected
    expect(batchSyncSchema.safeParse({ items: [] }).success).toBe(false);

    // 1 item is valid
    const single = {
      items: [
        {
          clientUuid: randomUUID(),
          type: "temperature",
          admissionId: randomUUID(),
          clientRecordedAt: new Date().toISOString(),
          payload: { valueC: 37.2 },
        },
      ],
    };
    expect(batchSyncSchema.safeParse(single).success).toBe(true);

    // 101 items is rejected (TRD §8.2 ceiling)
    const tooMany = {
      items: Array.from({ length: 101 }, () => ({
        clientUuid: randomUUID(),
        type: "temperature",
        admissionId: randomUUID(),
        clientRecordedAt: new Date().toISOString(),
        payload: { valueC: 37.2 },
      })),
    };
    expect(batchSyncSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("Clock Skew Rules (TRD §9)", () => {
  it("identifies timestamps within acceptable skew (within 72h past and < 5m future)", () => {
    const serverNow = new Date();
    const oneHourAgo = new Date(serverNow.getTime() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(serverNow.getTime() - 48 * 60 * 60 * 1000);
    const oneMinFuture = new Date(serverNow.getTime() + 60 * 1000);

    const checkSkew = (date: Date) => {
      const diff = serverNow.getTime() - date.getTime();
      const isTooOld = diff > 72 * 60 * 60 * 1000;
      const isInFuture = diff < -5 * 60 * 1000;
      return isTooOld || isInFuture; // true = clock_suspect
    };

    expect(checkSkew(oneHourAgo)).toBe(false);
    expect(checkSkew(twoDaysAgo)).toBe(false);
    expect(checkSkew(oneMinFuture)).toBe(false);

    // Out of bounds
    const fourDaysAgo = new Date(serverNow.getTime() - 96 * 60 * 60 * 1000);
    const tenMinFuture = new Date(serverNow.getTime() + 10 * 60 * 1000);

    expect(checkSkew(fourDaysAgo)).toBe(true);
    expect(checkSkew(tenMinFuture)).toBe(true);
  });
});

describe("Sync Authorization Matrix (TRD §8.2)", () => {
  it("allows nurses and doctors to sync offline data", () => {
    expect(authorize(["nurse"], "sync:batch").allowed).toBe(true);
    expect(authorize(["doctor"], "sync:batch").allowed).toBe(true);
  });

  it("denies admin and facility head from syncing offline clinical data", () => {
    expect(authorize(["admin_staff"], "sync:batch").allowed).toBe(false);
    expect(authorize(["facility_head"], "sync:batch").allowed).toBe(false);
    expect(authorize(["system_admin"], "sync:batch").allowed).toBe(false);
  });
});
