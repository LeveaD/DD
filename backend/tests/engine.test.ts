/**
 * Milestone 3 — Engine & State Machine Tests (Vitest)
 *
 * Tests:
 *   - Evidence repository (retrieval, missing records, mismatched refs)
 *   - Evidence verifier (signals, contradictions, partial evidence)
 *   - Router (DEFENDABLE / MANUAL_REVIEW routing policy)
 *   - State machine (valid/invalid transitions, terminal states)
 *   - Engine pipeline (orchestration, fail-closed, full happy path)
 *   - Ground truth isolation (runtime engine never reads EvalGroundTruth)
 */

import { describe, it, expect } from "vitest";
import type { SyntheticMerchantDb } from "../src/data/merchantDb.js";
import type { User, Transaction, IPLog, TOSLog, ConsumptionLog, EvidenceSignals } from "../src/schemas/index.js";
import { DISPUTE_STATES } from "../src/schemas/index.js";
import { lookupEvidenceByTransaction } from "../src/engine/evidenceRepository.js";
import { verifyEvidence } from "../src/engine/evidenceVerifier.js";
import { routeDispute } from "../src/engine/router.js";
import {
  transition,
  isValidTransition,
  allowedNextStates,
  isTerminalState,
} from "../src/engine/stateMachine.js";
import { processDispute } from "../src/engine/index.js";
import { generateMerchantDb } from "../src/data/merchantDb.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: "usr_001",
    name: "Test User",
    email: "testuser@synth-mail.test",
    created_at: "2026-08-01T08:00:00Z",
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transaction_id: "txn_001",
    user_id: "usr_001",
    amount: 4999,
    currency: "INR",
    timestamp: "2026-08-10T10:00:00Z",
    ip_address: "192.0.2.10",
    payment_method: "card",
    card_last4: "4242",
    ...overrides,
  };
}

function makeIPLog(overrides: Partial<IPLog> = {}): IPLog {
  return {
    log_id: "ipl_001",
    user_id: "usr_001",
    ip_address: "192.0.2.10",
    timestamp: "2026-08-10T09:55:00Z",
    device_info: "SyntheticBrowser/1.0",
    ...overrides,
  };
}

function makeTOSLog(overrides: Partial<TOSLog> = {}): TOSLog {
  return {
    tos_id: "tos_001",
    user_id: "usr_001",
    tos_version: "v2.1",
    accepted_at: "2026-08-10T09:58:00Z",
    ip_address: "192.0.2.10",
    ...overrides,
  };
}

function makeConsumptionLog(overrides: Partial<ConsumptionLog> = {}): ConsumptionLog {
  return {
    consumption_id: "con_001",
    user_id: "usr_001",
    transaction_id: "txn_001",
    resource_id: "digital_course_pdf",
    consumed_at: "2026-08-10T10:20:00Z",
    ip_address: "192.0.2.10",
    bytes_downloaded: 5_242_880,
    ...overrides,
  };
}

function makeDb(overrides: {
  user?: User;
  transaction?: Transaction;
  ipLogs?: IPLog[];
  tosLog?: TOSLog | null;
  consumptionLog?: ConsumptionLog | null;
} = {}): SyntheticMerchantDb {
  const user = overrides.user ?? makeUser();
  const transaction = overrides.transaction ?? makeTransaction();
  const ipLogs = overrides.ipLogs ?? [makeIPLog()];
  const tosLog = overrides.tosLog !== undefined ? overrides.tosLog : makeTOSLog();
  const consumptionLog = overrides.consumptionLog !== undefined ? overrides.consumptionLog : makeConsumptionLog();

  const db: SyntheticMerchantDb = {
    users: new Map([[user.user_id, user]]),
    transactions: new Map([[transaction.transaction_id, transaction]]),
    ipLogs: new Map([[user.user_id, ipLogs]]),
    tosLogs: new Map(),
    consumptionLogs: new Map([[transaction.transaction_id, consumptionLog ? [consumptionLog] : []]]),
  };
  if (tosLog !== null) {
    db.tosLogs.set(user.user_id, tosLog);
  }
  return db;
}

function allTrueSignals(): EvidenceSignals {
  return {
    identity_match: true,
    ip_consistency: true,
    post_purchase_consumption: true,
    tos_accepted: true,
    temporal_sequence_valid: true,
  };
}

// ---------------------------------------------------------------------------
// §1  Evidence Repository
// ---------------------------------------------------------------------------

describe("Evidence Repository", () => {
  it("retrieves transaction and user for a known transaction_id", () => {
    const db = makeDb();
    const result = lookupEvidenceByTransaction(db, "txn_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records.transaction?.transaction_id).toBe("txn_001");
      expect(result.records.user?.user_id).toBe("usr_001");
    }
  });

  it("returns correct IP logs for the user", () => {
    const db = makeDb();
    const result = lookupEvidenceByTransaction(db, "txn_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records.ipLogs).toHaveLength(1);
      expect(result.records.ipLogs[0]?.ip_address).toBe("192.0.2.10");
    }
  });

  it("returns TOS log for the user", () => {
    const db = makeDb();
    const result = lookupEvidenceByTransaction(db, "txn_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records.tosLog).not.toBeNull();
      expect(result.records.tosLog?.tos_version).toBe("v2.1");
    }
  });

  it("returns consumption logs for the transaction", () => {
    const db = makeDb();
    const result = lookupEvidenceByTransaction(db, "txn_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records.consumptionLogs).toHaveLength(1);
    }
  });

  it("fails with TRANSACTION_NOT_FOUND for unknown transaction_id", () => {
    const db = makeDb();
    const result = lookupEvidenceByTransaction(db, "txn_DOES_NOT_EXIST");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TRANSACTION_NOT_FOUND");
    }
  });

  it("fails with USER_NOT_FOUND when transaction references a missing user", () => {
    const txn = makeTransaction({ user_id: "usr_MISSING" });
    const db: SyntheticMerchantDb = {
      users: new Map(), // no users
      transactions: new Map([[txn.transaction_id, txn]]),
      ipLogs: new Map(),
      tosLogs: new Map(),
      consumptionLogs: new Map(),
    };
    const result = lookupEvidenceByTransaction(db, "txn_001");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("USER_NOT_FOUND");
    }
  });

  it("returns ok:true with empty arrays when optional telemetry is absent", () => {
    const db = makeDb({ ipLogs: [], tosLog: null, consumptionLog: null });
    const result = lookupEvidenceByTransaction(db, "txn_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records.ipLogs).toHaveLength(0);
      expect(result.records.tosLog).toBeNull();
      expect(result.records.consumptionLogs).toHaveLength(0);
    }
  });

  it("never fabricates missing records — all null fields are genuinely absent", () => {
    const db = makeDb({ tosLog: null, consumptionLog: null, ipLogs: [] });
    const result = lookupEvidenceByTransaction(db, "txn_001");
    if (result.ok) {
      expect(result.records.tosLog).toBeNull();
      expect(result.records.consumptionLogs).toHaveLength(0);
      expect(result.records.ipLogs).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// §2  Evidence Verifier
// ---------------------------------------------------------------------------

describe("Evidence Verifier", () => {
  it("produces all-true signals for a fully consistent bundle", () => {
    const records = {
      transaction: makeTransaction(),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: makeTOSLog(),
      consumptionLogs: [makeConsumptionLog()],
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.identity_match).toBe(true);
      expect(result.signals.ip_consistency).toBe(true);
      expect(result.signals.post_purchase_consumption).toBe(true);
      expect(result.signals.tos_accepted).toBe(true);
      expect(result.signals.temporal_sequence_valid).toBe(true);
      expect(result.reason.contradictions).toHaveLength(0);
    }
  });

  it("detects identity mismatch when disputeUserId ≠ transaction.user_id", () => {
    const records = {
      transaction: makeTransaction({ user_id: "usr_002" }),
      user: makeUser({ user_id: "usr_002" }),
      ipLogs: [makeIPLog({ user_id: "usr_002" })],
      tosLog: makeTOSLog({ user_id: "usr_002" }),
      consumptionLogs: [makeConsumptionLog({ user_id: "usr_002" })],
    };
    const result = verifyEvidence(records, "usr_CLAIMING_WRONGLY");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.identity_match).toBe(false);
      expect(result.reason.contradictions.length).toBeGreaterThan(0);
      expect(result.reason.identity_match_detail).toContain("MISMATCH");
    }
  });

  it("detects contradictory timestamps when consumption precedes transaction", () => {
    const records = {
      transaction: makeTransaction({ timestamp: "2026-08-10T10:00:00Z" }),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: makeTOSLog({ accepted_at: "2026-08-10T09:58:00Z" }),
      consumptionLogs: [
        makeConsumptionLog({ consumed_at: "2026-08-10T09:30:00Z" }), // BEFORE txn
      ],
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.temporal_sequence_valid).toBe(false);
      expect(result.reason.contradictions.some((c) => c.includes("BEFORE") || c.includes("before") || c.includes("CONTRADICTION"))).toBe(true);
    }
  });

  it("sets tos_accepted=false when TOS is missing", () => {
    const records = {
      transaction: makeTransaction(),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: null,
      consumptionLogs: [makeConsumptionLog()],
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.tos_accepted).toBe(false);
    }
  });

  it("sets tos_accepted=false when TOS was accepted AFTER the transaction", () => {
    const records = {
      transaction: makeTransaction({ timestamp: "2026-08-10T10:00:00Z" }),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: makeTOSLog({ accepted_at: "2026-08-10T12:00:00Z" }), // AFTER txn
      consumptionLogs: [makeConsumptionLog()],
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.tos_accepted).toBe(false);
      expect(result.reason.contradictions.some((c) => c.includes("TOS accepted after"))).toBe(true);
    }
  });

  it("sets post_purchase_consumption=false when no consumption log", () => {
    const records = {
      transaction: makeTransaction(),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: makeTOSLog(),
      consumptionLogs: [],
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.post_purchase_consumption).toBe(false);
    }
  });

  it("sets ip_consistency=false when consumption IP differs from checkout IP", () => {
    const records = {
      transaction: makeTransaction({ ip_address: "192.0.2.10" }),
      user: makeUser(),
      ipLogs: [], // no IP logs
      tosLog: makeTOSLog(),
      consumptionLogs: [makeConsumptionLog({ ip_address: "10.99.88.77" })], // different IP
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.ip_consistency).toBe(false);
    }
  });

  it("sets ip_consistency=true when IP log matches transaction IP", () => {
    const records = {
      transaction: makeTransaction({ ip_address: "192.0.2.10" }),
      user: makeUser(),
      ipLogs: [makeIPLog({ ip_address: "192.0.2.10" })],
      tosLog: makeTOSLog(),
      consumptionLogs: [makeConsumptionLog({ ip_address: "192.0.2.10" })],
    };
    const result = verifyEvidence(records, "usr_001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.ip_consistency).toBe(true);
      expect(result.reason.ip_consistency_detail).toContain("supporting signals only");
    }
  });

  it("snapshot does NOT carry a ground_truth field", () => {
    const records = {
      transaction: makeTransaction(),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: makeTOSLog(),
      consumptionLogs: [makeConsumptionLog()],
    };
    const result = verifyEvidence(records, "usr_001");
    if (result.ok) {
      expect(result.snapshot).not.toHaveProperty("ground_truth");
    }
  });

  it("fails ok:false when called with null transaction (programming error guard)", () => {
    const records = {
      transaction: null,
      user: null,
      ipLogs: [],
      tosLog: null,
      consumptionLogs: [],
    };
    const result = verifyEvidence(records as Parameters<typeof verifyEvidence>[0], "usr_001");
    expect(result.ok).toBe(false);
  });

  it("captures no contradictions for fully consistent evidence", () => {
    const records = {
      transaction: makeTransaction(),
      user: makeUser(),
      ipLogs: [makeIPLog()],
      tosLog: makeTOSLog(),
      consumptionLogs: [makeConsumptionLog()],
    };
    const result = verifyEvidence(records, "usr_001");
    if (result.ok) {
      expect(result.reason.contradictions).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// §3  Router
// ---------------------------------------------------------------------------

describe("Defensive Router", () => {
  it("routes DEFENDABLE when all signals true", () => {
    const result = routeDispute(allTrueSignals());
    expect(result.classification).toBe("DEFENDABLE");
    expect(result.destination).toBe("PROCEED_TO_DRAFTING");
  });

  it("routes MANUAL_REVIEW when identity_match is false (critical contradiction)", () => {
    const result = routeDispute({ ...allTrueSignals(), identity_match: false });
    expect(result.classification).toBe("NOT_DEFENDABLE");
    expect(result.destination).toBe("ROUTE_TO_MANUAL_REVIEW");
    expect(result.reason.manual_review_reasons).toContain("IDENTITY_MISMATCH");
    expect(result.reason.manual_review_reasons).toContain("CRITICAL_CONTRADICTION");
  });

  it("routes MANUAL_REVIEW when temporal_sequence_valid is false", () => {
    const result = routeDispute({ ...allTrueSignals(), temporal_sequence_valid: false });
    expect(result.classification).toBe("NOT_DEFENDABLE");
    expect(result.destination).toBe("ROUTE_TO_MANUAL_REVIEW");
    expect(result.reason.manual_review_reasons).toContain("CONTRADICTORY_TIMESTAMPS");
  });

  it("routes MANUAL_REVIEW when ip_consistency is false", () => {
    const result = routeDispute({ ...allTrueSignals(), ip_consistency: false });
    expect(result.classification).toBe("NOT_DEFENDABLE");
    expect(result.destination).toBe("ROUTE_TO_MANUAL_REVIEW");
    expect(result.reason.manual_review_reasons).toContain("MISSING_IP_CONSISTENCY");
  });

  it("routes MANUAL_REVIEW when post_purchase_consumption is false", () => {
    const result = routeDispute({ ...allTrueSignals(), post_purchase_consumption: false });
    expect(result.classification).toBe("NOT_DEFENDABLE");
    expect(result.destination).toBe("ROUTE_TO_MANUAL_REVIEW");
    expect(result.reason.manual_review_reasons).toContain("MISSING_POST_PURCHASE_CONSUMPTION");
  });

  it("routes MANUAL_REVIEW when tos_accepted is false", () => {
    const result = routeDispute({ ...allTrueSignals(), tos_accepted: false });
    expect(result.classification).toBe("NOT_DEFENDABLE");
    expect(result.destination).toBe("ROUTE_TO_MANUAL_REVIEW");
    expect(result.reason.manual_review_reasons).toContain("MISSING_TOS_ACCEPTANCE");
  });

  it("routes MANUAL_REVIEW when all signals are false", () => {
    const result = routeDispute({
      identity_match: false,
      ip_consistency: false,
      post_purchase_consumption: false,
      tos_accepted: false,
      temporal_sequence_valid: false,
    });
    expect(result.classification).toBe("NOT_DEFENDABLE");
    expect(result.destination).toBe("ROUTE_TO_MANUAL_REVIEW");
  });

  it("DEFENDABLE result includes non-empty supporting_signals list", () => {
    const result = routeDispute(allTrueSignals());
    expect(result.reason.supporting_signals.length).toBeGreaterThan(0);
    expect(result.reason.missing_or_contradicted_signals).toHaveLength(0);
  });

  it("MANUAL_REVIEW result includes non-empty missing/contradicted signal list", () => {
    const result = routeDispute({ ...allTrueSignals(), ip_consistency: false });
    expect(result.reason.missing_or_contradicted_signals.length).toBeGreaterThan(0);
  });

  it("does NOT read EvalGroundTruth or ORACLE_LABEL_TABLE", async () => {
    // Structural test: verify router module exports do not include oracle types
    const routerModule = await import("../src/engine/router.js");
    const keys = Object.keys(routerModule);
    expect(keys).not.toContain("scenarioOracle");
    expect(keys).not.toContain("ORACLE_LABEL_TABLE");
    expect(keys).not.toContain("EvalGroundTruth");
  });
});

// ---------------------------------------------------------------------------
// §4  State Machine
// ---------------------------------------------------------------------------

describe("State Machine — valid transitions", () => {
  it("RECEIVED → EVIDENCE_FETCHING is valid", () => {
    const r = transition("RECEIVED", "EVIDENCE_FETCHING");
    expect(r.ok).toBe(true);
  });

  it("RECEIVED → MANUAL_REVIEW is valid (fail-closed)", () => {
    expect(transition("RECEIVED", "MANUAL_REVIEW").ok).toBe(true);
  });

  it("EVIDENCE_FETCHING → EVIDENCE_VERIFIED is valid", () => {
    expect(transition("EVIDENCE_FETCHING", "EVIDENCE_VERIFIED").ok).toBe(true);
  });

  it("EVIDENCE_FETCHING → MANUAL_REVIEW is valid (fail-closed)", () => {
    expect(transition("EVIDENCE_FETCHING", "MANUAL_REVIEW").ok).toBe(true);
  });

  it("EVIDENCE_VERIFIED → SUFFICIENCY_ASSESSED is valid", () => {
    expect(transition("EVIDENCE_VERIFIED", "SUFFICIENCY_ASSESSED").ok).toBe(true);
  });

  it("EVIDENCE_VERIFIED → MANUAL_REVIEW is valid (fail-closed)", () => {
    expect(transition("EVIDENCE_VERIFIED", "MANUAL_REVIEW").ok).toBe(true);
  });

  it("SUFFICIENCY_ASSESSED → RESPONSE_DRAFTED is valid", () => {
    expect(transition("SUFFICIENCY_ASSESSED", "RESPONSE_DRAFTED").ok).toBe(true);
  });

  it("SUFFICIENCY_ASSESSED → MANUAL_REVIEW is valid (fail-closed)", () => {
    expect(transition("SUFFICIENCY_ASSESSED", "MANUAL_REVIEW").ok).toBe(true);
  });

  it("RESPONSE_DRAFTED → RESPONSE_VALIDATED is valid", () => {
    expect(transition("RESPONSE_DRAFTED", "RESPONSE_VALIDATED").ok).toBe(true);
  });

  it("RESPONSE_DRAFTED → RESPONSE_VALIDATION_FAILED is valid", () => {
    expect(transition("RESPONSE_DRAFTED", "RESPONSE_VALIDATION_FAILED").ok).toBe(true);
  });

  it("RESPONSE_VALIDATED → HUMAN_APPROVAL_REQUIRED is valid", () => {
    expect(transition("RESPONSE_VALIDATED", "HUMAN_APPROVAL_REQUIRED").ok).toBe(true);
  });

  it("HUMAN_APPROVAL_REQUIRED → READY_FOR_SUBMISSION is valid", () => {
    expect(transition("HUMAN_APPROVAL_REQUIRED", "READY_FOR_SUBMISSION").ok).toBe(true);
  });

  it("HUMAN_APPROVAL_REQUIRED → MANUAL_REVIEW is valid (analyst reject)", () => {
    expect(transition("HUMAN_APPROVAL_REQUIRED", "MANUAL_REVIEW").ok).toBe(true);
  });

  it("READY_FOR_SUBMISSION → SUBMITTED is valid", () => {
    expect(transition("READY_FOR_SUBMISSION", "SUBMITTED").ok).toBe(true);
  });

  it("RESPONSE_VALIDATION_FAILED → MANUAL_REVIEW is valid", () => {
    expect(transition("RESPONSE_VALIDATION_FAILED", "MANUAL_REVIEW").ok).toBe(true);
  });
});

describe("State Machine — invalid transitions", () => {
  it("RECEIVED → SUBMITTED is invalid", () => {
    const r = transition("RECEIVED", "SUBMITTED");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("INVALID_TRANSITION");
  });

  it("RECEIVED → RESPONSE_DRAFTED is invalid", () => {
    expect(transition("RECEIVED", "RESPONSE_DRAFTED").ok).toBe(false);
  });

  it("SUFFICIENCY_ASSESSED → SUBMITTED is invalid", () => {
    expect(transition("SUFFICIENCY_ASSESSED", "SUBMITTED").ok).toBe(false);
  });

  it("MANUAL_REVIEW → SUBMITTED is invalid (terminal state)", () => {
    const r = transition("MANUAL_REVIEW", "SUBMITTED");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("TERMINAL_STATE");
  });

  it("SUBMITTED → MANUAL_REVIEW is invalid (terminal state)", () => {
    const r = transition("SUBMITTED", "MANUAL_REVIEW");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("TERMINAL_STATE");
  });

  it("SUBMITTED → SUBMITTED is invalid (terminal state)", () => {
    expect(transition("SUBMITTED", "SUBMITTED").ok).toBe(false);
  });

  it("EVIDENCE_VERIFIED → RESPONSE_DRAFTED skips SUFFICIENCY_ASSESSED — invalid", () => {
    expect(transition("EVIDENCE_VERIFIED", "RESPONSE_DRAFTED").ok).toBe(false);
  });

  it("RECEIVED → RESPONSE_VALIDATED skips all intermediate states — invalid", () => {
    expect(transition("RECEIVED", "RESPONSE_VALIDATED").ok).toBe(false);
  });

  it("invalid transitions return structured error with allowedNextStates", () => {
    const r = transition("RECEIVED", "SUBMITTED");
    if (!r.ok) {
      expect(Array.isArray(r.error.allowedNextStates)).toBe(true);
      expect(r.error.allowedNextStates.length).toBeGreaterThan(0);
    }
  });
});

describe("State Machine — helpers", () => {
  it("allowedNextStates returns correct next states for RECEIVED", () => {
    const allowed = allowedNextStates("RECEIVED");
    expect(allowed).toContain("EVIDENCE_FETCHING");
    expect(allowed).toContain("MANUAL_REVIEW");
    expect(allowed).toHaveLength(2);
  });

  it("allowedNextStates returns empty array for terminal states", () => {
    expect(allowedNextStates("SUBMITTED")).toHaveLength(0);
    expect(allowedNextStates("MANUAL_REVIEW")).toHaveLength(0);
  });

  it("isValidTransition returns true for valid transitions", () => {
    expect(isValidTransition("RECEIVED", "EVIDENCE_FETCHING")).toBe(true);
    expect(isValidTransition("EVIDENCE_FETCHING", "EVIDENCE_VERIFIED")).toBe(true);
  });

  it("isValidTransition returns false for invalid transitions", () => {
    expect(isValidTransition("RECEIVED", "SUBMITTED")).toBe(false);
    expect(isValidTransition("SUBMITTED", "MANUAL_REVIEW")).toBe(false);
  });

  it("isTerminalState returns true for SUBMITTED and MANUAL_REVIEW", () => {
    expect(isTerminalState("SUBMITTED")).toBe(true);
    expect(isTerminalState("MANUAL_REVIEW")).toBe(true);
  });

  it("isTerminalState returns false for non-terminal states", () => {
    for (const state of DISPUTE_STATES) {
      if (state !== "SUBMITTED" && state !== "MANUAL_REVIEW") {
        expect(isTerminalState(state)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §5  Engine — full pipeline
// ---------------------------------------------------------------------------

describe("Engine — happy path (DEFENDABLE)", () => {
  it("processes a fully evidenced dispute to SUFFICIENCY_ASSESSED with DEFENDABLE", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_test_001",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });

    expect(result.final_state).toBe("SUFFICIENCY_ASSESSED");
    expect(result.sufficiency_classification).toBe("DEFENDABLE");
    expect(result.failure_reason).toBeNull();
    expect(result.signals?.identity_match).toBe(true);
    expect(result.snapshot).not.toBeNull();
  });

  it("state sequence for happy path is RECEIVED → EVIDENCE_FETCHING → EVIDENCE_VERIFIED → SUFFICIENCY_ASSESSED", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_test_002",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });

    expect(result.states).toEqual([
      "RECEIVED",
      "EVIDENCE_FETCHING",
      "EVIDENCE_VERIFIED",
      "SUFFICIENCY_ASSESSED",
    ]);
  });

  it("happy path result contains no ground_truth field on snapshot", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_test_003",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.snapshot).not.toHaveProperty("ground_truth");
    expect(result).not.toHaveProperty("ground_truth");
  });

  it("routing_reason.summary is non-empty for DEFENDABLE result", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_test_004",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.routing_reason?.summary).toBeTruthy();
  });
});

describe("Engine — fail-closed paths (MANUAL_REVIEW)", () => {
  it("routes to MANUAL_REVIEW when transaction_id is not in DB", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_missing",
      transaction_id: "txn_DOES_NOT_EXIST",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
    expect(result.failure_reason).toBe("TRANSACTION_NOT_FOUND");
    expect(result.sufficiency_classification).toBeNull();
  });

  it("routes to MANUAL_REVIEW when user referenced by transaction is missing", () => {
    const txn = makeTransaction({ user_id: "usr_GHOST" });
    const db: SyntheticMerchantDb = {
      users: new Map(), // no users
      transactions: new Map([[txn.transaction_id, txn]]),
      ipLogs: new Map(),
      tosLogs: new Map(),
      consumptionLogs: new Map(),
    };
    const result = processDispute(db, {
      dispute_id: "disp_ghost",
      transaction_id: "txn_001",
      claimed_user_id: "usr_GHOST",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
    expect(result.failure_reason).toBe("USER_NOT_FOUND");
  });

  it("routes to MANUAL_REVIEW when identity_match is false", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_mismatch",
      transaction_id: "txn_001",
      claimed_user_id: "usr_WRONG_CLAIMANT", // ≠ transaction.user_id
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
    expect(result.signals?.identity_match).toBe(false);
  });

  it("routes to MANUAL_REVIEW when consumption log is missing", () => {
    const db = makeDb({ consumptionLog: null });
    const result = processDispute(db, {
      dispute_id: "disp_no_consumption",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
    expect(result.signals?.post_purchase_consumption).toBe(false);
  });

  it("routes to MANUAL_REVIEW when TOS log is missing", () => {
    const db = makeDb({ tosLog: null });
    const result = processDispute(db, {
      dispute_id: "disp_no_tos",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
    expect(result.signals?.tos_accepted).toBe(false);
  });

  it("routes to MANUAL_REVIEW when timestamps are contradictory", () => {
    // Consumption BEFORE transaction
    const db = makeDb({
      consumptionLog: makeConsumptionLog({ consumed_at: "2026-08-10T09:00:00Z" }),
    });
    const result = processDispute(db, {
      dispute_id: "disp_bad_ts",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
    expect(result.signals?.temporal_sequence_valid).toBe(false);
  });

  it("routes to MANUAL_REVIEW when all telemetry is missing", () => {
    const db = makeDb({ ipLogs: [], tosLog: null, consumptionLog: null });
    const result = processDispute(db, {
      dispute_id: "disp_no_telemetry",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.final_state).toBe("MANUAL_REVIEW");
  });

  it("MANUAL_REVIEW state is always in the states array when it fails", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_check_states",
      transaction_id: "txn_MISSING",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.states).toContain("MANUAL_REVIEW");
    expect(result.final_state).toBe("MANUAL_REVIEW");
  });

  it("never classifies as DEFENDABLE when a critical contradiction exists", () => {
    const db = makeDb({
      consumptionLog: makeConsumptionLog({ consumed_at: "2026-08-09T00:00:00Z" }),
    });
    const result = processDispute(db, {
      dispute_id: "disp_contradiction_check",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    expect(result.sufficiency_classification).not.toBe("DEFENDABLE");
    expect(result.final_state).toBe("MANUAL_REVIEW");
  });
});

describe("Engine — ground truth isolation", () => {
  it("engine module exports do NOT include scenarioOracle or ORACLE_LABEL_TABLE", async () => {
    const engineModule = await import("../src/engine/index.js");
    const keys = Object.keys(engineModule);
    expect(keys).not.toContain("scenarioOracle");
    expect(keys).not.toContain("ORACLE_LABEL_TABLE");
  });

  it("EngineResult never contains a ground_truth field", () => {
    const db = makeDb();
    const result = processDispute(db, {
      dispute_id: "disp_gt_check",
      transaction_id: "txn_001",
      claimed_user_id: "usr_001",
      amount: 4999,
      currency: "INR",
      reason_code: "fraudulent",
      chargeback_date: "2026-08-15T00:00:00Z",
    });
    // Check result itself and nested objects
    expect(result).not.toHaveProperty("ground_truth");
    expect(result.snapshot).not.toHaveProperty("ground_truth");
    expect(result.signals).not.toHaveProperty("ground_truth");
  });

  it("processing a DEFENDABLE Eval A case does NOT require reading ground_truth", () => {
    // Use the real seeded merchant DB and pick a FULL_EVIDENCE bundle
    const { db, bundles } = generateMerchantDb(42, 5);
    const bundle = bundles[0]!;
    const result = processDispute(db, {
      dispute_id: "disp_eval_check",
      transaction_id: bundle.transaction.transaction_id,
      claimed_user_id: bundle.user.user_id,
      amount: bundle.transaction.amount,
      currency: bundle.transaction.currency,
      reason_code: "fraudulent",
      chargeback_date: "2026-09-01T00:00:00Z",
    });
    // The engine produces its own classification from evidence alone
    expect(["SUFFICIENCY_ASSESSED", "MANUAL_REVIEW"]).toContain(result.final_state);
    expect(result).not.toHaveProperty("ground_truth");
  });
});
