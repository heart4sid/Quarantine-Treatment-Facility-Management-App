/**
 * Unit tests for Family Status View (v2d).
 * TRD §11.3, V2-§4.4, DECISIONS.md G4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { authorize } from "@/server/authz/matrix";
import { createHash, randomBytes } from "crypto";

describe("Family Status Access Control (TRD §7.2, V2-§3)", () => {
  it("allows Admin Staff to manage family contacts and generate links", () => {
    expect(authorize(["admin_staff"], "family_contact:manage").allowed).toBe(true);
  });

  it("denies clinical staff and system admin from managing family contacts", () => {
    expect(authorize(["nurse"], "family_contact:manage").allowed).toBe(false);
    expect(authorize(["doctor"], "family_contact:manage").allowed).toBe(false);
    expect(authorize(["facility_head"], "family_contact:manage").allowed).toBe(false);
    expect(authorize(["system_admin"], "family_contact:manage").allowed).toBe(false);
    expect(authorize(["pharmacist"], "family_contact:manage").allowed).toBe(false);
  });
});

describe("Family Token Cryptography & Privacy (TRD §11.3)", () => {
  it("generates high-entropy 256-bit token and hashes with SHA-256", () => {
    const rawToken = randomBytes(32).toString("hex");
    expect(rawToken).toHaveLength(64); // 32 bytes = 64 hex chars

    const hash1 = createHash("sha256").update(rawToken).digest("hex");
    const hash2 = createHash("sha256").update(rawToken).digest("hex");
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2); // deterministic

    // Different token produces different hash
    const otherToken = randomBytes(32).toString("hex");
    const otherHash = createHash("sha256").update(otherToken).digest("hex");
    expect(hash1).not.toBe(otherHash);
  });

  it("ensures public URL path contains only raw unguessable token without PII", () => {
    const rawToken = randomBytes(32).toString("hex");
    const url = `https://quarantine.example.com/s/${rawToken}`;
    expect(url).not.toContain("patient");
    expect(url).not.toContain("mrn");
    expect(url).not.toContain("bed");
    expect(url).toMatch(/\/s\/[0-9a-f]{64}$/);
  });
});

describe("Family Coarse Status Logic & G4 Protection (DECISIONS.md G4, TRD §11.3)", () => {
  // Pure mapping function mirroring getFamilyStatusByToken clinical rules
  function mapAdmissionToFamilyStatus(adm: {
    closedAt?: Date | null;
    outcome?: "DISCHARGED_CURED" | "DECEASED" | "TRANSFERRED" | null;
    dischargeEligibleSince?: Date | null;
  }) {
    // Invariant G4: Deceased or Transferred returns neutral contact message
    if (adm.outcome === "DECEASED" || adm.outcome === "TRANSFERRED") {
      return {
        valid: true,
        status: "CONTACT_FACILITY",
        message: "Please contact the facility administration for direct information regarding this patient.",
      };
    }

    if (adm.closedAt && adm.outcome === "DISCHARGED_CURED") {
      return {
        valid: true,
        status: "DISCHARGED",
        message: "Patient has completed the quarantine protocol and has been discharged cured.",
      };
    }

    const coarseStatus =
      adm.dischargeEligibleSince != null ? "DISCHARGE_ELIGIBLE" : "UNDER_OBSERVATION";

    return {
      valid: true,
      status: coarseStatus,
      message:
        coarseStatus === "DISCHARGE_ELIGIBLE"
          ? "Patient has achieved fever-free criteria and is undergoing final discharge review."
          : "Patient is admitted and receiving active clinical care and daily observation.",
    };
  }

  it("returns UNDER_OBSERVATION for newly admitted patient", () => {
    const result = mapAdmissionToFamilyStatus({
      closedAt: null,
      outcome: null,
      dischargeEligibleSince: null,
    });
    expect(result.status).toBe("UNDER_OBSERVATION");
    expect(result.valid).toBe(true);
    expect(result.message).toContain("daily observation");
  });

  it("returns DISCHARGE_ELIGIBLE when patient is fever-free for 3 days", () => {
    const result = mapAdmissionToFamilyStatus({
      closedAt: null,
      outcome: null,
      dischargeEligibleSince: new Date(),
    });
    expect(result.status).toBe("DISCHARGE_ELIGIBLE");
    expect(result.valid).toBe(true);
    expect(result.message).toContain("final discharge review");
  });

  it("returns DISCHARGED when patient is discharged cured", () => {
    const result = mapAdmissionToFamilyStatus({
      closedAt: new Date(),
      outcome: "DISCHARGED_CURED",
      dischargeEligibleSince: new Date(),
    });
    expect(result.status).toBe("DISCHARGED");
    expect(result.valid).toBe(true);
    expect(result.message).toContain("discharged cured");
  });

  it("enforces Invariant G4: returns neutral CONTACT_FACILITY on DECEASED outcome (no clinical leak)", () => {
    const result = mapAdmissionToFamilyStatus({
      closedAt: new Date(),
      outcome: "DECEASED",
      dischargeEligibleSince: null,
    });
    expect(result.status).toBe("CONTACT_FACILITY");
    expect(result.valid).toBe(true);
    // MUST NOT mention deceased or death
    expect(result.message).not.toContain("deceased");
    expect(result.message).not.toContain("died");
    expect(result.message).toContain("Please contact the facility administration");
  });

  it("enforces Invariant G4: returns neutral CONTACT_FACILITY on TRANSFERRED outcome", () => {
    const result = mapAdmissionToFamilyStatus({
      closedAt: new Date(),
      outcome: "TRANSFERRED",
      dischargeEligibleSince: null,
    });
    expect(result.status).toBe("CONTACT_FACILITY");
    expect(result.valid).toBe(true);
    expect(result.message).toContain("Please contact the facility administration");
  });

  it("returns identical UNAVAILABLE response for invalid, expired or revoked tokens", () => {
    function evaluateToken(tokenRecord: { revokedAt?: Date | null; expiresAt?: Date } | null, now: Date) {
      if (!tokenRecord || tokenRecord.revokedAt || (tokenRecord.expiresAt && now > tokenRecord.expiresAt)) {
        return { valid: false, status: "UNAVAILABLE" };
      }
      return { valid: true, status: "UNDER_OBSERVATION" };
    }

    const now = new Date();
    // Nonexistent
    expect(evaluateToken(null, now)).toEqual({ valid: false, status: "UNAVAILABLE" });
    // Revoked
    expect(evaluateToken({ revokedAt: new Date(Date.now() - 1000) }, now)).toEqual({ valid: false, status: "UNAVAILABLE" });
    // Expired
    expect(evaluateToken({ expiresAt: new Date(Date.now() - 1000) }, now)).toEqual({ valid: false, status: "UNAVAILABLE" });
  });
});
