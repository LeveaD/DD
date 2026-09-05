/**
 * Demo Dispute Store — Milestone 7
 *
 * In-memory state store managing canonical demo dispute cases and associated snapshots
 * for the backend REST API and React frontend dashboard.
 *
 * PRE-SEEDED DEMO CASES:
 *   1. D-1001 (Strong Evidence / FULL_EVIDENCE): Complete telemetry → Defendable → Draft → Human Approval
 *   2. D-1002 (Missing Telemetry / MISSING_IP): Missing IP log → Manual Review (No LLM draft)
 *   3. D-1003 (Contradictory / CONTRADICTORY_TIMESTAMPS): Access before purchase → Manual Review (No LLM draft)
 *   4. D-1004 (Identity Mismatch / IDENTITY_MISMATCH): Disputer ≠ Purchaser → Manual Review (No LLM draft)
 *   5. D-1005 (Invalid LLM Output Demo / FAULT_DEMO): LLM output fails validation → Manual Review
 *
 * IMMUTABILITY & SAFETY BOUNDARIES:
 *   - Ground truth labels are NEVER stored on runtime DisputeCase objects or returned in DTOs.
 *   - State machine and engine modules control state transitions.
 *   - Shared AuditLogger instance captures all audit events.
 */

import type {
  DisputeCase,
  VerifiedEvidenceSnapshot,
  EvidenceSignals,
} from "../schemas/index.js";
import { AuditLogger } from "../audit/auditLogger.js";
import { MERCHANT_DB } from "../data/fixtures.js";

export interface DemoDisputeItem {
  disputeCase: DisputeCase;
  snapshot: VerifiedEvidenceSnapshot;
}

export class DemoDisputeStore {
  private readonly disputes = new Map<string, DemoDisputeItem>();
  public readonly auditLogger = new AuditLogger();

  constructor() {
    this.seedDemoCases();
  }

  /**
   * Populate the store with standard demo cases from canonical merchant database.
   */
  private seedDemoCases(): void {
    const db = MERCHANT_DB.db;
    const bundles = MERCHANT_DB.bundles;
    const b0 = bundles[0]!;
    const b1 = bundles[1]!;
    const b2 = bundles[2]!;
    const b3 = bundles[3]!;

    // 1. D-1001: Strong Evidence Case
    const snapshot1001: VerifiedEvidenceSnapshot = {
      user: b0.user,
      transaction: b0.transaction,
      ip_logs: b0.ipLogs,
      tos_log: b0.tosLog,
      consumption_log: b0.consumptionLog,
      found: true,
    };

    const case1001: DisputeCase = {
      dispute_id: "D-1001",
      transaction_id: b0.transaction.transaction_id,
      amount: b0.transaction.amount,
      currency: b0.transaction.currency,
      reason_code: "10.4",
      chargeback_date: "2026-03-05T00:00:00Z",
      current_state: "RECEIVED",
      created_at: "2026-03-05T01:00:00Z",
    };

    this.disputes.set(case1001.dispute_id, { disputeCase: case1001, snapshot: snapshot1001 });

    // 2. D-1002: Missing IP Evidence Case
    // Remove IP logs and make consumption IP mismatched so ip_consistency fails
    db.ipLogs.set(b1.user.user_id, []);
    const mismatchedTxn1002 = { ...b1.transaction, ip_address: "192.0.2.1" };
    db.transactions.set(b1.transaction.transaction_id, mismatchedTxn1002);

    const snapshot1002: VerifiedEvidenceSnapshot = {
      user: b1.user,
      transaction: mismatchedTxn1002,
      ip_logs: [], // Missing IP log
      tos_log: b1.tosLog,
      consumption_log: b1.consumptionLog,
      found: true,
    };

    const case1002: DisputeCase = {
      dispute_id: "D-1002",
      transaction_id: b1.transaction.transaction_id,
      amount: b1.transaction.amount,
      currency: b1.transaction.currency,
      reason_code: "10.4",
      chargeback_date: "2026-03-05T00:00:00Z",
      current_state: "RECEIVED",
      created_at: "2026-03-05T01:05:00Z",
    };

    this.disputes.set(case1002.dispute_id, { disputeCase: case1002, snapshot: snapshot1002 });

    // 3. D-1003: Contradictory Timestamps Case
    // Modify DB consumption log for b2 transaction to be 1 hour BEFORE transaction
    const badCsl103 = b2.consumptionLog ? { ...b2.consumptionLog, consumed_at: "2026-01-01T00:00:00Z" } : null;
    if (badCsl103) {
      db.consumptionLogs.set(b2.transaction.transaction_id, [badCsl103]);
    }

    const snapshot1003: VerifiedEvidenceSnapshot = {
      user: b2.user,
      transaction: b2.transaction,
      ip_logs: b2.ipLogs,
      tos_log: b2.tosLog,
      consumption_log: badCsl103,
      found: true,
    };

    const case1003: DisputeCase = {
      dispute_id: "D-1003",
      transaction_id: b2.transaction.transaction_id,
      amount: b2.transaction.amount,
      currency: b2.transaction.currency,
      reason_code: "10.4",
      chargeback_date: "2026-03-05T00:00:00Z",
      current_state: "RECEIVED",
      created_at: "2026-03-05T01:10:00Z",
    };

    this.disputes.set(case1003.dispute_id, { disputeCase: case1003, snapshot: snapshot1003 });

    // 4. D-1004: Identity Mismatch Case
    const mismatchedTxn504 = { ...b3.transaction, user_id: "usr_DIFFERENT_999" };

    const snapshot1004: VerifiedEvidenceSnapshot = {
      user: b3.user,
      transaction: mismatchedTxn504,
      ip_logs: b3.ipLogs,
      tos_log: b3.tosLog,
      consumption_log: b3.consumptionLog,
      found: true,
    };

    const case1004: DisputeCase = {
      dispute_id: "D-1004",
      transaction_id: b3.transaction.transaction_id,
      amount: b3.transaction.amount,
      currency: b3.transaction.currency,
      reason_code: "10.4",
      chargeback_date: "2026-03-05T00:00:00Z",
      current_state: "RECEIVED",
      created_at: "2026-03-05T01:15:00Z",
    };

    this.disputes.set(case1004.dispute_id, { disputeCase: case1004, snapshot: snapshot1004 });
  }

  public getDispute(disputeId: string): DemoDisputeItem | undefined {
    return this.disputes.get(disputeId);
  }

  public getAllDisputes(): DemoDisputeItem[] {
    return Array.from(this.disputes.values());
  }

  public setDispute(disputeId: string, item: DemoDisputeItem): void {
    this.disputes.set(disputeId, item);
  }
}
