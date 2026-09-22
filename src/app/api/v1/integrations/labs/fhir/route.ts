/**
 * FHIR R4 Lab Ingestion and Inbox API Endpoint (v2d).
 * TRD §11.5, V2-§4.6, §5.6
 *
 * POST /api/v1/integrations/labs/fhir
 * - Ingests FHIR R4 Bundles (Observation, DiagnosticReport)
 * - Supports per-source API key authentication (x-api-key) or session auth (lab_result:ingest)
 * - Resolves patient to open admission or queues in lab_results_inbox
 *
 * GET /api/v1/integrations/labs/fhir
 * - Queries facility lab results inbox (filtered by status)
 * - Accessible to Doctor and Admin (lab_result:view)
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { authorize, type UserRole } from "@/server/authz/matrix";
import { userRoles, userFacilityScopes } from "@/db/schema";
import { db } from "@/db/client";
import { eq, and, isNull } from "drizzle-orm";
import { ingestFhirBundle, getLabInbox } from "@/server/services/labs";
import { AppError } from "@/lib/errors";

const EXPECTED_LAB_API_KEY = process.env.LAB_API_KEY || "facility-lab-api-key";

/**
 * Authenticates request either via API Key or Better Auth session.
 */
async function authenticateLabRequest(req: NextRequest): Promise<{
  facilityId: string;
  userId?: string;
  sourceId: string;
  roles?: UserRole[];
}> {
  const hdrs = await headers();
  const apiKey = hdrs.get("x-api-key") || req.nextUrl.searchParams.get("apiKey");
  const headerFacilityId = hdrs.get("x-facility-id") || req.nextUrl.searchParams.get("facilityId");
  const sourceId = hdrs.get("x-source-id") || req.nextUrl.searchParams.get("sourceId") || "external_lab";

  // 1. Check API Key auth
  if (apiKey) {
    if (apiKey !== EXPECTED_LAB_API_KEY) {
      throw new AppError("UNAUTHORIZED", 401, "Invalid lab integration API key");
    }
    if (!headerFacilityId) {
      throw new AppError("VALIDATION_ERROR", 400, "Missing required x-facility-id header for API key auth");
    }
    return { facilityId: headerFacilityId, sourceId };
  }

  // 2. Check Session auth
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user) {
    throw new AppError(
      "UNAUTHORIZED",
      401,
      "Authentication required (provide x-api-key header or active session)"
    );
  }

  const userId = session.user.id;
  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

  const roles = roleRows.map((r) => r.role as UserRole);

  const scopeRows = await db
    .select({ facilityId: userFacilityScopes.facilityId })
    .from(userFacilityScopes)
    .where(and(eq(userFacilityScopes.userId, userId), isNull(userFacilityScopes.revokedAt)));

  if (scopeRows.length === 0) {
    throw new AppError("FORBIDDEN", 403, "User has no facility scopes");
  }

  const facilityId = headerFacilityId || scopeRows[0].facilityId;

  return { facilityId, userId, sourceId, roles };
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateLabRequest(req);

    // If session-authenticated, verify RBAC
    if (authResult.roles) {
      const authz = authorize(authResult.roles, "lab_result:ingest");
      if (!authz.allowed) {
        throw new AppError("FORBIDDEN", 403, authz.reason || "Forbidden");
      }
    }

    const body = await req.json();

    const summary = await ingestFhirBundle({
      facilityId: authResult.facilityId,
      sourceId: authResult.sourceId,
      bundleOrResource: body,
      ctx: {
        userId: authResult.userId,
        requestId: req.headers.get("x-request-id") || undefined,
      },
    });

    return NextResponse.json(summary, { status: 201 });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message || "Failed to ingest FHIR payload" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
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

    const facilityId = req.nextUrl.searchParams.get("facilityId") || scopeRows[0].facilityId;
    const statusParam = req.nextUrl.searchParams.get("status") as any;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);

    const items = await getLabInbox(facilityId, {
      status: statusParam || undefined,
      limit,
    });

    return NextResponse.json(items, { status: 200 });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message || "Failed to fetch lab inbox" },
      { status: 500 }
    );
  }
}
