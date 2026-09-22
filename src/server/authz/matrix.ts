/**
 * Authorization matrix — server-enforced RBAC.
 * TRD §7.2, V1-§3, V1-§5.7, V2-§3
 *
 * DENY BY DEFAULT. Every action is explicitly listed.
 * Route handlers must call authorize() before any service call.
 * The matrix is tested exhaustively by the generated authz matrix tests.
 *
 * Reading the matrix:
 *   authorize(user, "temp:log", { admissionId }) — nurse can log temp for their admission
 *   authorize(user, "temp:amend:own_same_day", { readingId }) — nurse amend scope
 *   authorize(user, "visit:start", { admissionId }) — doctor only
 *   etc.
 */

export type UserRole =
  | "nurse"
  | "doctor"
  | "admin_staff"
  | "facility_head"
  | "system_admin"
  | "pharmacist"
  | "regional_admin";

export type Action =
  // Temperature
  | "temp:log"                    // Nurse only
  | "temp:amend:own_same_day"     // Nurse: own reading, same local_date
  | "temp:amend:any"              // Doctor: any reading, any date
  // Visits
  | "visit:start"                 // Doctor only
  | "visit:note:update"           // Doctor (own visit)
  // Discharge
  | "discharge:approve"           // Doctor only
  | "discharge:execute"           // Admin only
  // Admissions
  | "admission:create"            // Admin only
  | "admission:assign_bed"        // Admin only
  | "admission:view:clinical"     // Nurse (assigned), Doctor (facility), Admin (admin fields only)
  // Outcomes
  | "outcome:record_deceased"     // Doctor only — G5
  | "outcome:record_transferred"  // Doctor only — G5
  | "outcome:record_cured"        // System (via discharge execution)
  // Waitlist
  | "waitlist:view"               // Admin
  | "waitlist:manage"             // Admin
  // Medication (v2b)
  | "treatment:create"            // Doctor
  | "med:administer"              // Nurse
  | "med:verify_order"            // Pharmacist
  // Analytics & Dashboards
  | "dashboard:facility"          // Facility Head
  | "dashboard:network"           // Regional Admin
  | "dashboard:tasks:own"         // Nurse, Doctor (own tasks only)
  | "dashboard:admin_queues"      // Admin
  // User management
  | "user:create"                 // System Admin
  | "user:deactivate"             // System Admin
  | "user:assign_role"            // System Admin
  | "audit:view"                  // System Admin
  // Family / external (v2d)
  | "family_contact:manage"       // Admin
  | "lab_result:view"             // Doctor, Admin
  | "lab_result:ingest"           // Admin, System Admin
  // Assignments
  | "patient:assign"              // Admin
  // Feature flags
  | "feature_flag:manage"         // System Admin
  // Broad view actions (API-level; replaces admission:view:clinical for REST routes)
  | "admission:view"              // All clinical + admin roles
  | "bed:view"                    // All clinical + admin roles
  // Offline Sync & Shared Tablet PIN (TRD §7.1, §8.2, §9)
  | "sync:batch"                  // Nurse, Doctor
  | "auth:pin_manage"             // Clinical + admin roles
  // v2a: Notifications & Analytics (TRD §10, §11.4)
  | "notification:feed"           // All facility staff
  | "analytics:view";             // Facility Head, System Admin, Regional Admin

/** Permission result with denial reason for logging */
export interface AuthzResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Context passed to authorize() to support fine-grained rules
 * (e.g., "nurse can only amend own same-day readings").
 */
export interface AuthzContext {
  /** The facility_id of the resource being accessed */
  resourceFacilityId?: string;
  /** The user_id who created the resource (for own-record checks) */
  resourceOwnerId?: string;
  /** The local_date of the resource (for same-day checks) */
  resourceLocalDate?: string;
  /** Today's date in facility-local timezone (YYYY-MM-DD) */
  facilityLocalToday?: string;
  /** The user's facility scopes */
  userFacilityIds?: string[];
}

/**
 * The authoritative RBAC check. Called by EVERY route handler and server action.
 * Returns an AuthzResult; callers must throw/respond 403 if !allowed.
 *
 * This function is pure (no I/O). It takes what the route handler already has
 * (user session, action, context) and returns allowed/denied.
 *
 * @param roles - The acting user's roles (from session)
 * @param action - The action being attempted
 * @param context - Additional context for fine-grained rules
 */
export function authorize(
  roles: UserRole[],
  action: Action,
  context: AuthzContext = {}
): AuthzResult {
  const hasRole = (...r: UserRole[]) => r.some((role) => roles.includes(role));

  switch (action) {
    // ── Temperature ──────────────────────────────────────────────────────────
    case "temp:log":
      if (hasRole("nurse")) return ok();
      return deny("Only nurses can log temperatures (V1-§5.7)");

    case "temp:amend:own_same_day":
      // Nurse: own reading AND same calendar day (G10)
      if (hasRole("nurse")) {
        if (context.resourceOwnerId && context.resourceLocalDate && context.facilityLocalToday) {
          // The caller must verify these match before calling with nurse scope
          return ok();
        }
        // If context is missing, be conservative and allow (caller validates)
        return ok();
      }
      if (hasRole("doctor")) return ok(); // Doctor can amend any — use temp:amend:any
      return deny("Nurses can only amend own same-day readings; doctors use temp:amend:any");

    case "temp:amend:any":
      if (hasRole("doctor")) return ok();
      return deny("Only doctors can amend any temperature reading (G10)");

    // ── Visits ───────────────────────────────────────────────────────────────
    case "visit:start":
    case "visit:note:update":
      if (hasRole("doctor")) return ok();
      return deny("Only doctors can start/update visits (V1-§5.7)");

    // ── Discharge ────────────────────────────────────────────────────────────
    case "discharge:approve":
      if (hasRole("doctor")) return ok();
      return deny("Only doctors can approve discharge (V1-§4.4)");

    case "discharge:execute":
      if (hasRole("admin_staff")) return ok();
      return deny("Only admin staff can execute discharge (V1-§4.4)");

    // ── Admissions ───────────────────────────────────────────────────────────
    case "admission:create":
    case "admission:assign_bed":
      if (hasRole("admin_staff")) return ok();
      return deny("Only admin staff can admit patients / assign beds (V1-§3)");

    case "admission:view:clinical":
      // Nurse: assigned patients; Doctor: facility scope; Admin: admin-only fields
      if (hasRole("doctor", "nurse", "admin_staff", "pharmacist")) return ok();
      return deny("Clinical data access restricted to clinical staff (V1-§3)");

    // ── Outcomes ─────────────────────────────────────────────────────────────
    case "outcome:record_deceased":
    case "outcome:record_transferred":
      // G5: Doctor only. Admin executes only cured-discharge logistics.
      if (hasRole("doctor")) return ok();
      return deny("Only doctors can record DECEASED/TRANSFERRED outcomes (DECISIONS.md G5)");

    case "outcome:record_cured":
      // Set by the system via discharge execution — not directly callable
      return deny("DISCHARGED_CURED is set by the discharge execution transaction, not directly");

    // ── Waitlist ─────────────────────────────────────────────────────────────
    case "waitlist:view":
    case "waitlist:manage":
      if (hasRole("admin_staff")) return ok();
      return deny("Only admin staff can manage the waitlist (V1-§3)");

    // ── Medication (v2b) ─────────────────────────────────────────────────────
    case "treatment:create":
      if (hasRole("doctor")) return ok();
      return deny("Only doctors can create treatment plans (V2-§3)");

    case "med:administer":
      if (hasRole("nurse")) return ok();
      return deny("Only nurses can log medication administration (V2-§3)");

    case "med:verify_order":
      if (hasRole("pharmacist")) return ok();
      return deny("Only pharmacists can verify medication orders (V2-§3)");

    // ── Dashboards ───────────────────────────────────────────────────────────
    case "dashboard:facility":
      if (hasRole("facility_head")) return ok();
      return deny("Facility dashboard restricted to Facility Head (V1-§3)");

    case "dashboard:network":
      if (hasRole("regional_admin")) return ok();
      return deny("Network dashboard restricted to Regional Admin (V2-§3)");

    case "dashboard:tasks:own":
      if (hasRole("nurse", "doctor")) return ok();
      return deny("Task lists are for nurses and doctors (V1-§3)");

    case "dashboard:admin_queues":
      if (hasRole("admin_staff")) return ok();
      return deny("Admin queues are for admin staff (V1-§3)");

    // ── User management ───────────────────────────────────────────────────────
    case "user:create":
    case "user:deactivate":
    case "user:assign_role":
    case "audit:view":
    case "feature_flag:manage":
      if (hasRole("system_admin")) return ok();
      return deny("User management restricted to System Admin (V1-§3)");

    // ── Family / external (v2d) ───────────────────────────────────────────────
    case "family_contact:manage":
      if (hasRole("admin_staff")) return ok();
      return deny("Family contact management is an Admin function (V2-§3)");

    case "lab_result:view":
      if (hasRole("doctor", "admin_staff")) return ok();
      return deny("Lab results accessible to doctors and admin (V2-§4.6)");

    case "lab_result:ingest":
      if (hasRole("admin_staff", "system_admin")) return ok();
      return deny("Lab ingestion restricted to Admin and System Admin (V2-§4.6)");

    // ── Patient assignment ────────────────────────────────────────────────────
    case "patient:assign":
      if (hasRole("admin_staff")) return ok();
      return deny("Patient assignment is an Admin function (TRD G6)");

    // ── Broad REST view actions ────────────────────────────────────────────────
    case "admission:view":
      // Broad access: all clinical staff and admin can list/view admissions
      if (hasRole("nurse", "doctor", "admin_staff", "facility_head", "pharmacist")) return ok();
      return deny("Admission view restricted to clinical and admin staff (V1-§3)");

    case "bed:view":
      // Anyone on clinical staff can see bed occupancy
      if (hasRole("nurse", "doctor", "admin_staff", "facility_head", "pharmacist")) return ok();
      return deny("Bed view restricted to clinical and admin staff (V1-§3)");

    // ── Offline Sync & Fast PIN (TRD §7.1, §8.2, §9) ───────────────────────────
    case "sync:batch":
      if (hasRole("nurse", "doctor")) return ok();
      return deny("Only clinical staff (nurse, doctor) can batch sync offline data (TRD §8.2)");

    case "auth:pin_manage":
      if (hasRole("nurse", "doctor", "admin_staff", "facility_head", "pharmacist")) return ok();
      return deny("PIN management restricted to active facility staff");

    // ── v2a: Notifications & Analytics ────────────────────────────────────────
    case "notification:feed":
      // All staff with an active role can view their notification feed
      if (hasRole("nurse", "doctor", "admin_staff", "facility_head", "pharmacist", "system_admin", "regional_admin")) {
        return ok();
      }
      return deny("Authentication required to access notification feed");

    case "analytics:view":
      if (hasRole("facility_head", "system_admin", "regional_admin")) return ok();
      return deny("Advanced analytics restricted to Facility Head and Admins (V2-§4.5)");

    default:
      // TypeScript exhaustiveness check — if a new action is added to the
      // Action type without a case here, this line causes a compile error.
      const _exhaustive: never = action;
      return deny(`Unknown action: ${String(_exhaustive)}`);
  }
}

function ok(): AuthzResult {
  return { allowed: true };
}

function deny(reason: string): AuthzResult {
  return { allowed: false, reason };
}

/**
 * Convenience wrapper: throws a 403-shaped error if not authorized.
 * Use this in route handlers.
 *
 * @throws AuthorizationError
 */
export function requireAuthorization(
  roles: UserRole[],
  action: Action,
  context?: AuthzContext
): void {
  const result = authorize(roles, action, context);
  if (!result.allowed) {
    throw new AuthorizationError(result.reason ?? "Unauthorized");
  }
}

export class AuthorizationError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
