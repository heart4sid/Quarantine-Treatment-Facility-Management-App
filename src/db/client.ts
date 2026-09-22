/**
 * Database client — Neon serverless driver with Drizzle ORM.
 * Uses pooled connection string (required for serverless edge functions).
 *
 * RLS session setup: every request must call setRLSContext() before any query.
 * This sets transaction-local Postgres settings for facility_id and role,
 * which the RLS policies read via current_setting(). (TRD §7.3)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://mock_user:mock_pass@localhost:5432/mock_db";

/**
 * Drizzle ORM instance — the primary DB client for all server-side code.
 * Import and use `db` everywhere; never create a new drizzle() instance.
 */
export const db = drizzle(neon(connectionString), { schema });

/**
 * Type-safe reference to the Drizzle client (useful for type inference).
 */
export type DB = typeof db;

/**
 * Set Postgres transaction-local RLS context.
 * MUST be called at the start of every request that touches tenant tables.
 * Transaction-local (true) is safe with pooled connections — the setting
 * is cleared automatically when the transaction ends. (TRD §7.3)
 *
 * @param sql - A neon() sql function bound to the current request
 * @param userId - The authenticated user's ID
 * @param facilityIds - Array of facility IDs the user is scoped to
 * @param role - The user's role
 */
export async function setRLSContext(
  sql: ReturnType<typeof neon>,
  userId: string,
  facilityIds: string[],
  role: string
): Promise<void> {
  await sql`
    SELECT
      set_config('app.user_id',      ${userId},                     true),
      set_config('app.facility_ids', ${facilityIds.join(",")},     true),
      set_config('app.role',         ${role},                       true)
  `;
}

export { schema };
