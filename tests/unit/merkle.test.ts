import { describe, expect, it } from "vitest";
import {
  buildProof,
  computeRoot,
  emptyRoot,
  leafHash,
  sortLeaves,
  verifyProof,
} from "../../app/src/lib/merkle.ts";

async function makeLeaves(n: number): Promise<string[]> {
  const leaves: string[] = [];
  for (let i = 0; i < n; i++) {
    leaves.push(await leafHash(`pubkey-${i}`, `commitment-${i}`));
  }
  return leaves;
}

describe("merkle", () => {
  it("single-leaf root equals the leaf", async () => {
    const leaves = await makeLeaves(1);
    expect(await computeRoot(leaves)).toBe(leaves[0]);
  });

  it("empty set has the sentinel root", async () => {
    expect(await computeRoot([])).toBe(await emptyRoot());
  });

  it("root is independent of input order (canonical sort)", async () => {
    const leaves = await makeLeaves(5);
    const shuffled = [...leaves].reverse();
    expect(await computeRoot(leaves)).toBe(await computeRoot(shuffled));
  });

  for (const n of [1, 2, 3, 5, 64]) {
    it(`inclusion proof verifies for every leaf in a tree of ${n}`, async () => {
      const leaves = await makeLeaves(n);
      const root = await computeRoot(leaves);
      for (const target of leaves) {
        const proof = await buildProof(leaves, target);
        expect(proof.root).toBe(root);
        expect(await verifyProof(proof)).toBe(true);
      }
    });
  }

  it("a tampered leaf fails verification", async () => {
    const leaves = await makeLeaves(8);
    const proof = await buildProof(leaves, leaves[3]);
    const tampered = { ...proof, leaf: leaves[4] };
    expect(await verifyProof(tampered)).toBe(false);
  });

  it("a tampered sibling fails verification", async () => {
    const leaves = await makeLeaves(8);
    const proof = await buildProof(leaves, leaves[3]);
    const badSteps = proof.steps.map((s, i) =>
      i === 0 ? { ...s, sibling: "00".repeat(32) } : s,
    );
    expect(await verifyProof({ ...proof, steps: badSteps })).toBe(false);
  });

  it("buildProof throws for a leaf not in the set", async () => {
    const leaves = await makeLeaves(4);
    await expect(buildProof(leaves, "deadbeef")).rejects.toThrow();
  });

  it("sortLeaves does not mutate input", async () => {
    const leaves = await makeLeaves(3);
    const copy = [...leaves];
    sortLeaves(leaves);
    expect(leaves).toEqual(copy);
  });
});
