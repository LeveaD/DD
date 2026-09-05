/**
 * Milestone 1 — Schema Contract Tests (TypeScript / Vitest)
 *
 * Verifies that every data structure defined in src/schemas/index.ts:
 *   - carries the correct fields at the type level
 *   - satisfies the documented data-model semantics
 *   - preserves runtime vs. evaluation terminology boundaries
 *   - encodes the two-part evidence sufficiency model (ADR-012)
 *   - enforces major-currency-unit amount conventions
 *
 * These tests verify DATA CONTRACTS and SUFFICIENCY LOGIC only.
 * No business logic (routing, LLM, PDF, DB) is invoked.
 */

import { describe, it, expect } from "vitest";
import {
  // State machine
  DISPUTE_STATES,
  SUFFICIENCY_CLASSIFICATIONS,
  // Merchant DB entities
  // (used via object literals — TypeScript structural typing)
  // Evidence
  EvidenceSignals,
  hasCriticalContradiction,
  hasSufficientPositiveSignals,
  isSufficient,
  // Core case
  DisputeCase,
  DisputeState,
  // Audit log
  AuditLogEntry,
  // Evaluation
  EVAL_GROUND_TRUTH_VALUES,
  EVAL_SPLIT_VALUES,
  EVAL_B_SAMPLE_TYPES,
  EvalACase,
  EvalBCase,
  EvalBSampleType,
  EvalGroundTruth,
  // Snapshot
  VerifiedEvidenceSnapshot,
  User,
  Transaction,
  IPLog,
  TOSLog,
  ConsumptionLog,
  LLMDraftResult,
  ValidationResult,
} from "../src/schemas/index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function minimalUser(): User {
  return {
    user_id: "usr_001",
    name: "Jane Doe",
    email: "jane@example.com",
    created_at: "2026-08-01T08:00:00Z",
  };
}

function minimalTransaction(amount = 4999, currency = "INR"): Transaction {
  return {
    transaction_id: "txn_001",
    user_id: "usr_001",
    amount,
    currency,
    timestamp: "2026-08-01T10:00:00Z",
    ip_address: "192.168.1.50",
    payment_method: "card",
    card_last4: "4242",
  };
}

function minimalIPLog(): IPLog {
  return {
    log_id: "log_001",
    user_id: "usr_001",
    ip_address: "192.168.1.50",
    timestamp: "2026-08-01T09:55:00Z",
    device_info: "Chrome Windows 10",
  };
}

function minimalTOSLog(): TOSLog {
  return {
    tos_id: "tos_001",
    user_id: "usr_001",
    tos_version: "v2.1",
    accepted_at: "2026-08-01T09:58:00Z",
    ip_address: "192.168.1.50",
  };
}

function minimalConsumptionLog(): ConsumptionLog {
  return {
    consumption_id: "cons_001",
    user_id: "usr_001",
    transaction_id: "txn_001",
    resource_id: "digital_course_pdf",
    consumed_at: "2026-08-01T10:15:00Z",
    ip_address: "192.168.1.50",
    bytes_downloaded: 10_485_760,
  };
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

function minimalSnapshot(found = true): VerifiedEvidenceSnapshot {
  return {
    user: minimalUser(),
    transaction: minimalTransaction(),
    ip_logs: [minimalIPLog()],
    tos_log: minimalTOSLog(),
    consumption_log: minimalConsumptionLog(),
    found,
  };
}

function minimalDisputeCase(state: DisputeState = "RECEIVED"): DisputeCase {
  return {
    dispute_id: "disp_001",
    transaction_id: "txn_001",
    amount: 4999,
    currency: "INR",
    reason_code: "fraudulent",
    chargeback_date: "2026-09-01T00:00:00Z",
    current_state: state,
    created_at: "2026-09-01T12:00:00Z",
  };
}

function minimalAuditEntry(): AuditLogEntry {
  return {
    log_id: "log_abc123",
    dispute_id: "disp_001",
    timestamp: "2026-09-01T12:00:00Z",
    event_type: "WEBHOOK_RECEIVED",
    previous_state: "NONE",
    next_state: "RECEIVED",
  };
}

function minimalEvalACase(): EvalACase {
  return {
    case_id: "eval_a_001",
    seed: 42,
    split: "HOLDOUT",
    synthetic_evidence: { transaction_id: "txn_001" },
    ground_truth: "DEFENDABLE",
  };
}

function minimalEvalBCase(sample_type: EvalBSampleType = "CLEAN"): EvalBCase {
  return {
    test_id: "eval_b_001",
    sample_type,
    verified_evidence_snapshot: { transaction_id: "txn_001" },
    input_narrative: "User Jane Doe completed transaction txn_001 for INR 4999.",
    expected_validator_outcome: sample_type === "CLEAN",
  };
}

// ---------------------------------------------------------------------------
// §1  DisputeState — state machine catalog
// ---------------------------------------------------------------------------

describe("DisputeState", () => {
  it("contains exactly eleven documented states", () => {
    expect(DISPUTE_STATES).toHaveLength(11);
  });

  it("contains all eleven documented state names", () => {
    const expected = new Set([
      "RECEIVED",
      "EVIDENCE_FETCHING",
      "EVIDENCE_VERIFIED",
      "SUFFICIENCY_ASSESSED",
      "RESPONSE_DRAFTED",
      "RESPONSE_VALIDATED",
      "HUMAN_APPROVAL_REQUIRED",
      "READY_FOR_SUBMISSION",
      "SUBMITTED",
      "MANUAL_REVIEW",
      "RESPONSE_VALIDATION_FAILED",
    ]);
    const actual = new Set(DISPUTE_STATES);
    expect(actual).toEqual(expected);
  });

  it("accepts all documented states as DisputeCase.current_state", () => {
    for (const state of DISPUTE_STATES) {
      const c = minimalDisputeCase(state);
      expect(c.current_state).toBe(state);
    }
  });

  it("all states are strings", () => {
    for (const s of DISPUTE_STATES) {
      expect(typeof s).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// §2  SufficiencyClassification
// ---------------------------------------------------------------------------

describe("SufficiencyClassification", () => {
  it("contains exactly two classifications", () => {
    expect(SUFFICIENCY_CLASSIFICATIONS).toHaveLength(2);
  });

  it("contains DEFENDABLE and NOT_DEFENDABLE", () => {
    expect(SUFFICIENCY_CLASSIFICATIONS).toContain("DEFENDABLE");
    expect(SUFFICIENCY_CLASSIFICATIONS).toContain("NOT_DEFENDABLE");
  });
});

// ---------------------------------------------------------------------------
// §3  Transaction — amount & currency
// ---------------------------------------------------------------------------

describe("Transaction amount semantics", () => {
  it("stores amount in major currency units", () => {
    const txn = minimalTransaction(4999, "INR");
    expect(txn.amount).toBe(4999);
    expect(txn.currency).toBe("INR");
  });

  it("allows zero amount (e.g. trial purchase)", () => {
    const txn = minimalTransaction(0);
    expect(txn.amount).toBe(0);
  });

  it("amount field is a number", () => {
    expect(typeof minimalTransaction().amount).toBe("number");
  });

  it("currency field is a string", () => {
    expect(typeof minimalTransaction().currency).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// §4  ConsumptionLog — bytes_downloaded default
// ---------------------------------------------------------------------------

describe("ConsumptionLog", () => {
  it("bytes_downloaded is 0 when stream starts without completion", () => {
    const log: ConsumptionLog = {
      consumption_id: "cons_002",
      user_id: "usr_001",
      transaction_id: "txn_001",
      resource_id: "stream_start",
      consumed_at: "2026-08-01T10:20:00Z",
      ip_address: "192.168.1.50",
      bytes_downloaded: 0,
    };
    expect(log.bytes_downloaded).toBe(0);
  });

  it("bytes_downloaded can be non-zero", () => {
    const log = minimalConsumptionLog();
    expect(log.bytes_downloaded).toBe(10_485_760);
  });
});

// ---------------------------------------------------------------------------
// §5  EvidenceSignals — hasCriticalContradiction
// ---------------------------------------------------------------------------

describe("hasCriticalContradiction", () => {
  it("returns false when identity matches and timestamps are valid", () => {
    expect(hasCriticalContradiction(allTrueSignals())).toBe(false);
  });

  it("returns true when identity_match is false", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      identity_match: false,
    };
    expect(hasCriticalContradiction(s)).toBe(true);
  });

  it("returns true when temporal_sequence_valid is false", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      temporal_sequence_valid: false,
    };
    expect(hasCriticalContradiction(s)).toBe(true);
  });

  it("returns true when both identity and temporal are false", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      identity_match: false,
      temporal_sequence_valid: false,
    };
    expect(hasCriticalContradiction(s)).toBe(true);
  });

  it("returns false when ip_consistency is false (absent ≠ contradicted)", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      ip_consistency: false,
    };
    expect(hasCriticalContradiction(s)).toBe(false);
  });

  it("returns false when post_purchase_consumption is false (absent ≠ contradicted)", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      post_purchase_consumption: false,
    };
    expect(hasCriticalContradiction(s)).toBe(false);
  });

  it("returns false when tos_accepted is false (absent ≠ contradicted)", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      tos_accepted: false,
    };
    expect(hasCriticalContradiction(s)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6  EvidenceSignals — hasSufficientPositiveSignals
// ---------------------------------------------------------------------------

describe("hasSufficientPositiveSignals", () => {
  it("returns true when all three positive signals are present", () => {
    expect(hasSufficientPositiveSignals(allTrueSignals())).toBe(true);
  });

  it("returns false when ip_consistency is false", () => {
    const s: EvidenceSignals = { ...allTrueSignals(), ip_consistency: false };
    expect(hasSufficientPositiveSignals(s)).toBe(false);
  });

  it("returns false when post_purchase_consumption is false", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      post_purchase_consumption: false,
    };
    expect(hasSufficientPositiveSignals(s)).toBe(false);
  });

  it("returns false when tos_accepted is false", () => {
    const s: EvidenceSignals = { ...allTrueSignals(), tos_accepted: false };
    expect(hasSufficientPositiveSignals(s)).toBe(false);
  });

  it("returns true even when identity_match is false (not its concern)", () => {
    // identity_match is evaluated by hasCriticalContradiction, not here
    const s: EvidenceSignals = { ...allTrueSignals(), identity_match: false };
    expect(hasSufficientPositiveSignals(s)).toBe(true);
  });

  it("returns true even when temporal_sequence_valid is false (not its concern)", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      temporal_sequence_valid: false,
    };
    expect(hasSufficientPositiveSignals(s)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §7  EvidenceSignals — isSufficient (two-part model, ADR-012)
// ---------------------------------------------------------------------------

describe("isSufficient", () => {
  it("returns true when all signals are true (full evidence — Branch A)", () => {
    expect(isSufficient(allTrueSignals())).toBe(true);
  });

  it("returns false when identity_match is false (critical contradiction)", () => {
    const s: EvidenceSignals = { ...allTrueSignals(), identity_match: false };
    expect(isSufficient(s)).toBe(false);
  });

  it("returns false when temporal_sequence_valid is false (critical contradiction)", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      temporal_sequence_valid: false,
    };
    expect(isSufficient(s)).toBe(false);
  });

  it("returns false when ip_consistency is false (insufficient positive signals)", () => {
    const s: EvidenceSignals = { ...allTrueSignals(), ip_consistency: false };
    expect(isSufficient(s)).toBe(false);
  });

  it("returns false when post_purchase_consumption is false (insufficient positive signals)", () => {
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      post_purchase_consumption: false,
    };
    expect(isSufficient(s)).toBe(false);
  });

  it("returns false when tos_accepted is false (insufficient positive signals)", () => {
    const s: EvidenceSignals = { ...allTrueSignals(), tos_accepted: false };
    expect(isSufficient(s)).toBe(false);
  });

  it("returns false when all signals are false", () => {
    const s: EvidenceSignals = {
      identity_match: false,
      ip_consistency: false,
      post_purchase_consumption: false,
      tos_accepted: false,
      temporal_sequence_valid: false,
    };
    expect(isSufficient(s)).toBe(false);
  });

  it("absent positive signal is a routing concern, not a contradiction", () => {
    // ip_consistency=false: not a contradiction (hasCriticalContradiction=false),
    // but fails isSufficient because positive signals are incomplete.
    const s: EvidenceSignals = { ...allTrueSignals(), ip_consistency: false };
    expect(hasCriticalContradiction(s)).toBe(false);
    expect(isSufficient(s)).toBe(false);
  });

  it("impossible timestamp is a contradiction, not just an absent signal", () => {
    // temporal_sequence_valid=false: is a contradiction (hasCriticalContradiction=true).
    const s: EvidenceSignals = {
      ...allTrueSignals(),
      temporal_sequence_valid: false,
    };
    expect(hasCriticalContradiction(s)).toBe(true);
    expect(isSufficient(s)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §8  VerifiedEvidenceSnapshot — runtime vs. evaluation terminology
// ---------------------------------------------------------------------------

describe("VerifiedEvidenceSnapshot", () => {
  it("found=true snapshot carries all telemetry", () => {
    const snap = minimalSnapshot(true);
    expect(snap.found).toBe(true);
    expect(snap.user).not.toBeNull();
    expect(snap.transaction).not.toBeNull();
    expect(snap.tos_log).not.toBeNull();
    expect(snap.consumption_log).not.toBeNull();
    expect(snap.ip_logs).toHaveLength(1);
  });

  it("found=false snapshot carries null telemetry", () => {
    const snap: VerifiedEvidenceSnapshot = {
      user: null,
      transaction: null,
      ip_logs: [],
      tos_log: null,
      consumption_log: null,
      found: false,
    };
    expect(snap.found).toBe(false);
    expect(snap.user).toBeNull();
    expect(snap.transaction).toBeNull();
  });

  it("does NOT carry a ground_truth field — ground_truth is for EvalACase only", () => {
    const snap = minimalSnapshot();
    expect(snap).not.toHaveProperty("ground_truth");
  });

  it("ip_logs is an array", () => {
    expect(Array.isArray(minimalSnapshot().ip_logs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §9  ValidationResult
// ---------------------------------------------------------------------------

describe("ValidationResult", () => {
  it("passing result has passed=true and empty unsupported_claims", () => {
    const vr: ValidationResult = { passed: true, unsupported_claims: [] };
    expect(vr.passed).toBe(true);
    expect(vr.unsupported_claims).toHaveLength(0);
  });

  it("failing result captures unsupported claims and reason", () => {
    const vr: ValidationResult = {
      passed: false,
      unsupported_claims: [
        "Hallucinated IP: 10.99.88.77",
        "Date not in snapshot: 2029-12-01",
      ],
      reason: "UNSUPPORTED_ENTITY_DETECTED",
    };
    expect(vr.passed).toBe(false);
    expect(vr.unsupported_claims).toHaveLength(2);
    expect(vr.reason).toBe("UNSUPPORTED_ENTITY_DETECTED");
  });

  it("validator crash result is representable", () => {
    const vr: ValidationResult = {
      passed: false,
      unsupported_claims: ["Validator execution crash: timeout"],
      reason: "VALIDATOR_CRASH",
    };
    expect(vr.reason).toBe("VALIDATOR_CRASH");
  });

  it("rejected draft is representable (retained in audit log)", () => {
    const draft: LLMDraftResult = {
      text: "The customer intentionally committed fraud.",
      model_version: "gemini-1.5-flash",
      temperature: 0.1,
    };
    const vr: ValidationResult = {
      passed: false,
      unsupported_claims: ["Unsupported intent claim: 'intentionally committed fraud'"],
      reason: "UNSUPPORTED_ENTITY_DETECTED",
    };
    expect(draft.text).toBeTruthy();
    expect(vr.passed).toBe(false);
    expect(vr.unsupported_claims.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §10  DisputeCase
// ---------------------------------------------------------------------------

describe("DisputeCase", () => {
  it("minimal case has required fields", () => {
    const c = minimalDisputeCase();
    expect(c.dispute_id).toBe("disp_001");
    expect(c.current_state).toBe("RECEIVED");
    expect(c.amount).toBe(4999);
    expect(c.currency).toBe("INR");
  });

  it("optional fields are absent on a minimal case", () => {
    const c = minimalDisputeCase();
    expect(c).not.toHaveProperty("evidence_signals");
    expect(c).not.toHaveProperty("sufficiency_classification");
    expect(c).not.toHaveProperty("verified_evidence_snapshot");
    expect(c).not.toHaveProperty("llm_draft");
    expect(c).not.toHaveProperty("validation_result");
  });

  it("accepts every documented state", () => {
    for (const state of DISPUTE_STATES) {
      const c = minimalDisputeCase(state);
      expect(c.current_state).toBe(state);
    }
  });

  it("amount is in major currency units (4999 INR = ₹4,999)", () => {
    const c = minimalDisputeCase();
    expect(c.amount).toBe(4999);
    expect(c.currency).toBe("INR");
  });

  it("does NOT carry a ground_truth field", () => {
    const c = minimalDisputeCase();
    expect(c).not.toHaveProperty("ground_truth");
  });

  it("case with all optional fields populated is valid", () => {
    const c: DisputeCase = {
      ...minimalDisputeCase("HUMAN_APPROVAL_REQUIRED"),
      evidence_signals: allTrueSignals(),
      sufficiency_classification: "DEFENDABLE",
      verified_evidence_snapshot: minimalSnapshot(),
      llm_draft: {
        text: "Narrative text based on verified data.",
        model_version: "gemini-1.5-flash",
        temperature: 0.1,
      },
      validation_result: { passed: true, unsupported_claims: [] },
    };
    expect(c.sufficiency_classification).toBe("DEFENDABLE");
    expect(c.validation_result?.passed).toBe(true);
    expect(c.verified_evidence_snapshot).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// §11  AuditLogEntry
// ---------------------------------------------------------------------------

describe("AuditLogEntry", () => {
  it("minimal entry has required fields", () => {
    const e = minimalAuditEntry();
    expect(e.log_id).toBe("log_abc123");
    expect(e.event_type).toBe("WEBHOOK_RECEIVED");
    expect(e.previous_state).toBe("NONE");
    expect(e.next_state).toBe("RECEIVED");
  });

  it("optional fields absent on minimal entry", () => {
    const e = minimalAuditEntry();
    expect(e).not.toHaveProperty("llm_output");
    expect(e).not.toHaveProperty("failure_reason");
  });

  it("retains rejected LLM output for traceability", () => {
    const e: AuditLogEntry = {
      log_id: "log_rej01",
      dispute_id: "disp_001",
      timestamp: "2026-09-01T12:05:00Z",
      event_type: "POST_GEN_VALIDATION_FAILED",
      previous_state: "RESPONSE_DRAFTED",
      next_state: "RESPONSE_VALIDATION_FAILED",
      llm_output: "The customer intentionally committed fraud.",
      validation_result: { passed: false, reason: "UNSUPPORTED_ENTITY_DETECTED" },
      failure_reason: "HARD_VALIDATOR_REJECTION",
    };
    expect(e.llm_output).toBeTruthy();
    expect(e.validation_result?.passed).toBe(false);
  });

  it("uses verified_evidence_snapshot field name (not deterministic_snapshot)", () => {
    const e: AuditLogEntry = {
      ...minimalAuditEntry(),
      verified_evidence_snapshot: { user_id: "usr_001" },
    };
    expect(e).toHaveProperty("verified_evidence_snapshot");
    expect(e).not.toHaveProperty("deterministic_snapshot");
  });

  it("does NOT carry a ground_truth field", () => {
    const e = minimalAuditEntry();
    expect(e).not.toHaveProperty("ground_truth");
  });

  it("human_action field is representable", () => {
    const e: AuditLogEntry = {
      ...minimalAuditEntry(),
      human_action: {
        analyst_id: "analyst_01",
        action: "APPROVE",
        timestamp: "2026-09-01T13:00:00Z",
      },
    };
    expect(e.human_action?.action).toBe("APPROVE");
  });
});

// ---------------------------------------------------------------------------
// §12  Evaluation A — non-circular oracle semantics
// ---------------------------------------------------------------------------

describe("EvalACase", () => {
  it("valid minimal case has required fields", () => {
    const c = minimalEvalACase();
    expect(c.case_id).toBe("eval_a_001");
    expect(c.seed).toBe(42);
    expect(c.split).toBe("HOLDOUT");
    expect(c.ground_truth).toBe("DEFENDABLE");
  });

  it("ground_truth type values are DEFENDABLE and NOT_DEFENDABLE only", () => {
    expect(EVAL_GROUND_TRUTH_VALUES).toContain("DEFENDABLE");
    expect(EVAL_GROUND_TRUTH_VALUES).toContain("NOT_DEFENDABLE");
    expect(EVAL_GROUND_TRUTH_VALUES).toHaveLength(2);
  });

  it("split values are DEV and HOLDOUT only", () => {
    expect(EVAL_SPLIT_VALUES).toContain("DEV");
    expect(EVAL_SPLIT_VALUES).toContain("HOLDOUT");
    expect(EVAL_SPLIT_VALUES).toHaveLength(2);
  });

  it("NOT_DEFENDABLE ground truth case is representable", () => {
    const c: EvalACase = {
      case_id: "eval_a_002",
      seed: 42,
      split: "DEV",
      synthetic_evidence: { transaction_id: "txn_002" },
      ground_truth: "NOT_DEFENDABLE",
    };
    expect(c.ground_truth).toBe("NOT_DEFENDABLE");
    expect(c.split).toBe("DEV");
  });

  it("seed must be 42 for canonical dataset", () => {
    const c = minimalEvalACase();
    expect(c.seed).toBe(42);
  });

  it("does NOT carry a current_state field (is a dataset record, not a runtime case)", () => {
    const c = minimalEvalACase();
    expect(c).not.toHaveProperty("current_state");
  });
});

// ---------------------------------------------------------------------------
// §13  Evaluation B — safety test harness
// ---------------------------------------------------------------------------

describe("EvalBCase", () => {
  it("CLEAN sample has expected_validator_outcome=true", () => {
    const c = minimalEvalBCase("CLEAN");
    expect(c.sample_type).toBe("CLEAN");
    expect(c.expected_validator_outcome).toBe(true);
  });

  it("FAULT_INJECTED sample has expected_validator_outcome=false", () => {
    const c = minimalEvalBCase("FAULT_INJECTED");
    expect(c.sample_type).toBe("FAULT_INJECTED");
    expect(c.expected_validator_outcome).toBe(false);
  });

  it("sample type values are CLEAN and FAULT_INJECTED only", () => {
    expect(EVAL_B_SAMPLE_TYPES).toContain("CLEAN");
    expect(EVAL_B_SAMPLE_TYPES).toContain("FAULT_INJECTED");
    expect(EVAL_B_SAMPLE_TYPES).toHaveLength(2);
  });

  it("uses verified_evidence_snapshot field (not ground_truth)", () => {
    const c = minimalEvalBCase();
    expect(c).toHaveProperty("verified_evidence_snapshot");
    expect(c).not.toHaveProperty("ground_truth");
  });

  it("input_narrative is a string", () => {
    expect(typeof minimalEvalBCase().input_narrative).toBe("string");
  });
});
