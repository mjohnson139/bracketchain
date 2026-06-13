/**
 * Local player identity. The private key is generated in-browser and persisted
 * in IndexedDB; it never leaves the device. The exported backup string (the
 * "backup phrase") is the only way to recover an identity on another device, so
 * the UI urges the player to save it.
 *
 * We also persist, per round, the (pick, salt, commitment) the player committed
 * to — because the salt is required later to reveal, and only the player has it.
 */
import {
  exportKeyPair,
  generateKeyPair,
  importKeyPair,
  type KeyPairExport,
} from "./lib/crypto.ts";
import type { Pick } from "./lib/types.ts";

export interface LocalCommitment {
  pick: Pick;
  salt: string;
  commitment: string;
}

export interface StoredIdentity {
  login: string;
  keys: KeyPairExport;
  /** round id -> what was committed locally, so the player can reveal later. */
  commitments: Record<string, LocalCommitment>;
}

export interface Identity {
  login: string;
  publicKey: string;
  keyPair: CryptoKeyPair;
  backup: string;
  commitments: Record<string, LocalCommitment>;
}

const DB_NAME = "bracketchain";
const STORE = "identity";
const KEY = "self";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<StoredIdentity | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as StoredIdentity) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function write(value: StoredIdentity): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Backup phrase format: "login.base64urlPublicKey.base64urlPrivateKey". */
function encodeBackup(login: string, keys: KeyPairExport): string {
  return `${login}.${keys.publicKey}.${keys.privateKey}`;
}

function decodeBackup(phrase: string): StoredIdentity {
  const parts = phrase.trim().split(".");
  if (parts.length !== 3) throw new Error("Backup phrase must have three dot-separated parts");
  const [login, publicKey, privateKey] = parts;
  return { login, keys: { publicKey, privateKey }, commitments: {} };
}

async function hydrate(stored: StoredIdentity): Promise<Identity> {
  const keyPair = await importKeyPair(stored.keys);
  return {
    login: stored.login,
    publicKey: stored.keys.publicKey,
    keyPair,
    backup: encodeBackup(stored.login, stored.keys),
    commitments: stored.commitments ?? {},
  };
}

export async function loadIdentity(): Promise<Identity | null> {
  const stored = await read();
  return stored ? hydrate(stored) : null;
}

export async function createIdentity(login: string): Promise<Identity> {
  const pair = await generateKeyPair();
  const keys = await exportKeyPair(pair);
  const stored: StoredIdentity = { login, keys, commitments: {} };
  await write(stored);
  return hydrate(stored);
}

export async function importIdentity(phrase: string): Promise<Identity> {
  const stored = decodeBackup(phrase);
  // Round-trip through the crypto layer to reject malformed keys early.
  await importKeyPair(stored.keys);
  await write(stored);
  return hydrate(stored);
}

export async function saveCommitment(round: string, commitment: LocalCommitment): Promise<void> {
  const stored = await read();
  if (!stored) throw new Error("No identity to attach a commitment to");
  stored.commitments = { ...stored.commitments, [round]: commitment };
  await write(stored);
}

export async function clearIdentity(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
