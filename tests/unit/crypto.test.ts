import { describe, expect, it } from "vitest";
import {
  computeCommitment,
  exportKeyPair,
  generateKeyPair,
  importKeyPair,
  randomSalt,
  sha256Hex,
  signPayload,
  verifyPayload,
} from "../../app/src/lib/crypto.ts";
import { canonicalize } from "../../app/src/lib/canonical.ts";
import { utf8ToBytes } from "../../app/src/lib/encoding.ts";

describe("crypto", () => {
  it("round-trips sign/verify over a payload", async () => {
    const pair = await generateKeyPair();
    const { publicKey } = await exportKeyPair(pair);
    const payload = { action: "register", login: "alice", ts: 1700000000 };
    const sig = await signPayload(pair.privateKey, payload);
    expect(await verifyPayload(publicKey, sig, payload)).toBe(true);
  });

  it("rejects a signature over a tampered payload", async () => {
    const pair = await generateKeyPair();
    const { publicKey } = await exportKeyPair(pair);
    const payload = { action: "register", login: "alice" };
    const sig = await signPayload(pair.privateKey, payload);
    expect(await verifyPayload(publicKey, sig, { ...payload, login: "mallory" })).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const { publicKey: pubB } = await exportKeyPair(b);
    const payload = { x: 1 };
    const sig = await signPayload(a.privateKey, payload);
    expect(await verifyPayload(pubB, sig, payload)).toBe(false);
  });

  it("exports and re-imports a keypair losslessly", async () => {
    const pair = await generateKeyPair();
    const backup = await exportKeyPair(pair);
    const restored = await importKeyPair(backup);
    const payload = { hello: "world" };
    const sig = await signPayload(restored.privateKey, payload);
    expect(await verifyPayload(backup.publicKey, sig, payload)).toBe(true);
  });

  it("commitment matches an independent hash of canonical pick || salt", async () => {
    const pick = { round: "r16", picks: { m1: "BRA", m2: "ARG" } };
    const salt = randomSalt();
    const commitment = await computeCommitment(pick, salt);

    // Independent recomputation using only canonicalize + sha256 + raw concat.
    const { base64urlToBytes, concatBytes } = await import("../../app/src/lib/encoding.ts");
    const data = concatBytes(utf8ToBytes(canonicalize(pick)), base64urlToBytes(salt));
    expect(commitment).toBe(await sha256Hex(data));
  });

  it("commitment is independent of pick key order", async () => {
    const salt = randomSalt();
    const c1 = await computeCommitment({ a: 1, b: 2 }, salt);
    const c2 = await computeCommitment({ b: 2, a: 1 }, salt);
    expect(c1).toBe(c2);
  });

  it("known SHA-256 vector", async () => {
    expect(await sha256Hex(utf8ToBytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
