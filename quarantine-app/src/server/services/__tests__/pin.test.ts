/**
 * Unit tests for bedside tablet fast PIN switch.
 * TRD §7.1, V1-§6 usability
 */

import { describe, it, expect } from "vitest";
import {
  isValidPinFormat,
  hashPin,
  createTabletPinToken,
  verifyTabletPinToken,
} from "../pin";
import { setPinSchema, switchPinSchema } from "@/server/api/schemas";
import { authorize } from "@/server/authz/matrix";
import { verify } from "@node-rs/argon2";
import { randomUUID } from "crypto";

describe("Bedside Tablet PIN Validation (TRD §7.1)", () => {
  it("validates 4 to 6 numeric digits correctly", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("12345")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);

    // Invalid lengths
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);

    // Non-numeric
    expect(isValidPinFormat("123a")).toBe(false);
    expect(isValidPinFormat("abcd")).toBe(false);
    expect(isValidPinFormat(" 1234")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });

  it("hashes and verifies PIN with Argon2id", async () => {
    const pin = "7492";
    const hashed = await hashPin(pin);

    expect(hashed).toMatch(/^\$argon2id\$/);
    const valid = await verify(hashed, pin);
    expect(valid).toBe(true);

    const wrong = await verify(hashed, "9999");
    expect(wrong).toBe(false);
  });

  it("throws validation error when hashing invalid PIN", async () => {
    await expect(hashPin("12")).rejects.toThrow();
    await expect(hashPin("invalid")).rejects.toThrow();
  });
});

describe("Tablet PIN Token signing & verification (TRD §7.1)", () => {
  it("creates and verifies a valid tablet PIN token", () => {
    const userId = randomUUID();
    const facilityId = randomUUID();
    const token = createTabletPinToken({
      userId,
      facilityId,
      roles: ["nurse"],
      displayName: "Staff Nurse Sarah",
    });

    expect(token).toContain(".");
    const verified = verifyTabletPinToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(userId);
    expect(verified?.facilityId).toBe(facilityId);
    expect(verified?.roles).toEqual(["nurse"]);
    expect(verified?.displayName).toBe("Staff Nurse Sarah");
    expect(verified?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects tampered token", () => {
    const token = createTabletPinToken({
      userId: randomUUID(),
      facilityId: randomUUID(),
      roles: ["doctor"],
      displayName: "Dr. Watson",
    });

    const tampered = token.slice(0, -5) + "abcde";
    expect(verifyTabletPinToken(tampered)).toBeNull();
  });

  it("rejects expired token (5-minute idle lock simulation)", () => {
    const expiredTokenData = {
      userId: randomUUID(),
      facilityId: randomUUID(),
      roles: ["doctor"],
      displayName: "Dr. Watson",
      unlockedAt: Date.now() - 10 * 60 * 1000,
      expiresAt: Date.now() - 5 * 60 * 1000, // expired 5m ago
    };

    const jsonStr = JSON.stringify(expiredTokenData);
    const base64Data = Buffer.from(jsonStr).toString("base64url");
    const { createHmac } = require("crypto");
    const secret = process.env.AUTH_SECRET || "antigravity-dev-secret-at-least-32-chars-long";
    const sig = createHmac("sha256", secret).update(base64Data).digest("base64url");
    const expiredToken = `${base64Data}.${sig}`;

    expect(verifyTabletPinToken(expiredToken)).toBeNull();
  });
});

describe("setPinSchema & switchPinSchema Zod validation", () => {
  it("validates setPinSchema", () => {
    expect(setPinSchema.safeParse({ pin: "4455" }).success).toBe(true);
    expect(setPinSchema.safeParse({ pin: "123456" }).success).toBe(true);
    expect(setPinSchema.safeParse({ pin: "123" }).success).toBe(false);
    expect(setPinSchema.safeParse({ pin: "1234567" }).success).toBe(false);
    expect(setPinSchema.safeParse({ pin: "pin1" }).success).toBe(false);
  });

  it("validates switchPinSchema", () => {
    const valid = {
      targetUserId: randomUUID(),
      pin: "8899",
    };
    expect(switchPinSchema.safeParse(valid).success).toBe(true);

    const invalidUser = {
      targetUserId: "not-a-uuid",
      pin: "8899",
    };
    expect(switchPinSchema.safeParse(invalidUser).success).toBe(false);
  });
});

describe("PIN authorization rules", () => {
  it("allows clinical staff and admin to manage PINs", () => {
    expect(authorize(["nurse"], "auth:pin_manage").allowed).toBe(true);
    expect(authorize(["doctor"], "auth:pin_manage").allowed).toBe(true);
    expect(authorize(["admin_staff"], "auth:pin_manage").allowed).toBe(true);
  });

  it("denies external and system roles from tablet PIN switch", () => {
    expect(authorize(["system_admin"], "auth:pin_manage").allowed).toBe(false);
    expect(authorize(["regional_admin"], "auth:pin_manage").allowed).toBe(false);
  });
});
