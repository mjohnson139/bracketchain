import { useEffect, useState } from "react";
import { useApp } from "./context.tsx";
import { Lobby } from "./views/Lobby.tsx";
import { Bracket } from "./views/Bracket.tsx";
import { Standings } from "./views/Standings.tsx";
import { Verify } from "./views/Verify.tsx";
import { Profile } from "./views/Profile.tsx";

const VIEWS = ["lobby", "bracket", "standings", "verify", "profile"] as const;
type View = (typeof VIEWS)[number];

function currentView(): View {
  const hash = window.location.hash.replace(/^#\/?/, "") as View;
  return VIEWS.includes(hash) ? hash : "lobby";
}

export function App() {
  const { db, roots, loadError, identity, lastUpdated } = useApp();
  const [view, setView] = useState<View>(currentView());

  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">⛓️</span>
          <div>
            <h1>BracketChain</h1>
            <p className="tagline">Trustless bracket pool — verify everything, trust no one.</p>
          </div>
        </div>
        <nav>
          {VIEWS.map((v) => (
            <a key={v} href={`#/${v}`} className={v === view ? "active" : ""}>
              {v[0].toUpperCase() + v.slice(1)}
            </a>
          ))}
        </nav>
        <div className="who">
          {identity ? (
            <span title={identity.publicKey}>
              signed in as <strong>{identity.login}</strong>
            </span>
          ) : (
            <span className="muted">no identity</span>
          )}
        </div>
      </header>

      <main>
        {loadError && (
          <div className="banner error">
            Could not load published state: {loadError}. If the site was just deployed, the
            snapshot may still be building.
          </div>
        )}
        {!db || !roots ? (
          !loadError && <div className="banner">Loading published state…</div>
        ) : (
          <>
            {view === "lobby" && <Lobby />}
            {view === "bracket" && <Bracket />}
            {view === "standings" && <Standings />}
            {view === "verify" && <Verify />}
            {view === "profile" && <Profile />}
          </>
        )}
      </main>

      <footer>
        <span>
          Snapshot loaded {new Date(lastUpdated).toLocaleTimeString()} · polls every 25s
        </span>
        <a href="https://github.com/mjohnson139/bracketchain" target="_blank" rel="noreferrer">
          source &amp; audit instructions
        </a>
      </footer>
    </div>
  );
}
