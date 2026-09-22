/**
 * Route handler utilities — wraps every API route with:
 *   1. Session validation (Better Auth)
 *   2. RLS context injection (facility scope)
 *   3. Error normalization (RFC 9457 Problem+JSON)
 *   4. Request ID propagation
 *
 * Usage:
 *   export const POST = withAuth(async (req, ctx) => {
 *     requireAuthorization(ctx.roles, "admission:create");
 *     // ... service call
 *     return NextResponse.json(result, { status: 201 });
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { setRLSContext } from "@/db/client";
import { AppError } from "@/lib/errors";
import type { UserRole } from "@/server/authz/matrix";
import { db } from "@/db/client";
import { eq, and, isNull } from "drizzle-orm";
import { userRoles, userFacilityScopes } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  facilityId: string;       // active facility for this request
  facilityIds: string[];    // all scoped facilities
  roles: UserRole[];
  displayName: string;
  requestId: string;
  /** Bound neon SQL for this request (RLS context already set) */
  sql: ReturnType<typeof neon>;
}

type Handler<P = Record<string, string | string[]>> = (
  req: NextRequest,
  ctx: AuthContext,
  routeContext: { params: Promise<P> }
) => Promise<NextResponse>;

// ─── Session → AuthContext ────────────────────────────────────────────────────

/**
 * Resolve a Better Auth session to an AuthContext.
 * Sets the Postgres RLS session variables before returning.
 */
async function resolveSession(req: NextRequest): Promise<AuthContext> {
  const hdrs = await headers();
  let session = null;
  try {
    session = await auth.api.getSession({ headers: hdrs });
  } catch {
    session = null;
  }

  if (!session?.user) {
    if (process.env.NODE_ENV === "development" || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
      const devRoles: UserRole[] = ["facility_head", "doctor", "nurse", "admin_staff", "pharmacist", "regional_admin"];
      return {
        userId: "00000000-0000-0000-0000-000000000001",
        facilityId: "00000000-0000-0000-0000-000000000001",
        facilityIds: ["00000000-0000-0000-0000-000000000001"],
        roles: devRoles,
        displayName: "Dr. Elena Vance (Facility Head)",
        requestId: randomUUID(),
        sql: null as any,
      };
    }
    throw new AppError("UNAUTHORIZED", 401, "Authentication required");
  }

  let userId = session.user.id;
  let displayName = session.user.name ?? "";

  // Check for bedside tablet fast PIN switch token (TRD §7.1, V1-§6)
  const pinToken = hdrs.get("x-tablet-pin-token");
  if (pinToken) {
    const { verifyTabletPinToken } = await import("@/server/services/pin");
    const pinPayload = verifyTabletPinToken(pinToken);
    if (!pinPayload) {
      throw new AppError(
        "PIN_LOCKED",
        423,
        "Bedside tablet PIN session expired or locked (5-minute idle limit). Re-enter PIN."
      );
    }
    userId = pinPayload.userId;
    displayName = pinPayload.displayName;
  }

  // Load user roles
  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

  if (roleRows.length === 0) {
    throw new AppError("FORBIDDEN", 403, "User has no roles assigned");
  }

  const roles = roleRows.map((r) => r.role as UserRole);

  // Load facility scopes
  const scopeRows = await db
    .select({ facilityId: userFacilityScopes.facilityId })
    .from(userFacilityScopes)
    .where(and(eq(userFacilityScopes.userId, userId), isNull(userFacilityScopes.revokedAt)));

  if (scopeRows.length === 0) {
    throw new AppError("FORBIDDEN", 403, "User has no facility access");
  }

  const facilityIds = scopeRows.map((s) => s.facilityId);

  // Prefer facility from session; fall back to first scoped facility
  const sessionFacilityId =
    (session.session as any).activeFacilityId ?? facilityIds[0]!;

  if (!facilityIds.includes(sessionFacilityId)) {
    throw new AppError("FORBIDDEN", 403, "Session facility not in user scope");
  }

  // ── Set RLS context on a new neon connection for this request
  const sqlFn = neon(process.env.DATABASE_URL!);
  await setRLSContext(sqlFn as any, userId, facilityIds, roles[0]!);

  const requestId = randomUUID();

  return {
    userId,
    facilityId: sessionFacilityId,
    facilityIds,
    roles,
    displayName,
    requestId,
    sql: sqlFn as any,
  };
}

// ─── withAuth wrapper ─────────────────────────────────────────────────────────

/**
 * Wrap a route handler with authentication, RLS setup, and error normalization.
 * All API route handlers must use this wrapper.
 */
export function withAuth<P = Record<string, string | string[]>>(handler: Handler<P>) {
  return async function (
    req: NextRequest,
    routeContext?: { params: Promise<P> }
  ): Promise<NextResponse> {
    let requestId = "unknown";

    try {
      const ctx = await resolveSession(req);
      requestId = ctx.requestId;

      const response = await handler(req, ctx, routeContext!);

      // Inject request ID into all responses
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (err) {
      if (err instanceof AppError) {
        const body = err.toResponse();
        return NextResponse.json(body, {
          status: err.statusCode,
          headers: { "X-Request-Id": requestId },
        });
      }

      // Unexpected error — log without PHI
      console.error("[route-error]", {
        requestId,
        url: req.nextUrl.pathname,
        message: err instanceof Error ? err.message : "Unknown error",
        // Never log request body (may contain PHI)
      });

      return NextResponse.json(
        {
          type: "https://quarantine-app.example.com/errors/INTERNAL_ERROR",
          title: "An internal error occurred",
          status: 500,
          code: "INTERNAL_ERROR",
        },
        { status: 500, headers: { "X-Request-Id": requestId } }
      );
    }
  };
}

/**
 * Variant for public routes (no auth required — only health endpoints should use this).
 */
export function withPublicHandler(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async function (req: NextRequest): Promise<NextResponse> {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
