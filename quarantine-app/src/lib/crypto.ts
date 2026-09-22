/**
 * Field-level encryption for PII (Personally Identifiable Information).
 * TRD §5.1, §7.4
 *
 * Encrypts sensitive fields (patient name, DOB, phone, email, address)
 * using AES-256-GCM with a versioned key from FIELD_ENCRYPTION_KEY env var.
 *
 * Format: "v1:<base64(iv + authTag + ciphertext)>"
 * The "v1:" prefix enables key rotation: new keys use "v2:", old
 * ciphertexts can still be decrypted with the old key until migrated.
 *
 * HMAC blind index: for fields where equality lookup is needed (e.g., patient
 * identity matching), we store a keyed HMAC-SHA256 hash alongside the encrypted
 * value. The hash enables WHERE identity_hash = $1 queries without decrypting.
 * Key: IDENTITY_HASH_PEPPER env var.
 *
 * IMPORTANT: No PHI in URLs, push payloads, email subjects, logs, or Sentry
 * events. Only encrypted at-rest values in the DB. (TRD §7.4)
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Parse and validate the FIELD_ENCRYPTION_KEY environment variable.
 * Format: "v1:<base64-encoded-32-byte-key>"
 */
function getEncryptionKey(): { version: string; key: Buffer } {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY environment variable is not set");

  const [version, b64] = raw.split(":");
  if (!version || !b64) throw new Error("FIELD_ENCRYPTION_KEY must be in format 'v1:<base64>'");

  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)");
  }

  return { version, key };
}

/**
 * Encrypt a plaintext string.
 * Returns "v<version>:<base64(iv + authTag + ciphertext)>"
 */
export function encryptField(plaintext: string): string {
  const { version, key } = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, ciphertext]);
  return `${version}:${packed.toString("base64")}`;
}

/**
 * Decrypt an encrypted field value.
 * Supports multiple key versions for rotation.
 */
export function decryptField(encrypted: string): string {
  const colonIdx = encrypted.indexOf(":");
  if (colonIdx === -1) throw new Error("Invalid encrypted field format (missing version prefix)");

  // For now we only have v1. In future, look up the key by version.
  const b64 = encrypted.slice(colonIdx + 1);
  const { key } = getEncryptionKey();

  const packed = Buffer.from(b64, "base64");
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted field: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Compute a HMAC-SHA256 "blind index" for equality search.
 * Used for patient identity matching (identity_hash column).
 *
 * @param identifier - The raw identifier (e.g., national ID, normalized)
 * @returns Hex-encoded HMAC-SHA256 with IDENTITY_HASH_PEPPER key
 */
export function computeIdentityHash(identifier: string): string {
  const pepper = process.env.IDENTITY_HASH_PEPPER;
  if (!pepper) throw new Error("IDENTITY_HASH_PEPPER environment variable is not set");
  return createHmac("sha256", pepper).update(identifier, "utf8").digest("hex");
}

/**
 * Normalize an identifier for consistent hashing.
 * Strips whitespace, lowercases, removes common separators.
 * This ensures "ABC-123" and "abc123" produce the same hash.
 */
export function normalizeIdentifier(raw: string): string {
  return raw.toLowerCase().replace(/[\s\-_.]/g, "").trim();
}
