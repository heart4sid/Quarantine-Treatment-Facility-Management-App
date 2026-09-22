/**
 * GET /api/health
 * Shallow healthcheck — returns quickly without hitting the DB.
 * Used by: Vercel health checks, uptime monitors, load balancers.
 * Must respond in <100ms even during high load. (TRD §14)
 */

import { NextResponse } from "next/server";

export const runtime = "edge"; // Fastest possible response
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      stage: process.env.NEXT_PUBLIC_STAGE ?? "0",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache",
        "X-Health-Check": "shallow",
      },
    }
  );
}
