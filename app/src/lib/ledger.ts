/**
 * Browser ledger client.
 *
 * Reads: fetch the published Merkle roots and poll for changes via ETags. There
 * is no server to subscribe to, so "realtime" is ETag-conditional polling of the
 * static state every POLL_MS.
 *
 * Writes: one commit per action through the GitHub Contents API. Git serializes
 * commits, so no locking is needed. The player authorizes with a fine-grained
 * Personal Access Token (Contents: read/write on this repo). See README — the
 * device-flow OAuth alternative cannot complete a token exchange from a static
 * site (GitHub's token endpoint has no CORS), so a scoped PAT is the supported
 * path on Pages.
 */
import { BASE_URL, POLL_MS, REPO } from "../config.ts";
import { signPayload } from "./crypto.ts";
import {
  commitSignedView,
  registrationSignedView,
  revealSignedView,
} from "./validation.ts";
import type { PickRecord, PublishedRoots, Registration } from "./types.ts";
import type { Identity, LocalCommitment } from "../identity.ts";

export async function fetchRoots(): Promise<PublishedRoots> {
  const res = await fetch(`${BASE_URL}state/roots.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`failed to load roots.json: ${res.status}`);
  return res.json();
}

/**
 * Poll the published state for changes using the ETag of roots.json. Calls
 * onChange whenever the artifact changes (a new deploy). Returns a stop fn.
 */
export function pollState(onChange: () => void): () => void {
  let etag: string | null = null;
  let stopped = false;

  const tick = async () => {
    try {
      const res = await fetch(`${BASE_URL}state/roots.json`, {
        method: "HEAD",
        cache: "no-cache",
        headers: etag ? { "If-None-Match": etag } : {},
      });
      const next = res.headers.get("ETag");
      if (res.status === 200 && next && next !== etag) {
        if (etag !== null) onChange();
        etag = next;
      }
    } catch {
      // Network blips are expected; just try again next tick.
    }
  };

  const id = setInterval(() => {
    if (!stopped) void tick();
  }, POLL_MS);
  void tick();

  return () => {
    stopped = true;
    clearInterval(id);
  };
}

// ---- GitHub Contents API ----

const API = "https://api.github.com";

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

interface ContentMeta {
  sha: string;
  json: unknown;
}

async function getContent(token: string, path: string): Promise<ContentMeta | null> {
  const res = await fetch(
    `${API}/repos/${REPO.owner}/${REPO.repo}/contents/${path}?ref=${REPO.branch}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await ghError(res, `read ${path}`));
  const body = await res.json();
  const decoded = new TextDecoder().decode(
    Uint8Array.from(atob(body.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
  );
  return { sha: body.sha, json: JSON.parse(decoded) };
}

async function putContent(
  token: string,
  path: string,
  obj: unknown,
  message: string,
  sha?: string,
): Promise<void> {
  const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(JSON.stringify(obj, null, 2) + "\n"),
      branch: REPO.branch,
      sha,
    }),
  });
  if (!res.ok) throw new Error(await ghError(res, `write ${path}`));
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghError(res: Response, action: string): Promise<string> {
  let detail = "";
  try {
    detail = (await res.json()).message ?? "";
  } catch {
    /* ignore */
  }
  return `GitHub API ${res.status} on ${action}${detail ? `: ${detail}` : ""}`;
}

export async function submitRegistration(token: string, identity: Identity): Promise<void> {
  const reg: Registration = {
    type: "registration",
    login: identity.login,
    publicKey: identity.publicKey,
    createdAt: new Date().toISOString(),
    signature: "",
  };
  reg.signature = await signPayload(identity.keyPair.privateKey, registrationSignedView(reg));
  const path = `ledger/players/${identity.login}.json`;
  const existing = await getContent(token, path);
  if (existing) throw new Error("You are already registered.");
  await putContent(token, path, reg, `register player ${identity.login}`);
}

/** Build (but do not submit) the commit record and its local commitment. */
export async function buildCommit(
  identity: Identity,
  round: string,
  commitment: LocalCommitment,
): Promise<PickRecord> {
  const rec: PickRecord = {
    type: "pick",
    round,
    login: identity.login,
    publicKey: identity.publicKey,
    commitment: commitment.commitment,
    commitTime: new Date().toISOString(),
    commitSignature: "",
  };
  rec.commitSignature = await signPayload(identity.keyPair.privateKey, commitSignedView(rec));
  return rec;
}

export async function submitCommit(
  token: string,
  identity: Identity,
  rec: PickRecord,
): Promise<void> {
  const path = `ledger/picks/${rec.round}/${identity.login}.json`;
  const existing = await getContent(token, path);
  if (existing) throw new Error(`You already committed a pick for ${rec.round}.`);
  await putContent(token, path, rec, `commit pick ${rec.round}/${identity.login}`);
}

export async function submitReveal(
  token: string,
  identity: Identity,
  round: string,
  commitment: LocalCommitment,
): Promise<void> {
  const path = `ledger/picks/${round}/${identity.login}.json`;
  const existing = await getContent(token, path);
  if (!existing) throw new Error(`No committed pick found for ${round}.`);
  const rec = existing.json as PickRecord;
  if (rec.commitment !== commitment.commitment) {
    throw new Error("Local commitment does not match the on-chain commitment.");
  }
  rec.reveal = {
    pick: commitment.pick,
    salt: commitment.salt,
    revealTime: new Date().toISOString(),
    signature: "",
  };
  rec.reveal.signature = await signPayload(identity.keyPair.privateKey, revealSignedView(rec));
  await putContent(token, path, rec, `reveal pick ${round}/${identity.login}`, existing.sha);
}
