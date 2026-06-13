/**
 * Full ledger audit. Exits non-zero on any problem so a deploy can be gated on
 * it. Checks: every signature, every commitment↔reveal hash, deadline rules,
 * unique registrations, and that picks come from registered keys.
 *
 * Usage: tsx scripts/verify-ledger.ts [ledgerDir]
 */
import {
  getRound,
  validatePickRecord,
  validateRegistration,
  validateResult,
} from "../app/src/lib/validation.ts";
import { loadLedger } from "./ledger-io.ts";

export async function verifyLedger(ledgerDir: string): Promise<string[]> {
  const { tournament, registrations, picks, results } = loadLedger(ledgerDir);
  const problems: string[] = [];

  // Registrations: valid signature + unique login.
  const keyByLogin = new Map<string, string>();
  const seen = new Set<string>();
  for (const reg of registrations) {
    for (const p of await validateRegistration(reg)) problems.push(`[player ${reg.login}] ${p}`);
    if (seen.has(reg.login)) problems.push(`[player ${reg.login}] duplicate registration`);
    seen.add(reg.login);
    keyByLogin.set(reg.login, reg.publicKey);
  }

  // Picks: one per (round, login), valid against round + registered key.
  const pickSeen = new Set<string>();
  for (const pick of picks) {
    const round = getRound(tournament, pick.round);
    if (!round) {
      problems.push(`[pick ${pick.round}/${pick.login}] unknown round`);
      continue;
    }
    const key = `${pick.round}/${pick.login}`;
    if (pickSeen.has(key)) problems.push(`[pick ${key}] duplicate pick record`);
    pickSeen.add(key);
    for (const p of await validatePickRecord(pick, round, keyByLogin.get(pick.login))) {
      problems.push(`[pick ${key}] ${p}`);
    }
  }

  // Results: schema only (authority is the repo owner via the commit).
  for (const result of results) {
    const round = getRound(tournament, result.round);
    if (!round) {
      problems.push(`[result ${result.round}] unknown round`);
      continue;
    }
    for (const p of validateResult(result, round)) problems.push(`[result ${result.round}] ${p}`);
  }

  return problems;
}

async function main() {
  const ledgerDir = process.argv[2] ?? "ledger";
  const problems = await verifyLedger(ledgerDir);
  if (problems.length > 0) {
    console.error(`Ledger verification FAILED with ${problems.length} problem(s):`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("Ledger verification PASSED.");
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
