/**
 * Generate a demo ledger with two players who complete a full commit→reveal
 * flow over two rounds, plus recorded results. Signatures are real ECDSA
 * P-256, so the output passes verify-ledger.ts.
 *
 * This runs ONCE to seed ledger/. It uses fresh keypairs and random salts, so
 * it is not itself deterministic — but its output (committed to the repo) is
 * fixed, and build-state.ts is deterministic over that fixed input.
 *
 * The demo players' private keys are written to tests/fixtures/demo-keys.json
 * so end-to-end and integration tests can act as them. These are throwaway demo
 * identities, not secrets.
 *
 * Usage: tsx scripts/make-fixture.ts [ledgerDir] [keysOut]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeCommitment,
  exportKeyPair,
  generateKeyPair,
  randomSalt,
  signPayload,
} from "../app/src/lib/crypto.ts";
import {
  commitSignedView,
  registrationSignedView,
  revealSignedView,
} from "../app/src/lib/validation.ts";
import type {
  PickRecord,
  Registration,
  ResultRecord,
  Tournament,
} from "../app/src/lib/types.ts";

const tournament: Tournament = {
  name: "BracketChain Demo Cup 2026",
  rounds: [
    {
      id: "r16",
      name: "Round of 16",
      deadline: "2026-06-05T16:00:00Z",
      matchIds: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"],
    },
    {
      id: "qf",
      name: "Quarter-finals",
      deadline: "2026-06-10T16:00:00Z",
      matchIds: ["q1", "q2", "q3", "q4"],
    },
  ],
};

const results: Record<string, Record<string, string>> = {
  r16: { m1: "BRA", m2: "ARG", m3: "FRA", m4: "ENG", m5: "ESP", m6: "GER", m7: "NED", m8: "POR" },
  qf: { q1: "BRA", q2: "FRA", q3: "ESP", q4: "NED" },
};

// Each player's predicted winners per round (some right, some wrong).
const playerPicks: Record<string, Record<string, Record<string, string>>> = {
  alice: {
    r16: { m1: "BRA", m2: "ARG", m3: "FRA", m4: "ENG", m5: "ESP", m6: "GER", m7: "NED", m8: "URU" },
    qf: { q1: "BRA", q2: "FRA", q3: "ESP", q4: "NED" },
  },
  bob: {
    r16: { m1: "MEX", m2: "ARG", m3: "CRO", m4: "ENG", m5: "ESP", m6: "GER", m7: "USA", m8: "POR" },
    qf: { q1: "BRA", q2: "GER", q3: "ESP", q4: "BEL" },
  },
};

const commitTimes: Record<string, string> = {
  r16: "2026-06-05T10:00:00Z",
  qf: "2026-06-10T09:00:00Z",
};
const revealTimes: Record<string, string> = {
  r16: "2026-06-06T10:00:00Z",
  qf: "2026-06-11T09:00:00Z",
};

async function main() {
  const ledgerDir = process.argv[2] ?? "ledger";
  const keysOut = process.argv[3] ?? "tests/fixtures/demo-keys.json";

  // Reset ledger content directories (keep tournament rewritten below).
  for (const sub of ["players", "picks", "results"]) {
    rmSync(join(ledgerDir, sub), { recursive: true, force: true });
    mkdirSync(join(ledgerDir, sub), { recursive: true });
  }
  writeFileSync(
    join(ledgerDir, "tournament.json"),
    JSON.stringify(tournament, null, 2) + "\n",
  );

  const demoKeys: Record<string, { publicKey: string; privateKey: string }> = {};

  for (const login of Object.keys(playerPicks).sort()) {
    const pair = await generateKeyPair();
    const exported = await exportKeyPair(pair);
    demoKeys[login] = exported;

    const reg: Registration = {
      type: "registration",
      login,
      publicKey: exported.publicKey,
      createdAt: "2026-06-01T12:00:00Z",
      signature: "",
    };
    reg.signature = await signPayload(pair.privateKey, registrationSignedView(reg));
    writeFileSync(
      join(ledgerDir, "players", `${login}.json`),
      JSON.stringify(reg, null, 2) + "\n",
    );

    for (const round of tournament.rounds) {
      const pick = { round: round.id, picks: playerPicks[login][round.id] };
      const salt = randomSalt();
      const commitment = await computeCommitment(pick, salt);

      const record: PickRecord = {
        type: "pick",
        round: round.id,
        login,
        publicKey: exported.publicKey,
        commitment,
        commitTime: commitTimes[round.id],
        commitSignature: "",
      };
      record.commitSignature = await signPayload(pair.privateKey, commitSignedView(record));

      record.reveal = {
        pick,
        salt,
        revealTime: revealTimes[round.id],
        signature: "",
      };
      record.reveal.signature = await signPayload(pair.privateKey, revealSignedView(record));

      mkdirSync(join(ledgerDir, "picks", round.id), { recursive: true });
      writeFileSync(
        join(ledgerDir, "picks", round.id, `${login}.json`),
        JSON.stringify(record, null, 2) + "\n",
      );
    }
  }

  for (const round of tournament.rounds) {
    const result: ResultRecord = {
      type: "result",
      round: round.id,
      matches: results[round.id],
      recordedAt: revealTimes[round.id],
    };
    writeFileSync(
      join(ledgerDir, "results", `${round.id}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
  }

  mkdirSync(join(keysOut, ".."), { recursive: true });
  writeFileSync(keysOut, JSON.stringify(demoKeys, null, 2) + "\n");
  console.log(`Wrote demo ledger to ${ledgerDir} and keys to ${keysOut}`);
}

main();
