import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context.tsx";
import { queries, type RoundRow } from "../lib/db.ts";
import { computeCommitment, randomSalt } from "../lib/crypto.ts";
import { buildCommit, submitCommit, submitReveal } from "../lib/ledger.ts";
import { saveCommitment } from "../identity.ts";
import type { Pick } from "../lib/types.ts";

type Phase = "open" | "reveal";

function phaseOf(round: RoundRow): Phase {
  return Date.now() < new Date(round.deadline).getTime() ? "open" : "reveal";
}

export function Bracket() {
  const { db, identity, token, reload, refreshIdentity } = useApp();
  const rounds = db ? queries.rounds(db) : [];
  const [roundId, setRoundId] = useState<string>(rounds[0]?.id ?? "");
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];

  const matches = db && round ? queries.matches(db, round.id) : [];
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [commitmentHash, setCommitmentHash] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const existing = db && round && identity ? queries.pickFor(db, round.id, identity.login) : undefined;
  const localCommitment = identity && round ? identity.commitments[round.id] : undefined;

  const pick: Pick | null = useMemo(() => {
    if (!round) return null;
    return { round: round.id, picks: selections };
  }, [round, selections]);

  // Live commitment preview so the player sees exactly what will be committed.
  useEffect(() => {
    let active = true;
    if (!pick || Object.keys(pick.picks).length === 0) {
      setCommitmentHash("");
      return;
    }
    // Preview uses a fixed display salt of zeros; the real commit uses a fresh
    // random salt. The point is to show the hashing is deterministic, not to
    // reveal the actual commitment.
    void computeCommitment(pick, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
      .then((h) => active && setCommitmentHash(h));
    return () => {
      active = false;
    };
  }, [pick]);

  if (!round) return <div className="card">No rounds configured.</div>;
  const phase = phaseOf(round);
  const allPicked = matches.every((m) => selections[m.match_id]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doCommit = () =>
    run(async () => {
      if (!identity) throw new Error("Create an identity in the Lobby first.");
      if (!token) throw new Error("Enter a write token in the Lobby first.");
      if (!allPicked) throw new Error("Pick a winner for every match.");
      const realPick: Pick = { round: round.id, picks: selections };
      const salt = randomSalt();
      const commitment = await computeCommitment(realPick, salt);
      const rec = await buildCommit(identity, round.id, { pick: realPick, salt, commitment });
      await submitCommit(token, identity, rec);
      // Persist locally so we can reveal after the deadline.
      await saveCommitment(round.id, { pick: realPick, salt, commitment });
      await refreshIdentity();
      setMsg(`Committed. Commitment ${commitment.slice(0, 16)}… is now on the ledger.`);
    });

  const doReveal = () =>
    run(async () => {
      if (!identity) throw new Error("Create an identity first.");
      if (!token) throw new Error("Enter a write token in the Lobby first.");
      if (!localCommitment) {
        throw new Error("No locally stored commitment for this round on this device.");
      }
      await submitReveal(token, identity, round.id, localCommitment);
      setMsg("Reveal committed. Standings update once CI rebuilds the snapshot.");
    });

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <h2>{round.name}</h2>
          <select value={round.id} onChange={(e) => { setRoundId(e.target.value); setSelections({}); }}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          Deadline {new Date(round.deadline).toLocaleString()} —{" "}
          {phase === "open" ? (
            <span className="pill open">open for commitments</span>
          ) : (
            <span className="pill locked">locked · reveal phase</span>
          )}
        </p>

        {existing && (
          <p className={existing.revealed ? "ok" : "muted"}>
            You have {existing.revealed ? "revealed" : "committed"} for this round. Commitment{" "}
            <code>{existing.commitment.slice(0, 16)}…</code>
          </p>
        )}
      </section>

      <section className="card">
        <h3>Your picks</h3>
        <div className="matches">
          {matches.map((m) => {
            const teams = m.team_a && m.team_b ? [m.team_a, m.team_b] : null;
            return (
              <div className="match" key={m.match_id}>
                <span className="match-id">{m.match_id}</span>
                {teams ? (
                  <div className="teamchoice">
                    {teams.map((t) => (
                      <label key={t} className={selections[m.match_id] === t ? "sel" : ""}>
                        <input
                          type="radio"
                          name={m.match_id}
                          value={t}
                          disabled={phase !== "open" || !!existing}
                          checked={selections[m.match_id] === t}
                          onChange={() => setSelections((s) => ({ ...s, [m.match_id]: t }))}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    placeholder="winner code"
                    disabled={phase !== "open" || !!existing}
                    value={selections[m.match_id] ?? ""}
                    onChange={(e) =>
                      setSelections((s) => ({ ...s, [m.match_id]: e.target.value.trim().toUpperCase() }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {commitmentHash && !existing && (
          <div className="preview">
            <span className="muted">Commitment preview (sample salt):</span>{" "}
            <code>{commitmentHash}</code>
            <p className="muted small">
              Only this hash is published when you commit. Your actual picks stay secret until you
              reveal them after the deadline.
            </p>
          </div>
        )}

        <div className="row">
          {phase === "open" && !existing && (
            <button disabled={busy || !allPicked} onClick={doCommit}>
              Commit picks
            </button>
          )}
          {phase === "reveal" && existing && !existing.revealed && (
            <button disabled={busy} onClick={doReveal}>
              Reveal picks
            </button>
          )}
          <button className="ghost" disabled={busy} onClick={() => void reload()}>
            Refresh
          </button>
        </div>

        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </section>
    </div>
  );
}
