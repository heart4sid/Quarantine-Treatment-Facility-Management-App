/**
 * POST /api/v1/sync
 * Batch upload of offline outbox (≤100 items, ≤1 MB).
 * TRD §8.2, §9, V1-§5.10
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { batchSyncSchema } from "@/server/api/schemas";
import { processBatchSync } from "@/server/services/sync";
import { Errors, AppError } from "@/lib/errors";

export const POST = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "sync:batch");

  // Check Content-Length for 1MB payload ceiling (TRD §8.2)
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
    throw new AppError("PAYLOAD_TOO_LARGE", 413, "Sync batch exceeds 1 MB limit");
  }

  const body = await req.json().catch(() => null);
  const parsed = batchSyncSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validationError(parsed.error.issues);
  }

  const result = await processBatchSync(parsed.data.items as any, ctx);

  return NextResponse.json(result, { status: 200 });
});
