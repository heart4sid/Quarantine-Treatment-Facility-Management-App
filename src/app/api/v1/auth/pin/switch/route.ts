/**
 * POST /api/v1/auth/pin/switch
 * Switch active staff member on a shared bedside tablet using their short PIN.
 * TRD §7.1, V1-§6
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { switchPinSchema } from "@/server/api/schemas";
import { verifyAndSwitchPin } from "@/server/services/pin";
import { Errors } from "@/lib/errors";

export const POST = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "auth:pin_manage");

  const body = await req.json().catch(() => null);
  const parsed = switchPinSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validationError(parsed.error.issues);
  }

  const result = await verifyAndSwitchPin(
    parsed.data.targetUserId,
    parsed.data.pin,
    ctx.facilityId
  );

  if (!result.success) {
    const status = result.lockedUntil ? 423 : 401;
    return NextResponse.json(
      {
        success: false,
        reason: result.reason,
        attemptsRemaining: result.attemptsRemaining,
        lockedUntil: result.lockedUntil,
      },
      { status }
    );
  }

  const res = NextResponse.json({
    success: true,
    token: result.token,
    user: result.user,
  });

  // Also set cookie for convenience
  if (result.token) {
    res.cookies.set("tablet_pin_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60, // 5 minutes
      path: "/",
    });
  }

  return res;
});
