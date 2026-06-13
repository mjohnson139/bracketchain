import { useState } from "react";
import { useApp } from "../context.tsx";
import { queries } from "../lib/db.ts";
import { buildProof, leafHash, verifyProof, type InclusionProof } from "../lib/merkle.ts";

export function Verify() {
  const { db, roots } = useApp();
  const rounds = db ? queries.rounds(db) : [];
  const players = db ? queries.players(db) : [];

  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const [login, setLogin] = useState(players[0]?.login ?? "");
  const [externalRoot, setExternalRoot] = useState("");
  const [proof, setProof] = useState<InclusionProof | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pasted, setPasted] = useState("");
  const [pasteResult, setPasteResult] = useState<string | null>(null);

  if (!db || !roots) return null;
  const publishedRoot = roots.rounds[roundId]?.root;

  const buildAndVerify = async () => {
    setErr(null);
    setProof(null);
    setValid(null);
    try {
      const pick = queries.pickFor(db, roundId, login);
      if (!pick) throw new Error(`${login} has no committed pick in ${roundId}.`);
      const player = players.find((p) => p.login === login);
      if (!player) throw new Error(`${login} is not a registered player.`);
      const round = roots.rounds[roundId];
      if (!round) throw new Error(`No published root for ${roundId}.`);
      const leaf = await leafHash(player.public_key, pick.commitment);
      const built = await buildProof(round.leaves, leaf);
      const ok = await verifyProof(built);
      setProof(built);
      setValid(ok && built.root === round.root);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const verifyPasted = async () => {
    setPasteResult(null);
    try {
      const parsed = JSON.parse(pasted) as InclusionProof;
      const ok = await verifyProof(parsed);
      setPasteResult(
        ok
          ? `Valid: this proof reconstructs root ${parsed.root.slice(0, 16)}…`
          : "Invalid: the steps do not reconstruct the claimed root.",
      );
    } catch (e) {
      setPasteResult("Could not parse/verify: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Verify a Merkle inclusion proof</h2>
        <p className="muted">
          Prove that a player's committed pick is included in a round's published set — without
          trusting the snapshot. The proof is rebuilt and checked entirely in your browser. If you
          saved a root before the deadline, paste it below to confirm the set was not altered after
          the fact.
        </p>

        <div className="row">
          <label>
            Round
            <select value={roundId} onChange={(e) => setRoundId(e.target.value)}>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Player
            <select value={login} onChange={(e) => setLogin(e.target.value)}>
              {players.map((p) => (
                <option key={p.login} value={p.login}>
                  {p.login}
                </option>
              ))}
            </select>
          </label>
          <button onClick={buildAndVerify}>Build &amp; verify proof</button>
        </div>

        <div className="kv">
          <span>Published root ({roundId})</span>
          <code className="ellipsis">{publishedRoot ?? "—"}</code>
        </div>

        <label>
          Optional: a root you trust (e.g. saved earlier)
          <input
            value={externalRoot}
            onChange={(e) => setExternalRoot(e.target.value.trim())}
            placeholder="paste a 64-hex root to compare"
          />
        </label>

        {err && <p className="err">{err}</p>}

        {proof && (
          <div className="proof">
            <p>
              {valid ? (
                <span className="pill ok">✓ proof verifies against the published root</span>
              ) : (
                <span className="pill bad">✗ proof does not match</span>
              )}
            </p>
            {externalRoot && (
              <p>
                {externalRoot === proof.root ? (
                  <span className="pill ok">✓ matches your trusted root</span>
                ) : (
                  <span className="pill bad">✗ differs from your trusted root</span>
                )}
              </p>
            )}
            <div className="kv">
              <span>Leaf</span>
              <code className="ellipsis">{proof.leaf}</code>
            </div>
            <div className="kv">
              <span>Steps</span>
              <span>{proof.steps.length} sibling hashes</span>
            </div>
            <details>
              <summary>Show proof JSON (copy to verify elsewhere)</summary>
              <textarea readOnly rows={8} value={JSON.stringify(proof, null, 2)} />
            </details>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Verify an arbitrary proof</h3>
        <p className="muted">Paste any inclusion proof JSON to check it independently.</p>
        <textarea
          rows={6}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='{"leaf":"…","steps":[…],"root":"…"}'
        />
        <button onClick={verifyPasted} disabled={!pasted}>
          Verify pasted proof
        </button>
        {pasteResult && <p className={pasteResult.startsWith("Valid") ? "ok" : "err"}>{pasteResult}</p>}
      </section>
    </div>
  );
}
