/**
 * Read-side query layer. Loads the published SQLite snapshot in the browser via
 * sql.js (WASM) and exposes typed queries. SQLite is read-only at the edge; the
 * ledger is the source of truth and this file is a deterministic projection of
 * it, so all reads here are advisory until verified against a Merkle root.
 */
import initSqlJs, { type Database } from "sql.js";
import { BASE_URL } from "../config.ts";

export interface Standing {
  login: string;
  points: number;
  correct: number;
  total: number;
  accuracy: number;
  best_streak: number;
}

export interface RoundRow {
  id: string;
  name: string;
  deadline: string;
  ordinal: number;
}

export interface PickRow {
  round: string;
  login: string;
  commitment: string;
  commit_time: string;
  revealed: number;
  pick_json: string | null;
  reveal_time: string | null;
}

export interface ResultRow {
  round: string;
  match_id: string;
  winner: string;
}

export interface RoundScoreRow {
  login: string;
  round: string;
  correct: number;
  total: number;
  points: number;
}

let sqlPromise: Promise<typeof import("sql.js").default extends never ? never : any> | null = null;

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => `${BASE_URL}sql-wasm.wasm` });
  }
  return sqlPromise;
}

/** Fetch and open the published snapshot. Pass an ETag-checked buffer if you have one. */
export async function loadDatabase(): Promise<Database> {
  const SQL = await getSql();
  const res = await fetch(`${BASE_URL}state/game.sqlite`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`failed to load snapshot: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return new SQL.Database(buf);
}

function rows<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  const out: T[] = [];
  while (stmt.step()) out.push(stmt.getAsObject() as T);
  stmt.free();
  return out;
}

export const queries = {
  standings: (db: Database) =>
    rows<Standing>(db, "SELECT * FROM standings ORDER BY points DESC, login ASC"),
  players: (db: Database) =>
    rows<{ login: string; public_key: string; created_at: string }>(
      db,
      "SELECT * FROM players ORDER BY login ASC",
    ),
  rounds: (db: Database) => rows<RoundRow>(db, "SELECT * FROM rounds ORDER BY ordinal ASC"),
  matches: (db: Database, round: string) =>
    rows<{ match_id: string; team_a: string | null; team_b: string | null }>(
      db,
      "SELECT match_id, team_a, team_b FROM matches WHERE round = ? ORDER BY match_id ASC",
      [round],
    ),
  picks: (db: Database, round: string) =>
    rows<PickRow>(db, "SELECT * FROM picks WHERE round = ? ORDER BY login ASC", [round]),
  pickFor: (db: Database, round: string, login: string) =>
    rows<PickRow>(db, "SELECT * FROM picks WHERE round = ? AND login = ?", [round, login])[0],
  results: (db: Database, round: string) =>
    rows<ResultRow>(db, "SELECT * FROM results WHERE round = ? ORDER BY match_id ASC", [round]),
  roundScores: (db: Database, login: string) =>
    rows<RoundScoreRow>(
      db,
      "SELECT * FROM round_scores WHERE login = ? ORDER BY round ASC",
      [login],
    ),
  standingFor: (db: Database, login: string) =>
    rows<Standing>(db, "SELECT * FROM standings WHERE login = ?", [login])[0],
  meta: (db: Database, key: string) =>
    rows<{ value: string }>(db, "SELECT value FROM meta WHERE key = ?", [key])[0]?.value,
};
