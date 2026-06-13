import { useState } from "react";
import { useApp } from "../context.tsx";
import { queries } from "../lib/db.ts";
import { submitRegistration } from "../lib/ledger.ts";
import {
  clearIdentity,
  createIdentity,
  importIdentity,
} from "../identity.ts";
import { TokenField } from "../components/TokenField.tsx";

export function Lobby() {
  const { db, identity, refreshIdentity, token } = useApp();
  const players = db ? queries.players(db) : [];
  const registered = identity ? players.some((p) => p.login === identity.login) : false;

  const [login, setLogin] = useState("");
  const [backup, setBackup] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="grid">
      <section className="card">
        <h2>Your identity</h2>
        <p className="muted">
          An ECDSA P-256 keypair is generated in your browser and stored in IndexedDB. The
          private key never leaves this device. Save the backup phrase to recover it elsewhere.
        </p>

        {!identity ? (
          <>
            <label>
              GitHub login
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value.trim())}
                placeholder="your-github-username"
              />
            </label>
            <button
              disabled={busy || !login}
              onClick={() => run(async () => {
                await createIdentity(login);
                await refreshIdentity();
                setMsg("Identity created. Back it up below, then register.");
              })}
            >
              Generate identity
            </button>

            <details>
              <summary>Restore from a backup phrase</summary>
              <textarea
                value={backup}
                onChange={(e) => setBackup(e.target.value)}
                placeholder="login.publicKey.privateKey"
                rows={3}
              />
              <button
                disabled={busy || !backup}
                onClick={() => run(async () => {
                  await importIdentity(backup);
                  await refreshIdentity();
                  setMsg("Identity restored.");
                })}
              >
                Restore
              </button>
            </details>
          </>
        ) : (
          <>
            <div className="kv">
              <span>Login</span>
              <code>{identity.login}</code>
            </div>
            <div className="kv">
              <span>Public key</span>
              <code className="ellipsis" title={identity.publicKey}>
                {identity.publicKey}
              </code>
            </div>
            <details>
              <summary>⚠️ Backup phrase (keep secret — it is your private key)</summary>
              <textarea readOnly value={identity.backup} rows={3} onFocus={(e) => e.target.select()} />
            </details>

            <div className="row">
              {registered ? (
                <span className="pill ok">Registered on the ledger ✓</span>
              ) : (
                <button
                  disabled={busy || !token}
                  title={token ? "" : "Enter a token below first"}
                  onClick={() => run(async () => {
                    await submitRegistration(token, identity);
                    setMsg("Registration committed. It appears once CI rebuilds the snapshot.");
                  })}
                >
                  Register on the ledger
                </button>
              )}
              <button
                className="ghost"
                disabled={busy}
                onClick={() => run(async () => {
                  await clearIdentity();
                  await refreshIdentity();
                  setMsg("Identity forgotten on this device.");
                })}
              >
                Forget identity
              </button>
            </div>
          </>
        )}

        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </section>

      <section className="card">
        <h2>Write access</h2>
        <TokenField />
      </section>

      <section className="card">
        <h2>Players ({players.length})</h2>
        {players.length === 0 ? (
          <p className="muted">No players have registered yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Login</th>
                <th>Public key</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.login}>
                  <td>
                    <a href={`#/profile`} onClick={() => sessionStorage.setItem("profile.login", p.login)}>
                      {p.login}
                    </a>
                  </td>
                  <td>
                    <code className="ellipsis" title={p.public_key}>
                      {p.public_key.slice(0, 16)}…
                    </code>
                  </td>
                  <td className="muted">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
