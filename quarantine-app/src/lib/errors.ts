/**
 * Application error types — RFC 9457 Problem+JSON format.
 * TRD §8.1: "errors as RFC 9457 problem+json with stable code"
 *
 * Every API error has a stable `code` string (used by clients for error handling),
 * an HTTP status, and a human-readable title.
 *
 * Usage in route handlers:
 *   throw new AppError("ADMISSION_AT_CAPACITY", 409, "Facility is at full capacity");
 *   // → { type: "...", title: "...", status: 409, code: "ADMISSION_AT_CAPACITY" }
 */

export type ErrorCode =
  // Capacity / admission
  | "AT_CAPACITY"              // V1-§5.6: facility full, patient waitlisted
  | "BED_UNAVAILABLE"          // Specific bed is taken or inactive
  // Temperatures
  | "DUPLICATE_TODAY"          // V1-§4.2: reading already exists for this local_date
  | "AMENDMENT_REQUIRED"       // Cannot overwrite — must amend
  // Visits
  | "TEMP_MISSING_TODAY"       // V1-§4.3: no effective reading today (428 precondition)
  // Discharge
  | "ELIGIBILITY_CHANGED"      // V1-§4.4: eligibility changed between approval and execution (409)
  | "APPROVAL_VOIDED"          // Approval was voided before execution
  | "NO_ACTIVE_APPROVAL"       // No non-voided approval exists for this admission
  | "NOT_DISCHARGE_ELIGIBLE"   // Patient doesn't meet eligibility criteria
  // Auth
  | "UNAUTHORIZED"             // 401: not authenticated
  | "FORBIDDEN"                // 403: authenticated but not authorized
  | "MFA_REQUIRED"             // TOTP step required
  | "PIN_LOCKED"               // PIN locked after too many failures
  | "SESSION_EXPIRED"          // Session has expired or been revoked
  // Validation
  | "VALIDATION_ERROR"         // 400: request body/params failed Zod validation
  | "IDEMPOTENCY_REPLAY"       // 200: idempotent replay of a previous request
  // Resources
  | "NOT_FOUND"                // 404
  | "CONFLICT"                 // 409: general conflict
  // Rate limiting
  | "RATE_LIMITED"             // 429
  // Server
  | "INTERNAL_ERROR"           // 500
  // Offline sync & batch
  | "CLOCK_SUSPECT"            // Reading flagged as having suspicious client timestamp
  | "SYNC_ITEM_REJECTED"       // One item in a batch sync was rejected
  | "PAYLOAD_TOO_LARGE";       // 413: request body exceeds size limit

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }

  /**
   * Serialize to RFC 9457 Problem+JSON format.
   * https://www.rfc-editor.org/rfc/rfc9457
   */
  toResponse(): ProblemDetail {
    return {
      type: `https://quarantine-app.example.com/errors/${this.code}`,
      title: this.message,
      status: this.statusCode,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  details?: Record<string, unknown>;
}

// ─── Well-known error factories ───────────────────────────────────────────────

export const Errors = {
  atCapacity: (facilityId: string) =>
    new AppError("AT_CAPACITY", 409, "Facility is at full capacity — patient added to waitlist", {
      facilityId,
    }),

  duplicateToday: (admissionId: string, existingReadingId: string, localDate: string) =>
    new AppError("DUPLICATE_TODAY", 409, "A temperature reading already exists for today", {
      admissionId,
      existingReadingId,
      localDate,
    }),

  tempMissingToday: (admissionId: string, localDate: string) =>
    new AppError(
      "TEMP_MISSING_TODAY",
      428, // 428 Precondition Required
      "No temperature reading exists for this patient today — recommend nurse measurement first",
      { admissionId, localDate }
    ),

  eligibilityChanged: (admissionId: string) =>
    new AppError(
      "ELIGIBILITY_CHANGED",
      409,
      "Patient is no longer discharge-eligible — fever may have been logged since approval. Doctor must re-review.",
      { admissionId }
    ),

  approvalVoided: (approvalId: string, reason: string) =>
    new AppError("APPROVAL_VOIDED", 409, `Discharge approval was voided: ${reason}`, {
      approvalId,
    }),

  notFound: (entity: string, id?: string) =>
    new AppError("NOT_FOUND", 404, `${entity} not found${id ? ` (id: ${id})` : ""}`),

  forbidden: (reason: string) =>
    new AppError("FORBIDDEN", 403, reason),

  unauthorized: () =>
    new AppError("UNAUTHORIZED", 401, "Authentication required"),

  validationError: (issues: unknown[]) =>
    new AppError("VALIDATION_ERROR", 400, "Request validation failed", { issues }),

  rateLimited: () =>
    new AppError("RATE_LIMITED", 429, "Too many requests — please slow down"),

  internal: (detail?: string) =>
    new AppError("INTERNAL_ERROR", 500, "An internal error occurred", detail ? { detail } : undefined),
};
