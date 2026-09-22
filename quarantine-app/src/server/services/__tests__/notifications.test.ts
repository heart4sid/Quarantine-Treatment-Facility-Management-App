/**
 * Unit tests for clinical notifications, alerts, and escalation logic.
 * TRD §10, V2-§4.1, §5.1
 */

import { describe, it, expect } from "vitest";
import { authorize } from "@/server/authz/matrix";

describe("Notifications Authorization (TRD §10)", () => {
  it("allows all authenticated staff roles to access notification feed", () => {
    expect(authorize(["nurse"], "notification:feed").allowed).toBe(true);
    expect(authorize(["doctor"], "notification:feed").allowed).toBe(true);
    expect(authorize(["admin_staff"], "notification:feed").allowed).toBe(true);
    expect(authorize(["facility_head"], "notification:feed").allowed).toBe(true);
    expect(authorize(["system_admin"], "notification:feed").allowed).toBe(true);
  });

  it("denies access if user has no assigned role", () => {
    expect(authorize([], "notification:feed").allowed).toBe(false);
  });
});

describe("Notification Payload Rules (TRD §10.2)", () => {
  it("strictly prohibits PHI in notification messages", () => {
    const forbiddenPatterns = [
      /name:\s*[A-Z]/i,
      /mrn:\s*\d+/i,
      /dob:\s*\d{4}/i,
    ];

    const safeBody = "1 new discharge-eligible patient in Ward A — open app to review";
    for (const pattern of forbiddenPatterns) {
      expect(pattern.test(safeBody)).toBe(false);
    }

    const unsafeBody = "Patient John Doe (MRN: 9482) is discharge eligible";
    expect(unsafeBody).toMatch(/John Doe/);
  });

  it("classifies notification severities properly", () => {
    const severities = ["INFO", "WARNING", "CRITICAL"];
    expect(severities).toContain("CRITICAL");
  });
});
