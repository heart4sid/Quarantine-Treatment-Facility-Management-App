/**
 * Unit tests for FHIR R4 Lab Ingestion and Inbox Service (v2d).
 * TRD §11.5, V2-§4.6, V2-§5.6
 */

import { describe, it, expect } from "vitest";
import { parseFhirPayload } from "../labs";
import { authorize } from "@/server/authz/matrix";

describe("FHIR Lab Ingestion Authorization (TRD §7.2, V2-§4.6)", () => {
  it("allows Admin Staff and System Admin to ingest lab results", () => {
    expect(authorize(["admin_staff"], "lab_result:ingest").allowed).toBe(true);
    expect(authorize(["system_admin"], "lab_result:ingest").allowed).toBe(true);
  });

  it("denies clinical staff from direct lab ingestion endpoint", () => {
    expect(authorize(["nurse"], "lab_result:ingest").allowed).toBe(false);
    expect(authorize(["doctor"], "lab_result:ingest").allowed).toBe(false);
    expect(authorize(["facility_head"], "lab_result:ingest").allowed).toBe(false);
    expect(authorize(["pharmacist"], "lab_result:ingest").allowed).toBe(false);
  });

  it("allows Doctor and Admin to view lab results inbox", () => {
    expect(authorize(["doctor"], "lab_result:view").allowed).toBe(true);
    expect(authorize(["admin_staff"], "lab_result:view").allowed).toBe(true);
  });

  it("denies Nurse from viewing external lab results", () => {
    expect(authorize(["nurse"], "lab_result:view").allowed).toBe(false);
  });
});

describe("FHIR R4 Payload Parser (TRD §11.5)", () => {
  it("parses single Observation resource with quantitative result", () => {
    const observation = {
      resourceType: "Observation",
      id: "obs-wbc-101",
      status: "final",
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "6690-2",
            display: "Leukocytes [#/volume] in Blood by Automated count",
          },
        ],
        text: "WBC Count",
      },
      subject: {
        reference: "Patient/MRN-90210",
      },
      valueQuantity: {
        value: 14.5,
        unit: "10*3/uL",
      },
      referenceRange: [
        {
          low: { value: 4.5 },
          high: { value: 11.0 },
          text: "4.5 - 11.0 10*3/uL",
        },
      ],
      interpretation: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
              code: "H",
              display: "High",
            },
          ],
        },
      ],
    };

    const parsed = parseFhirPayload(observation);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].externalId).toBe("obs-wbc-101");
    expect(parsed[0].testName).toBe("WBC Count");
    expect(parsed[0].testCode).toBe("6690-2");
    expect(parsed[0].resultValue).toBe("14.5");
    expect(parsed[0].unit).toBe("10*3/uL");
    expect(parsed[0].referenceRange).toBe("4.5 - 11.0 10*3/uL");
    expect(parsed[0].isAbnormal).toBe(true);
    expect(parsed[0].patientIdentifierRaw).toBe("MRN-90210");
  });

  it("parses FHIR Bundle containing RT-PCR DiagnosticReport & Observations", () => {
    const bundle = {
      resourceType: "Bundle",
      id: "bundle-covid-001",
      type: "transaction",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "pat-local",
            identifier: [
              {
                system: "urn:oid:facility:mrn",
                value: "MRN-55443",
              },
            ],
          },
        },
        {
          resource: {
            resourceType: "Observation",
            id: "obs-pcr-01",
            code: {
              coding: [
                {
                  system: "http://loinc.org",
                  code: "94500-6",
                  display: "SARS-CoV-2 RNA",
                },
              ],
            },
            valueString: "POSITIVE",
            interpretation: [
              {
                coding: [{ code: "POS" }],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: "DiagnosticReport",
            id: "rep-pcr-summary",
            code: {
              text: "Viral Panel Summary",
            },
            conclusion: "SARS-CoV-2 Detected via RT-PCR",
          },
        },
      ],
    };

    const parsed = parseFhirPayload(bundle);
    expect(parsed).toHaveLength(2);

    // First item inherited patient identifier from bundle's Patient entry
    expect(parsed[0].externalId).toBe("obs-pcr-01");
    expect(parsed[0].testName).toBe("SARS-CoV-2 RNA");
    expect(parsed[0].resultValue).toBe("POSITIVE");
    expect(parsed[0].isAbnormal).toBe(true);
    expect(parsed[0].patientIdentifierRaw).toBe("MRN-55443");

    // Second item (DiagnosticReport)
    expect(parsed[1].externalId).toBe("rep-pcr-summary");
    expect(parsed[1].testName).toBe("Viral Panel Summary");
    expect(parsed[1].resultValue).toBe("SARS-CoV-2 Detected via RT-PCR");
    expect(parsed[1].isAbnormal).toBe(true); // Detected = abnormal
    expect(parsed[1].patientIdentifierRaw).toBe("MRN-55443");
  });

  it("extracts direct subject.identifier if present on Observation", () => {
    const observation = {
      resourceType: "Observation",
      id: "obs-platelet-1",
      code: { text: "Platelets" },
      subject: {
        identifier: {
          system: "urn:id:nat-hash",
          value: "hash-8899aabb",
        },
      },
      valueQuantity: { value: 250, unit: "k/uL" },
    };

    const parsed = parseFhirPayload(observation);
    expect(parsed[0].patientIdentifierRaw).toBe("hash-8899aabb");
    expect(parsed[0].isAbnormal).toBe(false);
  });

  it("rejects invalid payloads with VALIDATION_ERROR", () => {
    expect(() => parseFhirPayload(null)).toThrow("Invalid FHIR payload");
    expect(() => parseFhirPayload({ resourceType: "MedicationRequest" })).toThrow(
      "Unsupported FHIR resourceType"
    );
    expect(() => parseFhirPayload({ resourceType: "Bundle", entry: [] })).toThrow(
      "FHIR payload contains no Observation or DiagnosticReport"
    );
  });
});
