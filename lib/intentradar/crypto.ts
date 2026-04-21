// lib/intentradar/crypto.ts
// AES-256-GCM symmetric encryption for IntentRadar settings at rest.
// Secrets are encrypted before writing to ir_settings and decrypted only
// server-side when needed for execution. The key is never exposed to clients.
//
// Key format (INTENTRADAR_ENCRYPTION_KEY env var):
//   - 64-char hex string (preferred)  e.g. openssl rand -hex 32
//   - 44-char base64 string
//   - Any string (derived via scrypt — less secure, avoid in production)
//
// Ciphertext wire format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
// The three-part colon-delimited format is the detection heuristic used by
// isEncrypted() to distinguish new encrypted values from legacy plaintext.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const KEY_BYTES = 32;

// Three-segment hex pattern: 32hex:32hex:Nhex
const ENCRYPTED_RE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;

function getKey(): Buffer {
  const raw = process.env.INTENTRADAR_ENCRYPTION_KEY;
  if (!raw || raw.trim() === '') {
    throw new Error(
      '[IntentRadar crypto] INTENTRADAR_ENCRYPTION_KEY is not set. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  // Hex key — 64 chars, 32 bytes
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Base64 key — 44 chars, 32 bytes
  if (raw.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(raw)) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === KEY_BYTES) return buf;
  }
  // Fallback: derive 32-byte key from arbitrary string using scrypt.
  // Suitable for development but use a proper 32-byte random key in production.
  return scryptSync(raw, 'intentradar-v1-salt', KEY_BYTES) as Buffer;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes for GCM

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(value: string): string {
  // Graceful legacy path: if value is not in our encrypted format, return as-is.
  // This handles plaintext records written before encryption was added.
  if (!isEncrypted(value)) return value;

  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = value.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
  } catch {
    // Auth tag mismatch — wrong key or tampered ciphertext.
    throw new Error('[IntentRadar crypto] Decryption failed: auth tag mismatch. Check INTENTRADAR_ENCRYPTION_KEY.');
  }
}

// Returns true if the value looks like an AES-GCM ciphertext produced by encrypt().
// Used to decide whether to decrypt or treat as legacy plaintext.
export function isEncrypted(value: string): boolean {
  return ENCRYPTED_RE.test(value);
}
