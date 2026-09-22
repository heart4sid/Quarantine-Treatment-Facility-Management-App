/**
 * POST /api/v1/push/subscriptions
 * Register or update browser Web Push VAPID subscription.
 * TRD §8.2, §10.3, V2-§4.1
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { savePushSubscription } from "@/server/services/notifications";
import { Errors } from "@/lib/errors";

export const POST = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "notification:feed");

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    throw Errors.validationError([
      { path: ["subscription"], message: "Valid Web Push subscription with endpoint and keys required" },
    ]);
  }

  const userAgent = req.headers.get("user-agent") || undefined;
  const result = await savePushSubscription(ctx.userId, body, userAgent);

  return NextResponse.json({ success: true, id: result.id });
});
