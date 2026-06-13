import { describe, expect, it } from "vitest";
import {
  computeCommitment,
  exportKeyPair,
  generateKeyPair,
  randomSalt,
  signPayload,
} from "../../app/src/lib/crypto.ts";
import {
  commitSignedView,
  registrationSignedView,
  revealSignedView,
  validatePickRecord,
  validateRegistration,
} from "../../app/src/lib/validation.ts";
import type { PickRecord, Registration, RoundConfig } from "../../app/src/lib/types.ts";

const round: RoundConfig = {
  id: "r16",
  name: "Round of 16",
  deadline: "2026-06-05T16:00:00Z",
  matchIds: ["m1", "m2"],
};

async function makePlayer(login: string) {
  const pair = await generateKeyPair();
  const exported = await exportKeyPair(pair);
  return { pair, publicKey: exported.publicKey, login };
}

async function makeRegistration(p: Awaited<ReturnType<typeof makePlayer>>): Promise<Registration> {
  const reg: Registration = {
    type: "registration",
    login: p.login,
    publicKey: p.publicKey,
    createdAt: "2026-06-01T00:00:00Z",
    signature: "",
  };
  reg.signature = await signPayload(p.pair.privateKey, registrationSignedView(reg));
  return reg;
}

async function makePick(
  p: Awaited<ReturnType<typeof makePlayer>>,
  opts: { commitTime?: string; revealTime?: string; tamperPick?: boolean } = {},
): Promise<PickRecord> {
  const pick = { round: "r16", picks: { m1: "BRA", m2: "ARG" } };
  const salt = randomSalt();
  const commitment = await computeCommitment(pick, salt);
  const rec: PickRecord = {
    type: "pick",
    round: "r16",
    login: p.login,
    publicKey: p.publicKey,
    commitment,
    commitTime: opts.commitTime ?? "2026-06-05T10:00:00Z",
    commitSignature: "",
  };
  rec.commitSignature = await signPayload(p.pair.privateKey, commitSignedView(rec));
  const revealedPick = opts.tamperPick ? { round: "r16", picks: { m1: "ARG", m2: "BRA" } } : pick;
  rec.reveal = {
    pick: revealedPick,
    salt,
    revealTime: opts.revealTime ?? "2026-06-06T10:00:00Z",
    signature: "",
  };
  rec.reveal.signature = await signPayload(p.pair.privateKey, revealSignedView(rec));
  return rec;
}

describe("registration validation", () => {
  it("accepts a correctly signed registration", async () => {
    const p = await makePlayer("alice");
    expect(await validateRegistration(await makeRegistration(p))).toEqual([]);
  });

  it("rejects an unsigned registration", async () => {
    const p = await makePlayer("alice");
    const reg = await makeRegistration(p);
    reg.signature = "";
    expect(await validateRegistration(reg)).toContain("missing signature");
  });

  it("rejects a tampered registration", async () => {
    const p = await makePlayer("alice");
    const reg = await makeRegistration(p);
    reg.login = "mallory";
    expect((await validateRegistration(reg)).join()).toMatch(/does not verify/);
  });
});

describe("pick validation", () => {
  it("accepts a valid commit+reveal", async () => {
    const p = await makePlayer("alice");
    expect(await validatePickRecord(await makePick(p), round, p.publicKey)).toEqual([]);
  });

  it("rejects a late commitment (after the deadline)", async () => {
    const p = await makePlayer("alice");
    const rec = await makePick(p, { commitTime: "2026-06-05T16:00:01Z" });
    expect((await validatePickRecord(rec, round, p.publicKey)).join()).toMatch(/late commitment/);
  });

  it("rejects a reveal that does not match the commitment", async () => {
    const p = await makePlayer("alice");
    const rec = await makePick(p, { tamperPick: true });
    // Tampering the revealed pick also breaks the reveal signature view, so we
    // re-sign over the tampered view to isolate the hash-mismatch rule.
    rec.reveal!.signature = await signPayload(p.pair.privateKey, revealSignedView(rec));
    expect((await validatePickRecord(rec, round, p.publicKey)).join()).toMatch(
      /does not match commitment/,
    );
  });

  it("rejects a reveal before the deadline (would leak picks early)", async () => {
    const p = await makePlayer("alice");
    const rec = await makePick(p, { revealTime: "2026-06-05T12:00:00Z" });
    expect((await validatePickRecord(rec, round, p.publicKey)).join()).toMatch(
      /reveal before deadline/,
    );
  });

  it("rejects a pick from an unregistered login", async () => {
    const p = await makePlayer("alice");
    expect((await validatePickRecord(await makePick(p), round, undefined)).join()).toMatch(
      /unregistered/,
    );
  });

  it("rejects a pick whose key differs from the registration", async () => {
    const p = await makePlayer("alice");
    const other = await makePlayer("alice");
    expect((await validatePickRecord(await makePick(p), round, other.publicKey)).join()).toMatch(
      /does not match registration/,
    );
  });
});
