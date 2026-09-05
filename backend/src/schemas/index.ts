/**
 * DisputeDefend AI — Foundational Schemas & Types (Milestone 1)
 *
 * Source of truth: docs/DATA_MODEL.md, docs/ARCHITECTURE.md
 * Stack: Node.js + TypeScript
 *
 * TERMINOLOGY NOTES:
 *   - VerifiedEvidenceSnapshot: runtime evidence collected during case processing.
 *     NOT evaluation ground truth. Never implies legal conclusions.
 *   - ground_truth: reserved exclusively for Evaluation A dataset labels (EvalACase).
 *   - Amounts: always in MAJOR currency units (e.g. 4999 INR = ₹4,999).
 *   - IP / device signals are supporting consistency signals only.
 *   - LLM output is a draft; it cannot modify source evidence or transition state.
 */

// ---------------------------------------------------------------------------
// §1  WORKFLOW STATE MACHINE
//     Exact states from docs/ARCHITECTURE.md §2.
//     No additional business states may be added without a planning decision.
// ---------------------------------------------------------------------------

/**
 * Authoritative workflow states for a DisputeCase.
 * Only these eleven states exist in the system.
 * State transitions are controlled exclusively by deterministic code;
 * the LLM has zero authority to transition state.
 */
export const DISPUTE_STATES = [
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
] as const;

export type DisputeState = (typeof DISPUTE_STATES)[number];

/**
 * Deterministic classification of a dispute case's evidence sufficiency.
 * Assigned by the routing engine; never assigned by the LLM.
 */
export const SUFFICIENCY_CLASSIFICATIONS = ["DEFENDABLE", "NOT_DEFENDABLE"] as const;
export type SufficiencyClassification = (typeof SUFFICIENCY_CLASSIFICATIONS)[number];

// ---------------------------------------------------------------------------
// §2  SYNTHETIC MERCHANT DATABASE ENTITIES
//     Field definitions from docs/DATA_MODEL.md §2.
// ---------------------------------------------------------------------------

/**
 * Customer account record in the synthetic merchant database.
 * Presence of a User record does not establish fraud, intent, or legal liability.
 */
export interface User {
  /** Primary key; e.g. "usr_101" */
  user_id: string;
  /** Full display name */
  name: string;
  /** Email address */
  email: string;
  /** ISO-8601 account registration timestamp */
  created_at: string;
}

/**
 * Payment transaction record.
 *
 * Amount convention: MAJOR CURRENCY UNITS throughout the system.
 * e.g. amount=4999, currency="INR" represents ₹4,999.
 * Never store minor currency units (paise, cents).
 */
export interface Transaction {
  /** Primary key; e.g. "txn_501" */
  transaction_id: string;
  /** Foreign key → User.user_id */
  user_id: string;
  /** Major currency units (e.g. 4999 = ₹4,999) */
  amount: number;
  /** ISO-4217 3-letter code (e.g. "INR") */
  currency: string;
  /** ISO-8601 transaction completion time */
  timestamp: string;
  /** Checkout IP address (supporting signal only) */
  ip_address: string;
  /** e.g. "card" */
  payment_method: string;
  /** Last 4 digits of card used */
  card_last4: string;
}

/**
 * Account session / login telemetry record.
 * IP address is a supporting consistency signal; it does not constitute
 * absolute proof of identity. NAT, VPN, and shared-network conditions
 * may weaken the signal.
 */
export interface IPLog {
  /** Primary key */
  log_id: string;
  /** Foreign key → User.user_id */
  user_id: string;
  /** Session IP (supporting signal only) */
  ip_address: string;
  /** ISO-8601 session timestamp */
  timestamp: string;
  /** User-Agent / device description */
  device_info: string;
}

/**
 * Terms-of-Service acceptance record.
 * Represents that terms were accepted at the recorded timestamp.
 * Does NOT constitute proof that any specific dispute is legally invalid.
 */
export interface TOSLog {
  /** Primary key */
  tos_id: string;
  /** Foreign key → User.user_id */
  user_id: string;
  /** Accepted TOS version; e.g. "v2.1" */
  tos_version: string;
  /** ISO-8601 acceptance timestamp */
  accepted_at: string;
  /** IP at time of acceptance (supporting signal only) */
  ip_address: string;
}

/**
 * Post-purchase digital resource consumption / usage record.
 * Represents that a resource was accessed after purchase.
 * Does NOT prove fraudulent intent or establish legal liability.
 *
 * bytes_downloaded: Volume consumed; 0 is valid (e.g. stream start with no completion).
 */
export interface ConsumptionLog {
  /** Primary key */
  consumption_id: string;
  /** Foreign key → User.user_id */
  user_id: string;
  /** Foreign key → Transaction.transaction_id */
  transaction_id: string;
  /** Downloaded/accessed resource identifier */
  resource_id: string;
  /** ISO-8601 access timestamp */
  consumed_at: string;
  /** IP at time of consumption (supporting signal only) */
  ip_address: string;
  /** Volume consumed; 0 is valid */
  bytes_downloaded: number;
}

// ---------------------------------------------------------------------------
// §3  VERIFIED EVIDENCE SNAPSHOT
//     Runtime telemetry assembled during EVIDENCE_FETCHING / EVIDENCE_VERIFIED.
//     This is NOT evaluation ground truth. The term "ground_truth" must never
//     appear on this type.
// ---------------------------------------------------------------------------

/**
 * Boolean signal flags computed deterministically from raw telemetry.
 * Each flag is a supporting consistency signal — not a legal determination.
 *
 * Evidence semantics (from PRD §3 and ARCHITECTURE.md §5):
 *   - Signals represent consistency observations, never proof of fraud,
 *     customer intent, or legal liability.
 *   - A signal being unavailable (false) does not by itself imply that the
 *     case is undefendable; context determines whether it is a contradiction
 *     or simply an absent supporting signal.
 *   - The routing engine calls isSufficient() to decide the Branch A / Branch B split.
 */
export interface EvidenceSignals {
  /** user_id from dispute matches transaction record */
  identity_match: boolean;
  /** Transaction IP matches consumption IP (supporting signal) */
  ip_consistency: boolean;
  /** Consumption log exists for transaction */
  post_purchase_consumption: boolean;
  /** TOS acceptance record exists with accepted_at ≤ txn timestamp */
  tos_accepted: boolean;
  /** tos.accepted_at ≤ txn.timestamp ≤ consumption.consumed_at */
  temporal_sequence_valid: boolean;
}

/**
 * Runtime snapshot of verified merchant telemetry assembled during
 * EVIDENCE_FETCHING → EVIDENCE_VERIFIED.
 *
 * IMPORTANT TERMINOLOGY:
 *   This is VERIFIED_EVIDENCE_SNAPSHOT — runtime application data.
 *   It is NOT evaluation ground truth.
 *   "Ground truth" is reserved exclusively for Evaluation A dataset labels.
 *
 * All signals are supporting consistency evidence; none establish fraud,
 * customer intent, or legal liability.
 */
export interface VerifiedEvidenceSnapshot {
  user: User | null;
  transaction: Transaction | null;
  ip_logs: IPLog[];
  tos_log: TOSLog | null;
  consumption_log: ConsumptionLog | null;
  /** false when the transaction does not exist in the merchant DB */
  found: boolean;
}

// ---------------------------------------------------------------------------
// §4  EVIDENCE SUFFICIENCY HELPERS
//     Deterministic sufficiency logic per ADR-012 (two-part model).
//     No ML, no LLM judge, no probabilistic scoring.
// ---------------------------------------------------------------------------

/**
 * True when the available telemetry contains a logical impossibility
 * that makes the case fundamentally undefendable regardless of other signals.
 *
 * Critical contradictions (per ARCHITECTURE.md §5 Routing Matrix):
 *   - identity_match is false: the disputing user does not match the
 *     transaction record; no other signal can compensate.
 *   - temporal_sequence_valid is false: event sequence is logically impossible
 *     (e.g., consumption logged before purchase).
 *
 * A missing signal (e.g., no IP log recorded) is NOT a contradiction;
 * it is an absent supporting signal evaluated separately.
 */
export function hasCriticalContradiction(signals: EvidenceSignals): boolean {
  return !signals.identity_match || !signals.temporal_sequence_valid;
}

/**
 * True when a sufficient combination of independent supporting signals
 * is present to proceed to AI-assisted drafting.
 *
 * Per PRD §3 ("Strong Evidence") and ARCHITECTURE.md §5 routing matrix,
 * the following signals must ALL be present for Branch A routing:
 *   - ip_consistency: transaction IP is consistent with session/consumption IP.
 *   - post_purchase_consumption: resource access log exists after purchase.
 *   - tos_accepted: TOS acceptance record predates the transaction.
 *
 * These are independent supporting signals. Each one absent by itself
 * is a routing concern (routes to MANUAL_REVIEW), not a contradiction.
 */
export function hasSufficientPositiveSignals(signals: EvidenceSignals): boolean {
  return (
    signals.ip_consistency &&
    signals.post_purchase_consumption &&
    signals.tos_accepted
  );
}

/**
 * Returns true when the evidence is sufficient for Branch A routing
 * (SUFFICIENCY_ASSESSED → RESPONSE_DRAFTED → HUMAN_APPROVAL_REQUIRED).
 *
 * Sufficiency requires BOTH conditions simultaneously:
 *   1. No critical contradictions (identity mismatch or impossible timestamps).
 *   2. A sufficient combination of independent positive signals present.
 *
 * When false, the routing engine sends the case to MANUAL_REVIEW (Branch B).
 * This function encodes the Evidence-First Defensive Routing policy.
 * It never asserts fraud, customer intent, or legal liability.
 */
export function isSufficient(signals: EvidenceSignals): boolean {
  return !hasCriticalContradiction(signals) && hasSufficientPositiveSignals(signals);
}

// ---------------------------------------------------------------------------
// §5  LLM DRAFT & VALIDATION RESULT
//     The LLM may only generate narrative text.
//     It cannot modify source evidence, amounts, IDs, timestamps, or state.
// ---------------------------------------------------------------------------

/**
 * Output produced by the bounded LLM narrative generator.
 *
 * Constraints (from PROJECT_RULES.md Rules 7 & 8):
 *   - text is a response narrative ONLY.
 *   - The LLM may not create evidence, modify financial values, modify
 *     timestamps, determine routing, change state, or approve itself.
 *   - Rejected drafts remain auditable; they are NOT destroyed.
 */
export interface LLMDraftResult {
  /** Raw generated narrative text */
  text: string;
  /** Model identifier used by the bounded LLM drafting layer (e.g. Groq model ID) */
  model_version: string;
  /** Sampling temperature used (documentation only) */
  temperature: number;
  /** ISO-8601 timestamp of the generation request */
  requested_at?: string;
}

/**
 * Outcome produced by the Post-Generation Hard Validator.
 *
 * passed=true  → narrative entities align 100% with VerifiedEvidenceSnapshot
 *                and contains no unsupported inferences (intent, legal guilt).
 * passed=false → one or more unsupported claims or hallucinated entities detected.
 *
 * Rejected output is excluded from the final evidence package and cannot
 * progress through the workflow; it is retained in the audit log for traceability.
 */
export interface ValidationResult {
  passed: boolean;
  unsupported_claims: string[];
  /** e.g. "UNSUPPORTED_ENTITY_DETECTED", "VALIDATOR_CRASH" */
  reason?: string;
}

// ---------------------------------------------------------------------------
// §6  DISPUTE CASE
//     Central entity representing a chargeback case.
// ---------------------------------------------------------------------------

/**
 * A chargeback dispute case processed by DisputeDefend AI.
 *
 * amount: major currency units (e.g. 4999 = ₹4,999).
 * current_state: controlled exclusively by deterministic code;
 *                LLM has zero authority to change this field.
 * verified_evidence_snapshot: runtime telemetry — NOT evaluation ground truth.
 * llm_draft: narrative text only; never modifies source facts.
 */
export interface DisputeCase {
  dispute_id: string;
  transaction_id: string;
  /** Major currency units (e.g. 4999 = ₹4,999) */
  amount: number;
  /** ISO-4217 (e.g. "INR") */
  currency: string;
  reason_code: string;
  /** ISO-8601 */
  chargeback_date: string;
  current_state: DisputeState;
  /** ISO-8601 */
  created_at: string;
  // Populated progressively as the case moves through the state machine
  evidence_signals?: EvidenceSignals;
  sufficiency_classification?: SufficiencyClassification;
  verified_evidence_snapshot?: VerifiedEvidenceSnapshot;
  llm_draft?: LLMDraftResult;
  validation_result?: ValidationResult;
}

// ---------------------------------------------------------------------------
// §7  APPLICATION-LEVEL APPEND-ONLY AUDIT LOG ENTRY
//     From docs/DATA_MODEL.md §4 and docs/ARCHITECTURE.md §7.
//     No application update or delete operations exist for historical entries.
//     Rejected LLM outputs are retained for traceability.
// ---------------------------------------------------------------------------

/** Analyst approval/rejection record embedded in an audit entry. */
export interface HumanAction {
  analyst_id: string;
  action: string;
  timestamp: string;
}

/** LLM prompt metadata embedded in an audit entry. */
export interface LLMPromptMetadata {
  model_version: string;
  temperature: number;
}

/**
 * Single immutable record in the application-level append-only audit log.
 *
 * All state transitions, human actions, LLM outputs (including rejected ones),
 * and validation outcomes are captured here. No update or delete operations
 * are performed on historical entries.
 *
 * The invalid LLM output, if any, is excluded from the final evidence package
 * but is retained in the audit log for traceability.
 */
export interface AuditLogEntry {
  log_id: string;
  dispute_id: string;
  /** ISO-8601 event time */
  timestamp: string;
  /** e.g. "WEBHOOK_RECEIVED", "LLM_DRAFT_GENERATED", "POST_GEN_VALIDATION_FAILED" */
  event_type: string;
  previous_state: string;
  next_state: string;
  // Optional contextual fields — present only for relevant event types
  /** Serialised snapshot at time of event */
  verified_evidence_snapshot?: Record<string, unknown>;
  llm_prompt_metadata?: LLMPromptMetadata;
  /** Raw generated text — kept even if rejected */
  llm_output?: string;
  validation_result?: { passed: boolean; reason?: string };
  human_action?: HumanAction;
  /** Explicit categorisation for MANUAL_REVIEW routing */
  failure_reason?: string;
}

// ---------------------------------------------------------------------------
// §8  EVALUATION DATASET ENTITIES
//     From docs/DATA_MODEL.md §5 and docs/EVALUATION.md.
//
//     CRITICAL INVARIANT (Non-Circular Evaluation A):
//       EvalACase.ground_truth is assigned by an independent synthetic scenario
//       oracle BEFORE the production routing function is ever invoked.
//       The production routing function generates the *system prediction*;
//       it never generates the ground truth label.
// ---------------------------------------------------------------------------

/**
 * Independent ground-truth label assigned by the synthetic scenario oracle.
 * Exists ONLY in evaluation dataset entities — never on runtime DisputeCase.
 */
export const EVAL_GROUND_TRUTH_VALUES = ["DEFENDABLE", "NOT_DEFENDABLE"] as const;
export type EvalGroundTruth = (typeof EVAL_GROUND_TRUTH_VALUES)[number];

/**
 * Dataset partition for Evaluation A.
 * DEV: 70% (105 cases) — rule tuning and sanity testing.
 * HOLDOUT: 30% (45 cases) — strictly isolated evaluation set.
 */
export const EVAL_SPLIT_VALUES = ["DEV", "HOLDOUT"] as const;
export type EvalSplit = (typeof EVAL_SPLIT_VALUES)[number];

/**
 * A single case in the Evaluation A dataset (Evidence Routing Performance).
 *
 * ground_truth: assigned by the independent synthetic scenario oracle prior
 *               to production routing logic execution. Must never be derived
 *               by calling the production routing classifier.
 *
 * synthetic_evidence: structured telemetry object matching the merchant DB schema.
 */
export interface EvalACase {
  /** e.g. "eval_a_001" */
  case_id: string;
  /** Must be 42 for the canonical dataset */
  seed: number;
  split: EvalSplit;
  synthetic_evidence: Record<string, unknown>;
  /** Set by oracle BEFORE routing is invoked */
  ground_truth: EvalGroundTruth;
}

/**
 * Classification of an Evaluation B test sample.
 * CLEAN: accurate narrative — validator should PASS.
 * FAULT_INJECTED: mutated narrative — validator should REJECT.
 */
export const EVAL_B_SAMPLE_TYPES = ["CLEAN", "FAULT_INJECTED"] as const;
export type EvalBSampleType = (typeof EVAL_B_SAMPLE_TYPES)[number];

/**
 * A single sample in the Evaluation B safety test harness
 * (LLM Output Safety & Hard Validator Benchmark).
 *
 * Fault injection types include:
 *   - Date mutation (altered timestamps not in VerifiedEvidenceSnapshot)
 *   - IP fabrication (non-matching IP address)
 *   - Amount alteration (changed major-unit amount)
 *   - Identifier hallucination (fabricated user email or transaction ID)
 *   - Unsupported intent inference (e.g. "customer intentionally committed fraud")
 *
 * expected_validator_outcome:
 *   true  → validator should PASS (CLEAN sample)
 *   false → validator should REJECT (FAULT_INJECTED sample)
 */
export interface EvalBCase {
  test_id: string;
  sample_type: EvalBSampleType;
  /** Ground truth benchmark snapshot for this sample */
  verified_evidence_snapshot: Record<string, unknown>;
  /** The narrative text to be validated */
  input_narrative: string;
  /** true=PASS expected, false=REJECT expected */
  expected_validator_outcome: boolean;
}
