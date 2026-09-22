/**
 * GET /api/v1/events?since=cursor
 * Polling feed for in-app notifications (TRD §8.2, §10.3, V2-§4.1).
 * Foreground clients poll every 30s; background every 2m.
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { listNotifications } from "@/server/services/notifications";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "notification:feed");

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since") || undefined;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));

  const items = await listNotifications(
    ctx.facilityId,
    ctx.userId,
    ctx.roles,
    since,
    limit
  );

  return NextResponse.json({
    items,
    cursor: items.length > 0 ? items[0]!.createdAt : since || new Date().toISOString(),
    count: items.length,
  });
});
