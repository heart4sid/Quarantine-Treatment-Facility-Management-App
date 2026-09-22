/**
 * POST /api/v1/notifications/[id]/ack
 * Acknowledge a critical clinical notification.
 * TRD §10.2: Critical alerts require acknowledgment to prevent escalation.
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { acknowledgeNotification } from "@/server/services/notifications";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "notification:feed");
  const { id } = await params;

  await acknowledgeNotification(id, ctx.userId);

  return NextResponse.json({ success: true, acknowledgedAt: new Date().toISOString() });
});
