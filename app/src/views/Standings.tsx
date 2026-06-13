import { useApp } from "../context.tsx";
import { queries } from "../lib/db.ts";

export function Standings() {
  const { db } = useApp();
  const standings = db ? queries.standings(db) : [];

  return (
    <section className="card">
      <h2>Standings</h2>
      <p className="muted">
        Points are a pure function of revealed picks and recorded results (10 per correct pick).
        Anyone can re-run the scorer locally and get this exact table.
      </p>
      {standings.length === 0 ? (
        <p className="muted">No revealed picks have been scored yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Points</th>
              <th>Correct</th>
              <th>Accuracy</th>
              <th>Best streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.login}>
                <td>{i + 1}</td>
                <td>
                  <a
                    href="#/profile"
                    onClick={() => sessionStorage.setItem("profile.login", s.login)}
                  >
                    {s.login}
                  </a>
                </td>
                <td>
                  <strong>{s.points}</strong>
                </td>
                <td>
                  {s.correct}/{s.total}
                </td>
                <td>{(s.accuracy * 100).toFixed(1)}%</td>
                <td>{s.best_streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
