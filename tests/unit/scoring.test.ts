import { describe, expect, it } from "vitest";
import { computeScores, POINTS_PER_CORRECT } from "../../app/src/lib/scoring.ts";
import type { ResultRecord, Tournament } from "../../app/src/lib/types.ts";

const tournament: Tournament = {
  name: "T",
  rounds: [
    { id: "r1", name: "R1", deadline: "2026-01-01T00:00:00Z", matchIds: ["a", "b", "c"] },
    { id: "r2", name: "R2", deadline: "2026-01-02T00:00:00Z", matchIds: ["d", "e"] },
  ],
};

const results: ResultRecord[] = [
  { type: "result", round: "r1", matches: { a: "X", b: "Y", c: "Z" }, recordedAt: "" },
  { type: "result", round: "r2", matches: { d: "P", e: "Q" }, recordedAt: "" },
];

describe("scoring", () => {
  it("awards points only for correct picks and is order-independent", () => {
    const { standings } = computeScores(tournament, results, [
      { login: "alice", round: "r1", pick: { round: "r1", picks: { a: "X", b: "Y", c: "WRONG" } } },
      { login: "alice", round: "r2", pick: { round: "r2", picks: { d: "P", e: "Q" } } },
      { login: "bob", round: "r1", pick: { round: "r1", picks: { a: "X", b: "WRONG", c: "Z" } } },
    ]);
    const alice = standings.find((s) => s.login === "alice")!;
    const bob = standings.find((s) => s.login === "bob")!;
    expect(alice.points).toBe(4 * POINTS_PER_CORRECT);
    expect(alice.correct).toBe(4);
    expect(alice.total).toBe(5);
    expect(bob.points).toBe(2 * POINTS_PER_CORRECT);
    // Standings sorted by points desc.
    expect(standings[0].login).toBe("alice");
  });

  it("computes best streak across rounds in tournament/match order", () => {
    const { standings } = computeScores(tournament, results, [
      // a,b correct (streak 2), c wrong (reset), then d,e correct (streak 2).
      { login: "alice", round: "r1", pick: { round: "r1", picks: { a: "X", b: "Y", c: "WRONG" } } },
      { login: "alice", round: "r2", pick: { round: "r2", picks: { d: "P", e: "Q" } } },
    ]);
    expect(standings[0].bestStreak).toBe(2);
  });

  it("produces identical output across repeated runs (determinism)", () => {
    const reveals = [
      { login: "bob", round: "r1", pick: { round: "r1", picks: { a: "X" } } },
      { login: "alice", round: "r1", pick: { round: "r1", picks: { a: "X", b: "Y" } } },
    ];
    const first = computeScores(tournament, results, reveals);
    const second = computeScores(tournament, results, reveals);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
