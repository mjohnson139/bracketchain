/**
 * App-wide state: the loaded SQLite snapshot, the published Merkle roots, the
 * local identity, and the write token. The snapshot/roots are reloaded whenever
 * ETag polling detects a new deploy.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Database } from "sql.js";
import { loadDatabase } from "./lib/db.ts";
import { fetchRoots, pollState } from "./lib/ledger.ts";
import { loadIdentity, type Identity } from "./identity.ts";
import type { PublishedRoots } from "./lib/types.ts";

interface AppState {
  db: Database | null;
  roots: PublishedRoots | null;
  loadError: string | null;
  identity: Identity | null;
  setIdentity: (id: Identity | null) => void;
  refreshIdentity: () => Promise<void>;
  token: string;
  setToken: (t: string) => void;
  reload: () => Promise<void>;
  lastUpdated: number;
}

const Ctx = createContext<AppState | null>(null);

const TOKEN_KEY = "bracketchain.token";

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [roots, setRoots] = useState<PublishedRoots | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [token, setTokenState] = useState<string>(
    () => sessionStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const reload = async () => {
    try {
      const [database, publishedRoots] = await Promise.all([loadDatabase(), fetchRoots()]);
      setDb((old) => {
        old?.close();
        return database;
      });
      setRoots(publishedRoots);
      setLoadError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshIdentity = async () => setIdentity(await loadIdentity());

  const setToken = (t: string) => {
    setTokenState(t);
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  };

  useEffect(() => {
    void reload();
    void refreshIdentity();
    const stop = pollState(() => void reload());
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider
      value={{
        db,
        roots,
        loadError,
        identity,
        setIdentity,
        refreshIdentity,
        token,
        setToken,
        reload,
        lastUpdated,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
