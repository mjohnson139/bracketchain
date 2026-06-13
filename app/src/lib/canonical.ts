/**
 * Canonical JSON serialization.
 *
 * Determinism is a hard requirement of the trust model: a commitment hash or a
 * signature is only verifiable if every party serializes the same value to the
 * exact same bytes. We therefore define ONE canonical form and use it
 * everywhere a value is hashed or signed.
 *
 * Rules:
 *  - Object keys are sorted lexicographically by UTF-16 code unit (JS default
 *    string comparison), recursively.
 *  - No insignificant whitespace.
 *  - `undefined` object properties are dropped (matches JSON.stringify).
 *  - Arrays preserve order (order is significant).
 *  - Only JSON-representable values are allowed; functions/symbols throw.
 *
 * This intentionally rejects non-finite numbers, because JSON cannot represent
 * them and silent coercion to null would break verification.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;

  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("canonicalize: non-finite numbers are not representable");
    }
    return JSON.stringify(value);
  }

  if (type === "boolean" || type === "string") {
    return JSON.stringify(value);
  }

  if (type === "bigint") {
    throw new Error("canonicalize: bigint is not representable in JSON");
  }

  if (Array.isArray(value)) {
    return "[" + value.map((v) => serialize(v === undefined ? null : v)).join(",") + "]";
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const entries = keys.map((k) => JSON.stringify(k) + ":" + serialize(obj[k]));
    return "{" + entries.join(",") + "}";
  }

  throw new Error(`canonicalize: unsupported type ${type}`);
}
