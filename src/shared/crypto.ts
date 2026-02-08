import type { EncryptedSecret } from "./types";

/**
 * Encrypts a secret string using PBKDF2(SHA-256) + AES-GCM.
 * @param secret The plaintext secret.
 * @param passphrase User passphrase.
 */
export async function encryptSecret(secret: string, passphrase: string): Promise<EncryptedSecret> {
  const enc = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(passphrase, toArrayBuffer(salt));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    enc.encode(secret)
  );

  return {
    alg: "PBKDF2-SHA256/AES-GCM",
    payloadB64: bytesToB64(new Uint8Array(ciphertext)),
    ivB64: bytesToB64(iv),
    saltB64: bytesToB64(salt)
  };
}

/**
 * Decrypts an EncryptedSecret back into plaintext.
 * @param blob Encrypted blob.
 * @param passphrase User passphrase.
 */
export async function decryptSecret(blob: EncryptedSecret, passphrase: string): Promise<string> {
  const dec = new TextDecoder();

  const salt = b64ToBytes(blob.saltB64);
  const iv = b64ToBytes(blob.ivB64);
  const payload = b64ToBytes(blob.payloadB64);

  const key = await deriveKey(passphrase, toArrayBuffer(salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(payload)
  );

  return dec.decode(plaintext);
}

/**
 * @param passphrase User passphrase.
 * @param salt Salt bytes.
 */
async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 150_000 },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** @param bytes Bytes */
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** @param b64 Base64 */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** @param bytes Bytes */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
