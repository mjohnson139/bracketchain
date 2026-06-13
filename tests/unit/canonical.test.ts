import { describe, expect, it } from "vitest";
import { canonicalize } from "../../app/src/lib/canonical.ts";

describe("canonicalize", () => {
  it("is stable across key insertion order", () => {
    const a = canonicalize({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalize({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined properties but keeps null", () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("handles nested structures and strings with special chars", () => {
    expect(canonicalize({ s: 'he said "hi"\n', n: [1, { x: true }] })).toBe(
      '{"n":[1,{"x":true}],"s":"he said \\"hi\\"\\n"}',
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize({ x: Infinity })).toThrow();
    expect(() => canonicalize(NaN)).toThrow();
  });
});
