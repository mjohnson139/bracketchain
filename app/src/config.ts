/**
 * Deployment configuration.
 *
 * To run your own pool: fork the repo and change `owner`/`repo` to your fork.
 * Players authorize writes with a fine-grained Personal Access Token scoped to
 * this repository (Contents: read/write) — see the README. The token is held
 * only in memory for the session and is never committed anywhere.
 */
export const REPO = {
  owner: "mjohnson139",
  repo: "bracketchain",
  branch: "main",
};

/** Base URL the site is served from (e.g. "/bracketchain/" on Pages, "/" in dev). */
export const BASE_URL: string = import.meta.env.BASE_URL;

/** Poll interval for published state, in milliseconds. */
export const POLL_MS = 25_000;
