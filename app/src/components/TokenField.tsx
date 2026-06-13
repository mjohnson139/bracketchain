import { useState } from "react";
import { useApp } from "../context.tsx";
import { REPO } from "../config.ts";

/**
 * Collects the fine-grained PAT used to author ledger commits. It is held only
 * in sessionStorage (cleared when the tab closes) and is never written to the
 * ledger or sent anywhere except api.github.com.
 */
export function TokenField() {
  const { token, setToken } = useApp();
  const [value, setValue] = useState(token);

  return (
    <div>
      <p className="muted">
        Writes are GitHub commits. Paste a fine-grained Personal Access Token scoped to{" "}
        <code>
          {REPO.owner}/{REPO.repo}
        </code>{" "}
        with <strong>Contents: Read and write</strong>. It stays in this tab only.
      </p>
      <label>
        Personal Access Token
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          placeholder="github_pat_…"
          autoComplete="off"
        />
      </label>
      <div className="row">
        <button onClick={() => setToken(value)} disabled={value === token}>
          {token ? "Update token" : "Save token"}
        </button>
        {token && (
          <button
            className="ghost"
            onClick={() => {
              setValue("");
              setToken("");
            }}
          >
            Clear
          </button>
        )}
        {token && <span className="pill ok">token set</span>}
      </div>
      <p className="muted small">
        Create one at GitHub → Settings → Developer settings → Fine-grained tokens.
      </p>
    </div>
  );
}
