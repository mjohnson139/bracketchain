/**
 * Build the read-side artifacts from the ledger:
 *   - state/game.sqlite  (queried in-browser via sql.js)
 *   - state/roots.json   (Merkle roots + leaves per round)
 *
 * Determinism is a hard requirement: identical ledger input must produce a
 * byte-identical sqlite file. We achieve this by running the full audit first
 * (a deploy must never be built from an invalid ledger), then writing every row
 * in sorted order inside a single transaction, with no wall-clock or random
 * input. The only timestamps stored come from the ledger itself.
 *
 * Usage: tsx scripts/build-state.ts [ledgerDir] [outDir]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { canonicalize } from "../app/src/lib/canonical.ts";
import { compareStrings } from "../app/src/lib/encoding.ts";
import { computeRoot, leafHash, sortLeaves } from "../app/src/lib/merkle.ts";
import { computeScores, type RevealedPick } from "../app/src/lib/scoring.ts";
import type { PublishedRoots } from "../app/src/lib/types.ts";
import { loadLedger } from "./ledger-io.ts";
import { verifyLedger } from "./verify-ledger.ts";

const SCHEMA_VERSION = 1;

export async function buildState(ledgerDir: string, outDir: string): Promise<void> {
  const problems = await verifyLedger(ledgerDir);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to build state from an invalid ledger (${problems.length} problem(s)):\n` +
        problems.map((p) => "  - " + p).join("\n"),
    );
  }

  const ledger = loadLedger(ledgerDir);
  mkdirSync(outDir, { recursive: true });

  // ---- Merkle roots per round (over committed picks) ----
  const roots: PublishedRoots = {
    schemaVersion: SCHEMA_VERSION,
    tournament: ledger.tournament.name,
    rounds: {},
  };
  for (const round of ledger.tournament.rounds) {
    const roundPicks = ledger.picks
      .filter((p) => p.round === round.id)
      .sort((a, b) => compareStrings(a.login, b.login));
    const leaves: string[] = [];
    for (const p of roundPicks) leaves.push(await leafHash(p.publicKey, p.commitment));
    const sorted = sortLeaves(leaves);
    roots.rounds[round.id] = {
      root: await computeRoot(sorted),
      leafCount: sorted.length,
      leaves: sorted,
    };
  }
  writeFileSync(join(outDir, "roots.json"), JSON.stringify(roots, null, 2) + "\n");

  // ---- Scores ----
  const reveals: RevealedPick[] = ledger.picks
    .filter((p) => p.reveal)
    .map((p) => ({ login: p.login, round: p.round, pick: p.reveal!.pick }));
  const { roundScores, standings } = computeScores(
    ledger.tournament,
    ledger.results,
    reveals,
  );

  // ---- SQLite ----
  const dbPath = join(outDir, "game.sqlite");
  rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  db.pragma("page_size = 4096");
  db.pragma("journal_mode = DELETE");
  db.pragma(`user_version = ${SCHEMA_VERSION}`);

  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE rounds (id TEXT PRIMARY KEY, name TEXT, deadline TEXT, ordinal INTEGER) WITHOUT ROWID;
    CREATE TABLE matches (round TEXT, match_id TEXT, PRIMARY KEY (round, match_id)) WITHOUT ROWID;
    CREATE TABLE players (login TEXT PRIMARY KEY, public_key TEXT, created_at TEXT) WITHOUT ROWID;
    CREATE TABLE picks (
      round TEXT, login TEXT, commitment TEXT, commit_time TEXT,
      revealed INTEGER, pick_json TEXT, reveal_time TEXT,
      PRIMARY KEY (round, login)
    ) WITHOUT ROWID;
    CREATE TABLE results (round TEXT, match_id TEXT, winner TEXT, PRIMARY KEY (round, match_id)) WITHOUT ROWID;
    CREATE TABLE round_scores (
      login TEXT, round TEXT, correct INTEGER, total INTEGER, points INTEGER,
      PRIMARY KEY (login, round)
    ) WITHOUT ROWID;
    CREATE TABLE standings (
      login TEXT PRIMARY KEY, points INTEGER, correct INTEGER, total INTEGER,
      accuracy REAL, best_streak INTEGER
    ) WITHOUT ROWID;
    CREATE TABLE roots (round TEXT PRIMARY KEY, root TEXT, leaf_count INTEGER) WITHOUT ROWID;
  `);

  const insertAll = db.transaction(() => {
    const meta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    meta.run("schema_version", String(SCHEMA_VERSION));
    meta.run("tournament", ledger.tournament.name);

    const insRound = db.prepare(
      "INSERT INTO rounds (id, name, deadline, ordinal) VALUES (?, ?, ?, ?)",
    );
    const insMatch = db.prepare("INSERT INTO matches (round, match_id) VALUES (?, ?)");
    ledger.tournament.rounds.forEach((r, i) => {
      insRound.run(r.id, r.name, r.deadline, i);
      for (const m of [...r.matchIds].sort()) insMatch.run(r.id, m);
    });

    const insPlayer = db.prepare(
      "INSERT INTO players (login, public_key, created_at) VALUES (?, ?, ?)",
    );
    for (const p of ledger.registrations) insPlayer.run(p.login, p.publicKey, p.createdAt);

    const insPick = db.prepare(
      `INSERT INTO picks (round, login, commitment, commit_time, revealed, pick_json, reveal_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of ledger.picks) {
      insPick.run(
        p.round,
        p.login,
        p.commitment,
        p.commitTime,
        p.reveal ? 1 : 0,
        p.reveal ? canonicalize(p.reveal.pick) : null,
        p.reveal ? p.reveal.revealTime : null,
      );
    }

    const insResult = db.prepare(
      "INSERT INTO results (round, match_id, winner) VALUES (?, ?, ?)",
    );
    for (const r of ledger.results) {
      for (const matchId of Object.keys(r.matches).sort()) {
        insResult.run(r.round, matchId, r.matches[matchId]);
      }
    }

    const insRoundScore = db.prepare(
      "INSERT INTO round_scores (login, round, correct, total, points) VALUES (?, ?, ?, ?, ?)",
    );
    for (const s of roundScores) insRoundScore.run(s.login, s.round, s.correct, s.total, s.points);

    const insStanding = db.prepare(
      `INSERT INTO standings (login, points, correct, total, accuracy, best_streak)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const s of standings) {
      insStanding.run(s.login, s.points, s.correct, s.total, s.accuracy, s.bestStreak);
    }

    const insRoot = db.prepare(
      "INSERT INTO roots (round, root, leaf_count) VALUES (?, ?, ?)",
    );
    for (const round of ledger.tournament.rounds) {
      const r = roots.rounds[round.id];
      insRoot.run(round.id, r.root, r.leafCount);
    }
  });
  insertAll();
  db.close();
}

async function main() {
  const ledgerDir = process.argv[2] ?? "ledger";
  const outDir = process.argv[3] ?? "state";
  await buildState(ledgerDir, outDir);
  const bytes = readFileSync(join(outDir, "game.sqlite")).length;
  console.log(`Built ${join(outDir, "game.sqlite")} (${bytes} bytes) and roots.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
