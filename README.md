# BracketChain

A **trustless** World Cup bracket pool that runs entirely on GitHub Pages — no
server, no central scorekeeper. The git repository *is* the backend: an
append-only, content-addressed, publicly replicated ledger. You get
tamper-evidence from git's hash chain and consensus from public visibility,
without a blockchain.

Anyone can audit the entire game from public data alone. Players prove their
picks were locked before kickoff and verify that nobody — including the repo
owner — altered any bracket after the fact.

## How the trust model works

- **Identity.** Each player generates an ECDSA P-256 keypair in the browser
  (WebCrypto). The private key never leaves the device (stored in IndexedDB,
  exportable as a backup phrase). The public key is registered to the ledger in
  one signed commit. A player is the pair *(GitHub login, public key)*.
- **Commit–reveal.** Before a round's deadline a player commits only
  `SHA-256(canonical_pick_json || salt)` — signed. After the deadline they
  reveal the pick and salt; CI verifies the hash matches the commitment and
  rejects anything late or mismatched. Nobody sees picks early; nobody changes
  picks late.
- **Merkle proofs.** After each deadline, CI builds a Merkle tree whose leaves
  are `SHA-256(pubkey ‖ commitment)` for every player, and publishes the root in
  `state/roots.json`. Any player can fetch their inclusion proof and verify it
  client-side. Hold yesterday's root and you can prove your pick was in the set
  without trusting today's data.
- **Deterministic scoring.** Standings are a pure function of *(results,
  revealed picks)*. Anyone can re-run the build locally and get a
  **byte-identical** `state/game.sqlite` — sorted keys, timestamps only from the
  ledger, no randomness.

Reads come from that SQLite snapshot, queried in-browser via sql.js (WASM).
"Realtime" is ETag polling of the published state every 25 seconds.

## Repository layout

```
app/                    Vite + React static site
  src/lib/crypto.ts     keygen, sign/verify, commitment hashing
  src/lib/merkle.ts     tree build, root, inclusion proofs (domain-separated)
  src/lib/canonical.ts  canonical JSON — the one hashing/signing form
  src/lib/validation.ts ledger rules (signatures, deadlines, commit↔reveal)
  src/lib/scoring.ts    deterministic standings
  src/lib/db.ts         sql.js loader + typed queries
  src/lib/ledger.ts     poll published state, submit via GitHub API
  src/views/            Lobby, Bracket, Standings, Verify, Profile
ledger/                 the source of truth (committed by players)
  tournament.json       rounds, deadlines, match lineups
  players/<login>.json  signed registrations
  picks/<round>/<login>.json   commitment, then revelation
  results/<round>.json  admin-entered outcomes
state/                  BUILD ARTIFACTS ONLY — written by CI (game.sqlite, roots.json)
scripts/                build-state, verify-ledger, make-fixture, deploy.sh
.github/workflows/      validate, build-and-deploy, score
tests/                  unit + e2e
```

## Local development

```bash
npm install
npm run dev          # builds state from ledger/, stages assets, serves the app
```

Open the printed URL. The dev server reads the same `state/` snapshot the
deployed site uses.

## Testing

```bash
npm test             # unit + integration (crypto, merkle, scoring, determinism, verify flow)
npm run typecheck
npm run verify:ledger  # full ledger audit (signatures, schema, deadlines, hashes)
npm run e2e          # Playwright browser flow (needs a Chromium download)
```

## How to play

1. **Create an identity** in the Lobby (enter your GitHub login → *Generate
   identity*). Save the backup phrase somewhere safe — it is your private key.
2. **Authorize writes.** Writes are GitHub commits, so paste a **fine-grained
   Personal Access Token** scoped to this repository with **Contents: Read and
   write** (GitHub → Settings → Developer settings → Fine-grained tokens). The
   token stays in the browser tab only and is never committed.
3. **Register** on the ledger.
4. **Commit** your picks for the open round before its deadline. You'll see the
   commitment hash before you submit; only that hash is published.
5. **Reveal** after the deadline. The pick and salt (held on your device) are
   published and checked against your commitment.
6. **Verify** on the Verify page: build your inclusion proof and confirm it
   reconstructs the published root.

> **A note on authentication.** GitHub's OAuth *device flow* cannot complete a
> token exchange from a static site — the token endpoint sends no CORS headers,
> so a browser-only Pages deployment can't finish the handshake. The supported
> path here is therefore a repository-scoped fine-grained PAT, which needs no
> backend. If you later add a tiny token-exchange proxy, the write layer in
> `app/src/lib/ledger.ts` is the only place that would change.

## How to audit (trust nothing)

```bash
git clone <this repo> && cd bracketchain && npm install

# 1. Every signature, deadline, and commit↔reveal hash:
npm run verify:ledger

# 2. Rebuild the published snapshot yourself — it is byte-identical:
npm run build:state -- ledger /tmp/audit
sha256sum /tmp/audit/game.sqlite state/game.sqlite   # compare to the deployed file

# 3. Verify any player's Merkle proof against a root you saved earlier
#    (Verify page, or programmatically with app/src/lib/merkle.ts).
```

If `verify-ledger` passes and your rebuilt `game.sqlite` matches the deployed
one, the standings are provably correct given the ledger — and the ledger's
history is git's tamper-evident commit chain.

## Fork to run your own pool

1. **Fork** this repository.
2. Edit `app/src/config.ts` → set `REPO` to your `owner/repo`.
3. Edit `ledger/tournament.json` for your tournament (rounds, deadlines,
   match lineups). Optionally reset the demo data with
   `npm run make:fixture` (this regenerates demo players with fresh keys).
4. Run the bootstrap:

   ```bash
   scripts/deploy.sh                 # existing 'origin'
   scripts/deploy.sh you/your-pool   # or create a new repo from this dir
   ```

   It audits the ledger, enables Pages (source: *GitHub Actions*), and pushes.
   The `build-and-deploy` workflow then publishes to
   `https://<you>.github.io/<your-pool>/`.

If you prefer the dashboard: repo **Settings → Pages → Build and deployment →
Source: GitHub Actions**, then push to `main`.

## Continuous integration

- **validate.yml** — on every push and pull request: unit tests, typecheck,
  full ledger audit, a byte-identical determinism check, and the browser e2e
  flow. This gates ledger writes.
- **build-and-deploy.yml** — on push to `main`: re-runs the audit (a deploy
  **fails** if the ledger fails verification), rebuilds state deterministically,
  builds the site, and publishes to Pages.
- **score.yml** — daily and on demand: reuses the deploy pipeline so newly
  recorded results are scored and republished.
