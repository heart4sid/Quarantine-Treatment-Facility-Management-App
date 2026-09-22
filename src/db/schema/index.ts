/**
 * Schema index — exports all tables, enums, and relations.
 * This is the entry point for Drizzle ORM and drizzle-kit.
 */

// Identity & Tenancy
export * from "./identity";

// Clinical Core (append-only)
export * from "./clinical";

// v2 Extensions (notifications, med orders, family view, labs)
export * from "./v2";
