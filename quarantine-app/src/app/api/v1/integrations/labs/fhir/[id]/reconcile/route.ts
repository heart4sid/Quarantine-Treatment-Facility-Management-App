/**
 * Reconcile Unmatched Lab Result API Endpoint (v2d).
 * TRD §11.5, V2-§4.6, §5.6
 *
 * POST /api/v1/integrations/labs/fhir/[id]/reconcile
 * Body: { admissionId: string }
 * Permissions: Doctor, Admin (lab_result:view / reconcile)
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { authorize, type UserRole } from "@/server/authz/matrix";
import { userRoles, userFacilityScopes } from "@/db/schema";
import { db } from "@/db/client";
import { eq, and, isNull } from "drizzle-orm";
import { reconcileLabResult } from "@/server/services/labs";
import { AppError } from "@/lib/errors";

export async function POST(
  req: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const hdrs = await headers();
    const session = await auth.api.getSession({ headers: hdrs });
    if (!session?.user) {
      throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    }

    const userId = session.user.id;
    const roleRows = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

    const roles = roleRows.map((r) => r.role as UserRole);
    const authz = authorize(roles, "lab_result:view");
    if (!authz.allowed) {
      throw new AppError("FORBIDDEN", 403, authz.reason || "Forbidden");
    }

    const scopeRows = await db
      .select({ facilityId: userFacilityScopes.facilityId })
      .from(userFacilityScopes)
      .where(and(eq(userFacilityScopes.userId, userId), isNull(userFacilityScopes.revokedAt)));

    if (scopeRows.length === 0) {
      throw new AppError("FORBIDDEN", 403, "User has no facility scopes");
    }

    const body = await req.json();
    if (!body.admissionId) {
      throw new AppError("VALIDATION_ERROR", 400, "admissionId is required for reconciliation");
    }

    const facilityId = scopeRows[0].facilityId;
    const result = await reconcileLabResult(id, body.admissionId, {
      userId,
      facilityId,
      facilityIds: scopeRows.map((s) => s.facilityId),
      roles,
      displayName: session.user.name ?? "",
      requestId: hdrs.get("x-request-id") || "req-reconcile",
      sql: null as any,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message || "Failed to reconcile lab result" },
      { status: 500 }
    );
  }
}
