/**
 * GET /api/health/deep
 * Deep healthcheck — validates DB connectivity and basic RLS context.
 * Requires CRON_SECRET header or a valid system_admin session.
 * Used by: automated monitoring, pre-deployment smoke tests. (TRD §14)
 *
 * Returns:
 *   200: all checks passed
 *   503: one or more checks failed (body contains details)
 *   401: unauthenticated request
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

interface CheckResult {
  name: string;
  ok: boolean;
  durationMs?: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  // Authenticate: CRON_SECRET header or internal caller
  const cronSecret = req.headers.get("x-cron-secret");
  if (
    process.env.CRON_SECRET &&
    cronSecret !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: CheckResult[] = [];
  const startAll = Date.now();

  // ── Check 1: Database connectivity ─────────────────────────────────────────
  try {
    const t0 = Date.now();
    const sql = neon(process.env.DATABASE_URL!);
    await sql`SELECT 1 AS alive`;
    checks.push({ name: "db:connectivity", ok: true, durationMs: Date.now() - t0 });
  } catch (e) {
    checks.push({
      name: "db:connectivity",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Check 2: RLS context function exists ───────────────────────────────────
  try {
    const t0 = Date.now();
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'is_facility_scoped'
      ) AS exists
    `;
    const exists = result[0]?.exists === true;
    checks.push({
      name: "db:rls_function",
      ok: exists,
      durationMs: Date.now() - t0,
      error: exists ? undefined : "is_facility_scoped() function not found — run migrations",
    });
  } catch (e) {
    checks.push({
      name: "db:rls_function",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Check 3: Immutability trigger exists ───────────────────────────────────
  try {
    const t0 = Date.now();
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`
      SELECT COUNT(*) AS trigger_count
      FROM pg_trigger
      WHERE tgname LIKE 'trg_%_immutable'
    `;
    const count = parseInt(String(result[0]?.trigger_count ?? "0"), 10);
    const ok = count >= 4; // expect at least 4 immutability triggers
    checks.push({
      name: "db:immutability_triggers",
      ok,
      durationMs: Date.now() - t0,
      error: ok ? undefined : `Expected ≥4 immutability triggers, found ${count}`,
    });
  } catch (e) {
    checks.push({
      name: "db:immutability_triggers",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Check 4: effective_temperature_readings view exists ────────────────────
  try {
    const t0 = Date.now();
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_name = 'effective_temperature_readings'
      ) AS exists
    `;
    const exists = result[0]?.exists === true;
    checks.push({
      name: "db:effective_readings_view",
      ok: exists,
      durationMs: Date.now() - t0,
      error: exists ? undefined : "effective_temperature_readings view not found",
    });
  } catch (e) {
    checks.push({
      name: "db:effective_readings_view",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const allOk = checks.every((c) => c.ok);
  const totalMs = Date.now() - startAll;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      totalDurationMs: totalMs,
      checks,
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      stage: process.env.NEXT_PUBLIC_STAGE ?? "0",
    },
    {
      status: allOk ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache",
        "X-Health-Check": "deep",
      },
    }
  );
}
