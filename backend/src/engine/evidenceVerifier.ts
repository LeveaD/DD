/**
 * Evidence Verifier — Milestone 3
 *
 * Takes raw evidence records and performs deterministic verification:
 *   - referential integrity checks
 *   - identity consistency
 *   - temporal sequence validation
 *   - IP/session consistency (as supporting signal only)
 *   - contradiction detection
 *
 * Produces:
 *   - EvidenceSignals (boolean flags per DATA_MODEL.md §3)
 *   - VerifiedEvidenceSnapshot (runtime snapshot — no ground_truth)
 *   - Structured reason information for explainability/audit
 *
 * CRITICAL:
 *   - Does NOT call scenarioOracle()
 *   - Does NOT read EvalGroundTruth / ORACLE_LABEL_TABLE
 *   - Does NOT fabricate missing records
 *   - IP signals are supporting consistency signals only — never identity proof
 *
 * Per ARCHITECTURE.md §5 signal definitions:
 *   identity_match:         dispute.user_id == transaction.user_id  (checked by caller)
 *   ip_consistency:         transaction.ip_address matched in ipLogs or consumptionLog
 *   post_purchase_consumption: ≥1 consumption log for the transaction
 *   tos_accepted:           tosLog exists with accepted_at ≤ transaction.timestamp
 *   temporal_sequence_valid: tosLog.accepted_at ≤ txn.timestamp ≤ consumption.consumed_at
 */

import type {
  EvidenceSignals,
  VerifiedEvidenceSnapshot,
  ConsumptionLog,
} from "../schemas/index.js";
import type { RawEvidenceRecords } from "./evidenceRepository.js";

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

export interface VerificationReason {
  identity_match_detail: string;
  ip_consistency_detail: string;
  post_purchase_consumption_detail: string;
  tos_accepted_detail: string;
  temporal_sequence_detail: string;
  contradictions: string[];
}

export type VerificationResult =
  | {
      ok: true;
      signals: EvidenceSignals;
      snapshot: VerifiedEvidenceSnapshot;
      reason: VerificationReason;
    }
  | {
      ok: false;
      detail: string;
      /** Partial snapshot still useful for audit logging */
      snapshot: VerifiedEvidenceSnapshot;
    };

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

/**
 * Verify raw evidence records deterministically.
 *
 * @param records - raw records from the evidence repository
 * @param disputeUserId - the user_id from the chargeback webhook payload
 *                        (used to check identity_match against the transaction)
 */
export function verifyEvidence(
  records: RawEvidenceRecords,
  disputeUserId: string,
): VerificationResult {
  const { transaction, user, ipLogs, tosLog, consumptionLogs } = records;

  // Safety: these should have been guaranteed by the repository, but verify
  if (transaction === null || user === null) {
    const partialSnapshot: VerifiedEvidenceSnapshot = {
      user: null,
      transaction: null,
      ip_logs: [],
      tos_log: null,
      consumption_log: null,
      found: false,
    };
    return {
      ok: false,
      detail: "Verification called with null transaction or user — this is a programming error",
      snapshot: partialSnapshot,
    };
  }

  const contradictions: string[] = [];

  // -------------------------------------------------------------------
  // 1. Identity match (ARCHITECTURE.md §5: dispute.user_id == transaction.user_id)
  // -------------------------------------------------------------------
  const identity_match = disputeUserId === transaction.user_id;
  const identity_match_detail = identity_match
    ? `dispute user_id="${disputeUserId}" matches transaction user_id="${transaction.user_id}"`
    : `MISMATCH: dispute user_id="${disputeUserId}" ≠ transaction user_id="${transaction.user_id}"`;

  if (!identity_match) {
    contradictions.push(`Identity mismatch: ${identity_match_detail}`);
  }

  // -------------------------------------------------------------------
  // 2. Pick best consumption log for this transaction
  //    Multiple logs are valid; we use the earliest one for temporal checks.
  // -------------------------------------------------------------------
  const relevantConsumption: ConsumptionLog | null =
    consumptionLogs.length > 0
      ? (consumptionLogs.reduce((earliest, c) =>
          new Date(c.consumed_at) < new Date(earliest.consumed_at) ? c : earliest,
        ) ?? null)
      : null;

  // -------------------------------------------------------------------
  // 3. Post-purchase consumption signal
  // -------------------------------------------------------------------
  const post_purchase_consumption = relevantConsumption !== null;
  const post_purchase_consumption_detail = post_purchase_consumption
    ? `Consumption log found: resource="${relevantConsumption!.resource_id}" at ${relevantConsumption!.consumed_at}`
    : "No post-purchase consumption log found for this transaction";

  // -------------------------------------------------------------------
  // 4. TOS accepted signal (accepted_at ≤ transaction.timestamp)
  // -------------------------------------------------------------------
  let tos_accepted = false;
  let tos_accepted_detail: string;

  if (tosLog === null) {
    tos_accepted_detail = "No TOS acceptance log found for this user";
  } else {
    const tosAt = new Date(tosLog.accepted_at).getTime();
    const txnAt = new Date(transaction.timestamp).getTime();
    tos_accepted = tosAt <= txnAt;
    if (tos_accepted) {
      tos_accepted_detail = `TOS ${tosLog.tos_version} accepted at ${tosLog.accepted_at} ≤ txn at ${transaction.timestamp}`;
    } else {
      tos_accepted_detail = `TOS accepted AFTER transaction: ${tosLog.accepted_at} > ${transaction.timestamp}`;
      contradictions.push(`TOS accepted after transaction: ${tos_accepted_detail}`);
    }
  }

  // -------------------------------------------------------------------
  // 5. Temporal sequence valid: tos.accepted_at ≤ txn.timestamp ≤ consumption.consumed_at
  // -------------------------------------------------------------------
  let temporal_sequence_valid = false;
  let temporal_sequence_detail: string;

  if (tosLog !== null && relevantConsumption !== null) {
    const tosAt = new Date(tosLog.accepted_at).getTime();
    const txnAt = new Date(transaction.timestamp).getTime();
    const conAt = new Date(relevantConsumption.consumed_at).getTime();

    if (tosAt <= txnAt && txnAt <= conAt) {
      temporal_sequence_valid = true;
      temporal_sequence_detail =
        `Valid sequence: TOS(${tosLog.accepted_at}) ≤ txn(${transaction.timestamp}) ≤ consumption(${relevantConsumption.consumed_at})`;
    } else if (txnAt > conAt) {
      temporal_sequence_detail =
        `CONTRADICTION: consumption(${relevantConsumption.consumed_at}) occurs BEFORE transaction(${transaction.timestamp})`;
      contradictions.push(`Impossible timestamp sequence: ${temporal_sequence_detail}`);
    } else {
      temporal_sequence_detail =
        `Temporal check failed: TOS(${tosLog.accepted_at}) > txn(${transaction.timestamp})`;
    }
  } else {
    temporal_sequence_detail =
      `Cannot establish temporal sequence: ${tosLog === null ? "no TOS log" : ""}${tosLog === null && relevantConsumption === null ? " + " : ""}${relevantConsumption === null ? "no consumption log" : ""}`;
  }

  // -------------------------------------------------------------------
  // 6. IP consistency (supporting signal only — not identity proof)
  //    transaction.ip_address matched in any ipLog or consumption log
  //    Per PRD §3: NAT/VPN limitations explicitly noted.
  // -------------------------------------------------------------------
  const txnIp = transaction.ip_address;
  const ipLogMatch = ipLogs.some((log) => log.ip_address === txnIp);
  const consumptionIpMatch =
    relevantConsumption !== null && relevantConsumption.ip_address === txnIp;

  const ip_consistency = ipLogMatch || consumptionIpMatch;
  let ip_consistency_detail: string;
  if (ip_consistency) {
    ip_consistency_detail =
      `IP consistency signal present: transaction IP "${txnIp}" matched in ` +
      (ipLogMatch ? "IP logs" : "") +
      (ipLogMatch && consumptionIpMatch ? " and " : "") +
      (consumptionIpMatch ? "consumption log" : "") +
      `. (Note: IP matches are supporting signals only; NAT/VPN may weaken this signal.)`;
  } else if (ipLogs.length === 0 && relevantConsumption === null) {
    ip_consistency_detail =
      `No IP logs or consumption log available to check consistency against transaction IP "${txnIp}"`;
  } else {
    ip_consistency_detail =
      `Transaction IP "${txnIp}" not found in available IP logs or consumption log IP — ` +
      `supporting consistency signal absent (may indicate NAT/VPN or different device)`;
  }

  // -------------------------------------------------------------------
  // 7. Assemble final structures
  // -------------------------------------------------------------------
  const signals: EvidenceSignals = {
    identity_match,
    ip_consistency,
    post_purchase_consumption,
    tos_accepted,
    temporal_sequence_valid,
  };

  const snapshot: VerifiedEvidenceSnapshot = {
    user,
    transaction,
    ip_logs: ipLogs,
    tos_log: tosLog,
    consumption_log: relevantConsumption,
    found: true,
  };

  const reason: VerificationReason = {
    identity_match_detail,
    ip_consistency_detail,
    post_purchase_consumption_detail,
    tos_accepted_detail,
    temporal_sequence_detail,
    contradictions,
  };

  return { ok: true, signals, snapshot, reason };
}
