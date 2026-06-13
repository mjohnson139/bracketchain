import { useState } from "react";
import { useApp } from "../context.tsx";
import { queries } from "../lib/db.ts";

export function Profile() {
  const { db, identity } = useApp();
  const players = db ? queries.players(db) : [];
  const initial =
    sessionStorage.getItem("profile.login") ?? identity?.login ?? players[0]?.login ?? "";
  const [login, setLogin] = useState(initial);

  if (!db) return null;
  const standing = login ? queries.standingFor(db, login) : undefined;
  const roundScores = login ? queries.roundScores(db, login) : [];
  const player = players.find((p) => p.login === login);

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <h2>Player profile</h2>
          <select value={login} onChange={(e) => setLogin(e.target.value)}>
            {players.map((p) => (
              <option key={p.login} value={p.login}>
                {p.login}
              </option>
            ))}
          </select>
        </div>
        {!player ? (
          <p className="muted">No such player.</p>
        ) : (
          <>
            <div className="kv">
              <span>Public key</span>
              <code className="ellipsis" title={player.public_key}>
                {player.public_key}
              </code>
            </div>
            <div className="stats">
              <Stat label="Points" value={standing?.points ?? 0} />
              <Stat
                label="Accuracy"
                value={standing ? `${(standing.accuracy * 100).toFixed(1)}%` : "—"}
              />
              <Stat label="Correct" value={standing ? `${standing.correct}/${standing.total}` : "—"} />
              <Stat label="Best streak" value={standing?.best_streak ?? 0} />
            </div>
          </>
        )}
      </section>

      {roundScores.length > 0 && (
        <section className="card">
          <h3>By round</h3>
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Correct</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {roundScores.map((r) => (
                <tr key={r.round}>
                  <td>{r.round}</td>
                  <td>
                    {r.correct}/{r.total}
                  </td>
                  <td>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
