/**
 * Node-only helpers to read a ledger directory into typed records.
 * Used by build-state.ts and verify-ledger.ts. Reading is the only place we
 * touch the filesystem; everything downstream operates on plain objects.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  PickRecord,
  Registration,
  ResultRecord,
  Tournament,
} from "../app/src/lib/types.ts";

export interface LoadedLedger {
  tournament: Tournament;
  registrations: Registration[];
  picks: PickRecord[];
  results: ResultRecord[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

export function loadLedger(ledgerDir: string): LoadedLedger {
  const tournament = readJson<Tournament>(join(ledgerDir, "tournament.json"));

  const playersDir = join(ledgerDir, "players");
  const registrations = listJson(playersDir)
    .map((f) => readJson<Registration>(join(playersDir, f)))
    // Sorted for deterministic downstream processing.
    .sort((a, b) => a.login.localeCompare(b.login));

  const picksDir = join(ledgerDir, "picks");
  const picks: PickRecord[] = [];
  if (existsSync(picksDir)) {
    for (const round of readdirSync(picksDir).sort()) {
      const roundDir = join(picksDir, round);
      for (const f of listJson(roundDir)) {
        picks.push(readJson<PickRecord>(join(roundDir, f)));
      }
    }
  }
  picks.sort((a, b) => a.round.localeCompare(b.round) || a.login.localeCompare(b.login));

  const resultsDir = join(ledgerDir, "results");
  const results = listJson(resultsDir)
    .map((f) => readJson<ResultRecord>(join(resultsDir, f)))
    .sort((a, b) => a.round.localeCompare(b.round));

  return { tournament, registrations, picks, results };
}
