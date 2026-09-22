/**
 * POST /api/v1/medication-orders/[id]/verify
 * Pharmacist verifies an order, moving it to ACTIVE and generating med slots.
 * TRD §8.2, §11.1, V2-§4.2
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { verifyMedicationOrder } from "@/server/services/medication";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "med:verify_order");
  const { id: orderId } = await params;

  const result = await verifyMedicationOrder(orderId, ctx);

  return NextResponse.json(result);
});
