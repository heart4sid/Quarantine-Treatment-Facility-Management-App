/**
 * POST /api/v1/auth/pin/set
 * Set or change fast switch PIN for the authenticated user.
 * TRD §7.1
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { setPinSchema } from "@/server/api/schemas";
import { setUserPin } from "@/server/services/pin";
import { Errors } from "@/lib/errors";

export const POST = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "auth:pin_manage");

  const body = await req.json().catch(() => null);
  const parsed = setPinSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validationError(parsed.error.issues);
  }

  await setUserPin(ctx.userId, parsed.data.pin, ctx.userId);

  return NextResponse.json({
    success: true,
    message: "PIN configured successfully",
  });
});
