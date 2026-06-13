/**
 * Ledger validation — the rules that make the game trustless.
 *
 * These are pure async functions over already-parsed records so they can be
 * exercised directly in unit tests and reused by both build-state.ts and
 * verify-ledger.ts. Each returns a list of human-readable problems; an empty
 * list means valid.
 */
import { computeCommitment, verifyPayload } from "./crypto.ts";
import type {
  PickRecord,
  Registration,
  ResultRecord,
  RoundConfig,
  Tournament,
} from "./types.ts";

/** Strip signature fields to recover the exact bytes that were signed. */
export function registrationSignedView(r: Registration) {
  return { type: r.type, login: r.login, publicKey: r.publicKey, createdAt: r.createdAt };
}

export function commitSignedView(r: PickRecord) {
  return {
    type: r.type,
    round: r.round,
    login: r.login,
    publicKey: r.publicKey,
    commitment: r.commitment,
    commitTime: r.commitTime,
  };
}

export function revealSignedView(r: PickRecord) {
  if (!r.reveal) throw new Error("revealSignedView: no reveal present");
  return {
    type: "reveal",
    round: r.round,
    login: r.login,
    pick: r.reveal.pick,
    salt: r.reveal.salt,
    revealTime: r.reveal.revealTime,
  };
}

export async function validateRegistration(r: Registration): Promise<string[]> {
  const problems: string[] = [];
  if (r.type !== "registration") problems.push(`bad type ${r.type}`);
  if (!r.login) problems.push("missing login");
  if (!r.publicKey) problems.push("missing publicKey");
  if (!r.signature) {
    problems.push("missing signature");
  } else if (!(await verifyPayload(r.publicKey, r.signature, registrationSignedView(r)))) {
    problems.push("registration signature does not verify");
  }
  return problems;
}

/**
 * Validate a pick record against its round config and the registered public key.
 * `registeredKey` is the public key on file for the login (to prevent a player
 * swapping keys mid-game); pass undefined if the player is unregistered.
 */
export async function validatePickRecord(
  r: PickRecord,
  round: RoundConfig,
  registeredKey: string | undefined,
): Promise<string[]> {
  const problems: string[] = [];
  if (r.type !== "pick") problems.push(`bad type ${r.type}`);
  if (r.round !== round.id) problems.push(`round mismatch ${r.round} != ${round.id}`);
  if (registeredKey === undefined) {
    problems.push(`pick from unregistered login ${r.login}`);
  } else if (registeredKey !== r.publicKey) {
    problems.push(`pick publicKey does not match registration for ${r.login}`);
  }

  // Commitment must be submitted at or before the deadline.
  if (new Date(r.commitTime).getTime() > new Date(round.deadline).getTime()) {
    problems.push(`late commitment for ${r.login} in ${r.round}`);
  }

  if (!r.commitSignature) {
    problems.push("missing commitSignature");
  } else if (!(await verifyPayload(r.publicKey, r.commitSignature, commitSignedView(r)))) {
    problems.push("commit signature does not verify");
  }

  if (r.reveal) {
    const reveal = r.reveal;
    // Reveal must not happen before the deadline (else picks leak early).
    if (new Date(reveal.revealTime).getTime() < new Date(round.deadline).getTime()) {
      problems.push(`reveal before deadline for ${r.login} in ${r.round}`);
    }
    if (reveal.pick.round !== r.round) {
      problems.push(`revealed pick round mismatch for ${r.login}`);
    }
    // The hash of the revealed pick+salt must equal the prior commitment.
    const recomputed = await computeCommitment(reveal.pick, reveal.salt);
    if (recomputed !== r.commitment) {
      problems.push(`reveal does not match commitment for ${r.login} in ${r.round}`);
    }
    if (!reveal.signature) {
      problems.push("missing reveal signature");
    } else if (
      !(await verifyPayload(r.publicKey, reveal.signature, revealSignedView(r)))
    ) {
      problems.push("reveal signature does not verify");
    }
    // Revealed picks may only name matches that belong to the round.
    for (const matchId of Object.keys(reveal.pick.picks)) {
      if (!round.matchIds.includes(matchId)) {
        problems.push(`revealed pick names unknown match ${matchId} in ${r.round}`);
      }
    }
  }

  return problems;
}

export function validateResult(r: ResultRecord, round: RoundConfig): string[] {
  const problems: string[] = [];
  if (r.type !== "result") problems.push(`bad type ${r.type}`);
  if (r.round !== round.id) problems.push(`result round mismatch ${r.round}`);
  for (const matchId of Object.keys(r.matches)) {
    if (!round.matchIds.includes(matchId)) {
      problems.push(`result names unknown match ${matchId} in ${r.round}`);
    }
  }
  return problems;
}

export function getRound(tournament: Tournament, roundId: string): RoundConfig | undefined {
  return tournament.rounds.find((rd) => rd.id === roundId);
}
