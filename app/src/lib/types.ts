/**
 * Ledger record shapes — the on-disk schema under ledger/.
 *
 * Every signed record signs the canonical JSON of itself with its signature
 * field(s) removed (see signedView in validation.ts). Signatures bind a record
 * to the player's public key; the binding of public key to GitHub login is
 * asserted by the commit author, which GitHub authenticates.
 */

/** A predicted set of match winners for one round. This is what gets committed. */
export interface Pick {
  round: string;
  /** matchId -> predicted winner code (e.g. "BRA"). */
  picks: Record<string, string>;
}

/** ledger/players/<login>.json */
export interface Registration {
  type: "registration";
  login: string;
  /** base64url raw P-256 public key point. */
  publicKey: string;
  createdAt: string;
  /** signature over the record without `signature`. */
  signature: string;
}

/** The reveal half of a pick record, added after the deadline. */
export interface Reveal {
  pick: Pick;
  /** base64url salt used in the commitment. */
  salt: string;
  revealTime: string;
  /** signature over { type:"reveal", round, login, pick, salt, revealTime }. */
  signature: string;
}

/** ledger/picks/<round>/<login>.json */
export interface PickRecord {
  type: "pick";
  round: string;
  login: string;
  publicKey: string;
  /** hex SHA-256( canonical(pick) || salt ). */
  commitment: string;
  commitTime: string;
  /** signature over the record without `commitSignature` and `reveal`. */
  commitSignature: string;
  /** present only after the player reveals. */
  reveal?: Reveal;
}

/** ledger/results/<round>.json — admin-entered match outcomes. */
export interface ResultRecord {
  type: "result";
  round: string;
  /** matchId -> actual winner code. */
  matches: Record<string, string>;
  recordedAt: string;
}

export interface RoundConfig {
  id: string;
  name: string;
  /** ISO timestamp; commitments must be submitted at or before this. */
  deadline: string;
  /** match ids that belong to this round. */
  matchIds: string[];
  /** optional two-team lineup per match id, for the picking UI. */
  matchTeams?: Record<string, [string, string]>;
}

/** ledger/tournament.json */
export interface Tournament {
  name: string;
  rounds: RoundConfig[];
}

/** state/roots.json — published Merkle roots and leaves per round. */
export interface PublishedRoots {
  schemaVersion: number;
  tournament: string;
  rounds: Record<
    string,
    { root: string; leafCount: number; leaves: string[] }
  >;
}
