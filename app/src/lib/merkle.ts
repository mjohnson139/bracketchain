/**
 * Binary Merkle tree over player commitments.
 *
 * After each round deadline an Action builds a tree whose leaves are
 *   leafHash = SHA-256( utf8(pubkey) || utf8(commitment) )
 * for every player, sorted canonically (ascending by leaf hash). The root is
 * published in state/roots.json and as a git tag. Any player can later fetch
 * their inclusion proof and verify it client-side against a root they trust.
 *
 * Conventions (must match between builder and verifier):
 *  - Leaves are sorted ascending by their hex leaf hash before the tree is
 *    built. Sorting makes the tree a pure function of the set, independent of
 *    insertion order.
 *  - Internal node = SHA-256( leftBytes || rightBytes ), operating on the raw
 *    32-byte hashes (hex-decoded), not on hex strings.
 *  - Odd level: the last node is duplicated (hashed with itself).
 *  - Empty set: root is SHA-256 of the empty input (a fixed sentinel).
 */
import { sha256Bytes, sha256Hex } from "./crypto.ts";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "./encoding.ts";

export interface ProofStep {
  /** Sibling hash (hex). */
  sibling: string;
  /** Which side the sibling is on relative to the running hash. */
  position: "left" | "right";
}

export interface InclusionProof {
  leaf: string;
  steps: ProofStep[];
  root: string;
}

/** Compute the canonical leaf hash for a (pubkey, commitment) pair. */
export async function leafHash(pubkey: string, commitment: string): Promise<string> {
  const data = concatBytes(utf8ToBytes(pubkey), utf8ToBytes(commitment));
  return sha256Hex(data);
}

async function hashPair(leftHex: string, rightHex: string): Promise<string> {
  const combined = concatBytes(hexToBytes(leftHex), hexToBytes(rightHex));
  return bytesToHex(await sha256Bytes(combined));
}

/** Hash of the empty set — a fixed sentinel so an empty round has a defined root. */
export async function emptyRoot(): Promise<string> {
  return sha256Hex(new Uint8Array(0));
}

/** Sort leaves into canonical order (ascending by hex). */
export function sortLeaves(leaves: string[]): string[] {
  return [...leaves].sort();
}

/** Build the Merkle root from a list of leaf hashes. */
export async function computeRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return emptyRoot();
  let level = sortLeaves(leaves);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(await hashPair(left, right));
    }
    level = next;
  }
  return level[0];
}

/**
 * Build a full inclusion proof for `target` within `leaves`.
 * Throws if the target is not present.
 */
export async function buildProof(leaves: string[], target: string): Promise<InclusionProof> {
  const sorted = sortLeaves(leaves);
  let index = sorted.indexOf(target);
  if (index === -1) throw new Error("buildProof: target leaf not in set");

  const steps: ProofStep[] = [];
  let level = sorted;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      if (i === index || i + 1 === index) {
        if (i === index) {
          steps.push({ sibling: right, position: "right" });
        } else {
          steps.push({ sibling: left, position: "left" });
        }
      }
      next.push(await hashPair(left, right));
    }
    index = Math.floor(index / 2);
    level = next;
  }

  return { leaf: target, steps, root: level[0] };
}

/** Verify an inclusion proof recomputes the claimed root. */
export async function verifyProof(proof: InclusionProof): Promise<boolean> {
  let running = proof.leaf;
  for (const step of proof.steps) {
    running =
      step.position === "right"
        ? await hashPair(running, step.sibling)
        : await hashPair(step.sibling, running);
  }
  return running === proof.root;
}
