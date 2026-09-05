/**
 * Evidence Repository — Milestone 3
 *
 * Looks up raw merchant DB records by dispute/transaction/user ID.
 * This layer only finds and returns records.
 * It does NOT verify, score, or route.
 *
 * All data is retrieved from the synthetic merchant database only.
 * This layer NEVER fabricates missing records.
 * Missing records are returned as null — the caller decides what to do.
 *
 * No evaluation ground truth is read here.
 */

import type {
  User,
  Transaction,
  IPLog,
  TOSLog,
  ConsumptionLog,
} from "../schemas/index.js";
import type { SyntheticMerchantDb } from "../data/merchantDb.js";

// ---------------------------------------------------------------------------
// Raw lookup result types
// ---------------------------------------------------------------------------

/** All raw records associated with a transaction, as-found in the DB. */
export interface RawEvidenceRecords {
  /** null if transaction_id not found in DB */
  transaction: Transaction | null;
  /** null if user_id on transaction not found */
  user: User | null;
  /** empty array if no IP logs for user */
  ipLogs: IPLog[];
  /** null if no TOS log for user */
  tosLog: TOSLog | null;
  /** empty array if no consumption logs for this transaction */
  consumptionLogs: ConsumptionLog[];
}

export type LookupFailureReason =
  | "TRANSACTION_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "DB_ERROR";

export type LookupResult =
  | { ok: true; records: RawEvidenceRecords }
  | { ok: false; reason: LookupFailureReason; detail: string };

// ---------------------------------------------------------------------------
// Evidence repository
// ---------------------------------------------------------------------------

/**
 * Retrieve all raw evidence records for a given transaction_id.
 *
 * Fail-closed design:
 *   - If transaction not found → ok:false, TRANSACTION_NOT_FOUND
 *   - If user on transaction not found → ok:false, USER_NOT_FOUND
 *   - If unexpected error thrown → ok:false, DB_ERROR
 *   - Missing optional records (IP logs, TOS, consumption) → null/empty,
 *     returned with ok:true so the verifier can evaluate them.
 *
 * NEVER fabricates missing records.
 * NEVER reads evaluation ground truth.
 *
 * @param db - the synthetic merchant database
 * @param transaction_id - the transaction to look up
 */
export function lookupEvidenceByTransaction(
  db: SyntheticMerchantDb,
  transaction_id: string,
): LookupResult {
  try {
    // 1. Find the transaction
    const transaction = db.transactions.get(transaction_id) ?? null;
    if (transaction === null) {
      return {
        ok: false,
        reason: "TRANSACTION_NOT_FOUND",
        detail: `No transaction found for transaction_id="${transaction_id}"`,
      };
    }

    // 2. Find the user referenced by the transaction
    const user = db.users.get(transaction.user_id) ?? null;
    if (user === null) {
      return {
        ok: false,
        reason: "USER_NOT_FOUND",
        detail: `Transaction "${transaction_id}" references user_id="${transaction.user_id}" which does not exist in the merchant DB`,
      };
    }

    // 3. Fetch optional telemetry — missing is ok:true (verifier evaluates)
    const ipLogs: IPLog[] = db.ipLogs.get(user.user_id) ?? [];
    const tosLog: TOSLog | null = db.tosLogs.get(user.user_id) ?? null;
    const consumptionLogs: ConsumptionLog[] = db.consumptionLogs.get(transaction_id) ?? [];

    return {
      ok: true,
      records: { transaction, user, ipLogs, tosLog, consumptionLogs },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "DB_ERROR",
      detail: `Unexpected DB error during lookup: ${msg}`,
    };
  }
}
