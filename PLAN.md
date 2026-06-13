# BracketChain — World Cup Bracket Game on GitHub Pages
### A build plan written as a Claude Fable 5 execution brief

---

## Why you're building this (the reason, not only the request)

I'm building a trustless, multiplayer World Cup bracket pool for a group of friends and internet strangers who don't trust a central scorekeeper. They need to join from a URL, prove their picks were locked before kickoff, and verify that nobody — including the repo owner — tampered with anyone's bracket after the fact. The output enables anyone to audit the whole game from public data alone. With that in mind: build the system described below, end to end, in a new GitHub repository, deployed to GitHub Pages.

## The core architectural decision (already made — do not re-litigate)

**GitHub Pages serves only static files. There is no server.** Therefore the git repository itself is the backend: an append-only, content-addressed, publicly replicated ledger. This is the "web3-like" property — we get tamper-evidence from git's hash chain and consensus from public visibility, without a blockchain.

- **Writes** go through GitHub (one commit per action). Git serializes commits, which is what makes concurrent writes safe — no locking code needed.
- **Reads** come from a SQLite snapshot (`state/game.sqlite`) that a GitHub Action rebuilds deterministically from the ledger on every push, published with the site and queried in-browser via sql.js (WASM). SQLite is read-only at the edge; the ledger is the source of truth.
- **"Realtime"** is ETag-based polling of the published state every 20–30 seconds, plus optimistic local updates. Do not attempt websockets; there is nothing to connect to.

## Trust model

1. **Identity.** Each player signs in with GitHub (OAuth device flow) and generates an ECDSA P-256 keypair in-browser via WebCrypto. The public key is registered to the ledger in one commit. A player is the pair (GitHub login, public key); every subsequent action is signed with the private key, which never leaves the browser (stored in IndexedDB, exportable as a backup phrase).
2. **Commit–reveal picks.** Before each round's deadline, a player submits only `SHA-256(canonical_pick_json || salt)` — signed and committed to the ledger. After the deadline, they reveal the pick and salt; an Action verifies the hash matches the prior commitment and rejects anything late or mismatched. Nobody can see picks early; nobody can change picks late.
3. **Merkle tree.** After each deadline, an Action builds a Merkle tree whose leaves are `H(player_pubkey || commitment)` for every player, sorted canonically, and publishes the root in `state/roots.json` (and as a git tag). The site lets any player fetch their inclusion proof and verify it client-side. A player who holds yesterday's root can prove their pick was in the set without trusting today's data.
4. **Scoring.** Match results enter the ledger via a scheduled Action (or admin commit). Standings are a pure function of (results, revealed picks) — any player can re-run the scorer locally and get an identical SQLite file, byte for byte. Determinism is a hard requirement: sorted keys, fixed timestamps from commit data, no randomness.

## Repository layout

```
bracketchain/
  app/                    # Vite + React static site
    src/lib/crypto.ts     # keygen, sign, verify, commitment hashing
    src/lib/merkle.ts     # tree build, root, inclusion proofs
    src/lib/ledger.ts     # read/poll published state, submit via GitHub API
    src/lib/db.ts         # sql.js loader + typed queries
    src/views/            # Lobby, Bracket, Player profile, Verify, Standings
  ledger/
    players/<login>.json  # registration records (signed)
    picks/<round>/<login>.json      # commitments, later revelations
    results/<round>.json
  state/                  # BUILD ARTIFACTS ONLY — written by CI, never by hand
    game.sqlite
    roots.json
  scripts/
    build-state.ts        # ledger -> sqlite + merkle roots (deterministic)
    verify-ledger.ts      # full audit: signatures, hashes, deadlines, roots
    deploy.sh             # one-command bootstrap: gh repo create, enable Pages, push
  .github/workflows/
    validate.yml          # on PR/dispatch: signature + schema + deadline checks
    build-and-deploy.yml  # on push to main: verify-ledger, build-state, build app, deploy Pages
    score.yml             # scheduled: ingest results, rebuild standings
  tests/
    unit/                 # crypto, merkle, scoring, determinism (vitest)
    e2e/                  # join -> commit -> reveal -> verify flow (playwright)
```

## Implementation units, in order

1. **Crypto + Merkle core with tests first.** `crypto.ts`, `merkle.ts`, canonical JSON serialization. Test scenarios: round-trip sign/verify; commitment matches independent hash; inclusion proof verifies against root; proof for a tampered leaf fails; tree of 1, 2, odd-count, and 64 leaves; canonicalization is stable across key order.
2. **Ledger schema + `build-state.ts` + `verify-ledger.ts`.** Test scenarios: identical ledger input produces byte-identical sqlite; late reveal rejected; reveal not matching commitment rejected; unsigned record rejected; duplicate registration rejected.
3. **GitHub Actions.** `validate.yml` gates writes; `build-and-deploy.yml` runs the full audit before every deploy — a deploy must fail if the ledger fails verification. Test by running workflows against fixture ledgers in CI.
4. **The app.** Lobby (join, keygen, register), Bracket (make picks, see commitment hash before submitting), Standings (sql.js queries), Verify page (paste any root or proof, check it locally), Player profiles (stats: accuracy, points, streak — all derived from the ledger). Poll `state/` with ETags for updates.
5. **`deploy.sh` + README.** One command from zero to a playable game: create repo from template, enable Pages, set the tournament fixture file, push. Include a "fork to run your own pool" section.
6. **E2E.** Playwright: two simulated players join, commit, deadline passes (fixture clock), reveal, scores compute, both verify their Merkle proofs in the UI.

## Boundaries

When something in this plan is ambiguous, the deliverable is your recommendation inside the work, not a pause. Don't add features beyond this spec: no chat, no wallets, no real blockchain, no notification system. Do the simplest thing that works well; validate only at system boundaries (user input, GitHub API responses). Don't create defensive branches or backups. Pause for me only when the work genuinely requires it: a destructive action, a real scope change (e.g., the OAuth device flow proves unusable on Pages and you need to choose a fallback such as fine-grained PAT entry), or a secret only I can provide. If you hit one of these, ask and end the turn rather than ending on a promise.

## Self-verification

Establish a method for checking your own work as you build. After each implementation unit, run the full test suite plus `verify-ledger.ts` against the fixture ledger, and dispatch a fresh-context verifier subagent to check the unit against this plan's test scenarios rather than your own recollection. Delegate independent units (e.g., the Verify page and the scorer) to parallel subagents and keep working while they run; intervene if one drifts from the trust model.

## Memory

Keep `NOTES/` in the repo root (gitignored): one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike — especially anything learned about GitHub API rate limits, Pages deployment quirks, or sql.js loading. Don't save what the repo or chat already records; update existing notes rather than duplicating; delete notes that prove wrong.

## Reporting

Before reporting progress, audit each claim against a tool result from this session — point to the passing test run, the green workflow, the deployed URL. If tests fail, say so with the output. Lead with the outcome: your first sentence should answer "what happened." When you finish, write the summary for a reader who watched none of the work: plain sentences, each file and workflow named in its own clause, no working shorthand.

## Definition of done

The repo exists, CI is green, the site is live on GitHub Pages, two test players have completed a full commit–reveal round, their picks appear in standings, and both can verify a Merkle inclusion proof in the browser against a published root. Nothing is done until it is verified.
