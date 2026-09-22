/**
 * Better Auth configuration.
 * TRD §7.1: email+password (Argon2id), TOTP MFA, server-side sessions.
 *
 * Required env vars: AUTH_SECRET, DATABASE_URL, NEXT_PUBLIC_APP_URL
 * See .env.example for setup.
 *
 * MFA is REQUIRED for roles: doctor, admin_staff, facility_head, system_admin,
 * regional_admin. Enforced in the session validation middleware.
 *
 * Fast PIN switch: implemented separately in /lib/pin.ts; not part of the
 * Better Auth session lifecycle (PIN unlocks an existing session on a shared
 * tablet; it does not create a new session).
 */

import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  /**
   * Base URL of the app. Required for cookie domains and OAuth redirect URLs.
   */
  baseURL: process.env.NEXT_PUBLIC_APP_URL,

  /**
   * Secret used to sign sessions and encrypt sensitive values.
   * Must be at least 32 random bytes.
   */
  secret: process.env.AUTH_SECRET,

  /**
   * Database adapter — Drizzle with our existing schema.
   * Better Auth will use the users and sessions tables we defined.
   */
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
    },
  }),

  /**
   * Session configuration.
   * - expiresIn: 8 hours (one shift)
   * - updateAge: refresh if session has < 2h remaining (rolling)
   * - cookieCache: false (always validate against DB — required for revocation)
   */
  session: {
    expiresIn: 8 * 60 * 60,       // 8 hours in seconds
    updateAge: 2 * 60 * 60,        // Refresh if < 2h remaining
    cookieCache: {
      enabled: false,               // Always hit DB — enables instant revocation
    },
  },

  /**
   * Email+password authentication.
   * Password hashing: Argon2id (default in Better Auth; configured below).
   * Min password length: 12 characters.
   * Require email verification: false for now (Stage 0 — email not configured).
   *   Stage 1 will enable this.
   */
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: false,
    /**
     * Argon2id parameters — TRD §7.1.
     * timeCost: 3 iterations, memoryCost: 65536 KB (64 MiB), parallelism: 1.
     */
    password: {
      hash: async (password: string) => {
        const { hash } = await import("@node-rs/argon2");
        return hash(password, {
          timeCost: 3,
          memoryCost: 65536,
          parallelism: 1,
          algorithm: 1, // Argon2id
        });
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        const { verify } = await import("@node-rs/argon2");
        return verify(hash, password);
      },
    },
  },

  /**
   * TOTP MFA plugin.
   * Required for doctor, admin_staff, facility_head, system_admin, regional_admin.
   * Nurses are not required to have MFA (shared tablet workflow).
   *
   * The TOTP secret is stored in users.mfa_secret_enc (AES-256-GCM encrypted).
   * Better Auth stores it internally; we sync to our column in the afterMfaSetup hook.
   */
  plugins: [
    twoFactor({
      issuer: "Quarantine Facility",
      // TOTP is the primary factor (otplib/speakeasy compatible)
      otpOptions: {
        digits: 6,
        step: 30,
      },
      // Backup codes: 8 codes, each 10 characters
      backupCodes: {
        enabled: true,
        amount: 8,
        codeLength: 10,
      },
    }),
  ],

  /**
   * Cookie options.
   * httpOnly: true, sameSite: strict, secure: true in production.
   */
  advanced: {
    cookiePrefix: "qtf",
    useSecureCookies: process.env.NODE_ENV === "production",
    crossSubDomainCookies: {
      enabled: false,
    },
  },

  /**
   * Trusted origins for CSRF protection.
   */
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
