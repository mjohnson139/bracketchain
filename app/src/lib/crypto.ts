/**
 * Cryptographic primitives for BracketChain.
 *
 * Identity is an ECDSA P-256 keypair generated in-browser via WebCrypto. The
 * private key never leaves the device; only the public key (raw uncompressed
 * point, base64url) is registered to the ledger. Every action is signed over
 * the canonical JSON of its payload.
 *
 * This module deliberately uses only the global `crypto.subtle`, which is
 * available both in the browser and in Node 22, so the byte-level behaviour is
 * identical wherever a signature is produced or verified.
 */
import { canonicalize } from "./canonical.ts";
import {
  base64urlToBytes,
  bytesToBase64url,
  bytesToHex,
  concatBytes,
  utf8ToBytes,
} from "./encoding.ts";

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" } as const;

export interface KeyPairExport {
  /** Raw uncompressed public key point (65 bytes), base64url. */
  publicKey: string;
  /** PKCS#8 private key, base64url. This is the backup secret. */
  privateKey: string;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto is not available");
  return c.subtle;
}

/** SHA-256 of raw bytes, returned as lowercase hex. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await subtle().digest("SHA-256", data as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/** SHA-256 of raw bytes, returned as a Uint8Array. */
export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const digest = await subtle().digest("SHA-256", data as BufferSource);
  return new Uint8Array(digest);
}

/** Generate a fresh, extractable ECDSA P-256 keypair. */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ALG, true, ["sign", "verify"]);
}

/** Export a keypair to a portable, base64url-encoded backup. */
export async function exportKeyPair(pair: CryptoKeyPair): Promise<KeyPairExport> {
  const rawPub = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
  return {
    publicKey: bytesToBase64url(rawPub),
    privateKey: bytesToBase64url(pkcs8),
  };
}

/** Re-import a keypair from a backup produced by exportKeyPair. */
export async function importKeyPair(backup: KeyPairExport): Promise<CryptoKeyPair> {
  const publicKey = await importPublicKey(backup.publicKey);
  const privateKey = await subtle().importKey(
    "pkcs8",
    base64urlToBytes(backup.privateKey) as BufferSource,
    ALG,
    true,
    ["sign"],
  );
  return { publicKey, privateKey };
}

/** Import a public key from its base64url raw-point representation. */
export async function importPublicKey(publicKeyB64url: string): Promise<CryptoKey> {
  return subtle().importKey(
    "raw",
    base64urlToBytes(publicKeyB64url) as BufferSource,
    ALG,
    true,
    ["verify"],
  );
}

/** Export a public key to its base64url raw-point representation. */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await subtle().exportKey("raw", key));
  return bytesToBase64url(raw);
}

/** Sign arbitrary bytes; signature is base64url (raw r||s, 64 bytes). */
export async function signBytes(privateKey: CryptoKey, data: Uint8Array): Promise<string> {
  const sig = await subtle().sign(SIGN_ALG, privateKey, data as BufferSource);
  return bytesToBase64url(new Uint8Array(sig));
}

/** Verify a base64url signature over bytes. */
export async function verifyBytes(
  publicKey: CryptoKey,
  signatureB64url: string,
  data: Uint8Array,
): Promise<boolean> {
  return subtle().verify(
    SIGN_ALG,
    publicKey,
    base64urlToBytes(signatureB64url) as BufferSource,
    data as BufferSource,
  );
}

/**
 * Sign a JSON-serializable payload over its canonical form.
 * The returned signature verifies only against the identical canonical bytes.
 */
export async function signPayload(privateKey: CryptoKey, payload: unknown): Promise<string> {
  return signBytes(privateKey, utf8ToBytes(canonicalize(payload)));
}

/** Verify a signature over a payload's canonical form. */
export async function verifyPayload(
  publicKeyB64url: string,
  signatureB64url: string,
  payload: unknown,
): Promise<boolean> {
  const key = await importPublicKey(publicKeyB64url);
  return verifyBytes(key, signatureB64url, utf8ToBytes(canonicalize(payload)));
}

/**
 * Commitment hash for the commit–reveal scheme:
 *   SHA-256( canonical_pick_json || salt )
 * `salt` is a base64url-encoded random value. Returns lowercase hex.
 */
export async function computeCommitment(pick: unknown, saltB64url: string): Promise<string> {
  const data = concatBytes(utf8ToBytes(canonicalize(pick)), base64urlToBytes(saltB64url));
  return sha256Hex(data);
}

/** Generate a cryptographically random salt (32 bytes), base64url. */
export function randomSalt(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64url(bytes);
}
