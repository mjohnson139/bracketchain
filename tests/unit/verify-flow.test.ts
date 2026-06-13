/**
 * End-to-end trust-model check, headless: ledger → built state → in-browser-style
 * read via sql.js → Merkle inclusion proof verified against the published root.
 * This mirrors exactly what the Verify page does, minus the DOM.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { buildState } from "../../scripts/build-state.ts";
import { buildProof, leafHash, verifyProof } from "../../app/src/lib/merkle.ts";
import type { PublishedRoots } from "../../app/src/lib/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let dir: string;
let db: Database;
let roots: PublishedRoots;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bc-verify-"));
  await buildState(join(ROOT, "ledger"), dir);
  const SQL = await initSqlJs({
    locateFile: () => join(ROOT, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  });
  db = new SQL.Database(readFileSync(join(dir, "game.sqlite")));
  roots = JSON.parse(readFileSync(join(dir, "roots.json"), "utf8"));
});

afterAll(() => {
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});

function pubkeyOf(login: string): string {
  const r = db.exec("SELECT public_key FROM players WHERE login = ?", [login]);
  return r[0].values[0][0] as string;
}

function commitmentOf(round: string, login: string): string {
  const r = db.exec("SELECT commitment FROM picks WHERE round = ? AND login = ?", [round, login]);
  return r[0].values[0][0] as string;
}

describe("verify flow (sql.js + merkle, as the Verify page does)", () => {
  it("both demo players are registered and have committed in both rounds", () => {
    const players = db.exec("SELECT login FROM players ORDER BY login")[0].values.flat();
    expect(players).toEqual(["alice", "bob"]);
    for (const round of ["r16", "qf"]) {
      const n = db.exec("SELECT COUNT(*) FROM picks WHERE round = ?", [round])[0].values[0][0];
      expect(n).toBe(2);
    }
  });

  it("a real player's inclusion proof verifies against the published root", async () => {
    for (const round of ["r16", "qf"]) {
      for (const login of ["alice", "bob"]) {
        const leaf = await leafHash(pubkeyOf(login), commitmentOf(round, login));
        const proof = await buildProof(roots.rounds[round].leaves, leaf);
        expect(await verifyProof(proof)).toBe(true);
        expect(proof.root).toBe(roots.rounds[round].root);
      }
    }
  });

  it("a forged commitment does NOT verify against the published root", async () => {
    const leaf = await leafHash(pubkeyOf("alice"), "f".repeat(64));
    // The forged leaf is not in the set, so a proof cannot even be built.
    await expect(buildProof(roots.rounds.r16.leaves, leaf)).rejects.toThrow();
  });

  it("standings reflect the revealed picks (alice ahead of bob)", () => {
    const rows = db.exec("SELECT login, points FROM standings ORDER BY points DESC")[0].values;
    expect(rows[0][0]).toBe("alice");
    expect(rows[0][1] as number).toBeGreaterThan(rows[1][1] as number);
  });
});
