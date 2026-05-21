import { getDb } from './index.js';
import type { CastVote } from '../chain/events.js';

/**
 * Persist a single CastVote. Primary key is
 * (collection, approvalLevel, approver, approval, proposal, voter), so the same
 * voter casting again on the same proposal overwrites their previous weight.
 */
export function recordVote(v: CastVote): void {
  getDb()
    .prepare(
      `INSERT INTO votes(
         collection_id, approval_level, approver_address, approval_id, proposal_id,
         voter_address, yes_weight, voter_weight, cast_at
       ) VALUES (?, 'collection', '', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection_id, approval_level, approver_address, approval_id, proposal_id, voter_address) DO UPDATE SET
         yes_weight = excluded.yes_weight,
         voter_weight = excluded.voter_weight,
         cast_at = excluded.cast_at`,
    )
    .run(v.collectionId, v.approvalId, v.proposalId, v.voter, v.yesWeight, v.voterWeight, Date.now());
}

export interface VoteTally {
  totalYesWeight: number;
  totalVoterWeight: number;
}

/**
 * Sum the local vote tally for one proposal. Each vote contributes
 * `(yesWeight / 100) * voterWeight` toward the affirmative side; the
 * proposal reaches quorum when this sum ≥ `(quorumThreshold / 100) * totalVoterWeight`.
 */
export function tallyVotes(collectionId: string, approvalId: string): VoteTally {
  const rows = getDb()
    .prepare(
      'SELECT yes_weight, voter_weight FROM votes WHERE collection_id = ? AND approval_id = ?',
    )
    .all(collectionId, approvalId) as Array<{ yes_weight: number; voter_weight: number }>;
  let totalYes = 0;
  let totalVoter = 0;
  for (const r of rows) {
    totalYes += (r.yes_weight / 100) * r.voter_weight;
    totalVoter += r.voter_weight;
  }
  return { totalYesWeight: totalYes, totalVoterWeight: totalVoter };
}
