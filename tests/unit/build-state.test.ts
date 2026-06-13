import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildState } from "../../scripts/build-state.ts";
import { verifyLedger } from "../../scripts/verify-ledger.ts";

const LEDGER = join(__dirname, "..", "..", "ledger");

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "bc-state-"));
}

describe("build-state over the demo ledger", () => {
  it("the demo ledger passes verification", async () => {
    expect(await verifyLedger(LEDGER)).toEqual([]);
  });

  it("produces a byte-identical sqlite from identical input", async () => {
    const a = tmp();
    const b = tmp();
    try {
      await buildState(LEDGER, a);
      await buildState(LEDGER, b);
      const fileA = readFileSync(join(a, "game.sqlite"));
      const fileB = readFileSync(join(b, "game.sqlite"));
      expect(Buffer.compare(fileA, fileB)).toBe(0);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("produces identical roots.json from identical input", async () => {
    const a = tmp();
    const b = tmp();
    try {
      await buildState(LEDGER, a);
      await buildState(LEDGER, b);
      expect(readFileSync(join(a, "roots.json"), "utf8")).toBe(
        readFileSync(join(b, "roots.json"), "utf8"),
      );
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
