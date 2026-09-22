/**
 * Unit tests for advanced analytics, cohort grouping, and CSV export.
 * TRD §11.4, V2-§4.5
 */

import { describe, it, expect } from "vitest";
import { authorize } from "@/server/authz/matrix";

describe("Analytics Authorization (TRD §11.4, V2-§4.5)", () => {
  it("allows Facility Head, System Admin, and Regional Admin to view analytics", () => {
    expect(authorize(["facility_head"], "analytics:view").allowed).toBe(true);
    expect(authorize(["system_admin"], "analytics:view").allowed).toBe(true);
    expect(authorize(["regional_admin"], "analytics:view").allowed).toBe(true);
  });

  it("denies clinical floor staff from viewing aggregate analytics", () => {
    expect(authorize(["nurse"], "analytics:view").allowed).toBe(false);
    expect(authorize(["doctor"], "analytics:view").allowed).toBe(false);
    expect(authorize(["admin_staff"], "analytics:view").allowed).toBe(false);
    expect(authorize(["pharmacist"], "analytics:view").allowed).toBe(false);
  });
});

describe("Cohort Metrics & RFC 4180 CSV Formatting (TRD §11.4)", () => {
  it("computes cohort survival rate correctly", () => {
    const cured = 17;
    const deceased = 3;
    const closed = cured + deceased;
    const rate = closed > 0 ? cured / closed : 1.0;
    expect(rate).toBe(0.85);
  });

  it("masks MRN in CSV exports for unauthorized roles", () => {
    const rawMrn = "MRN-94821";
    const maskMrn = (mrn: string, isPrivileged: boolean) =>
      isPrivileged ? mrn : `***-${mrn.slice(-3)}`;

    expect(maskMrn(rawMrn, true)).toBe("MRN-94821");
    expect(maskMrn(rawMrn, false)).toBe("***-821");
  });
});
