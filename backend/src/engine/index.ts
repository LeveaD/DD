/**
 * Dispute Processing Engine — Milestone 3
 *
 * Orchestrates the full pipeline for a dispute case through the
 * Evidence-First Defensive Routing workflow:
 *
 *   RECEIVED → EVIDENCE_FETCHING → EVIDENCE_VERIFIED
 *            → SUFFICIENCY_ASSESSED → (MANUAL_REVIEW | stops here for Milestone 3)
 *
 * Responsibilities:
 *   - Coordinate evidenceRepository, evidenceVerifier, router, stateMachine
 *   - Enforce fail-closed behavior at every step
 *   - Produce a structured EngineResult for use by the API layer (Milestone 5+)
 *   - Never read evaluation ground truth
 *   - Never call LLM/Gemini (Milestone 4)
 *   - Never fabricate evidence
 *
 * After Milestone 3, the engine stops at SUFFICIENCY_ASSESSED (DEFENDABLE)
 * or MANUAL_REVIEW. The RESPONSE_DRAFTED transition is reserved for Milestone 4.
 */

import type {
  DisputeState,
  EvidenceSignals,
  VerifiedEvidenceSnapshot,
  SufficiencyClassification,
} from "../schemas/index.js";
import type { SyntheticMerchantDb } from "../data/merchantDb.js";
import type { VerificationReason } from "./evidenceVerifier.js";
import type { RoutingReason } from "./router.js";

import { lookupEvidenceByTransaction } from "./evidenceRepository.js";
import { verifyEvidence } from "./evidenceVerifier.js";
import { routeDispute } from "./router.js";
import { transition } from "./stateMachine.js";

// ---------------------------------------------------------------------------
// Engine input / output types
// ---------------------------------------------------------------------------

/** Minimal dispute ingestion payload (from webhook, for Milestone 3 tests) */
export interface DisputeIngest {
  dispute_id: string;
  transaction_id: string;
  /** user_id from the chargeback claim — used for identity_match check */
  claimed_user_id: string;
  amount: number;
  currency: string;
  reason_code: string;
  chargeback_date: string;
}

export type EngineFailureReason =
  | "TRANSACTION_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "DB_ERROR"
  | "VERIFICATION_ERROR"
  | "STATE_TRANSITION_ERROR"
  | "UNEXPECTED_ERROR";

/**
 * Structured result returned by the engine for every dispute processed.
 * Contains everything needed for audit logging (Milestone 5).
 *
 * IMPORTANT: this structure NEVER contains evaluation ground truth.
 */
export interface EngineResult {
  dispute_id: string;
  transaction_id: string;

  /** Sequence of state transitions that occurred during processing */
  states: DisputeState[];
  /** Final state reached */
  final_state: DisputeState;

  /** Populated on successful evidence retrieval + verification */
  signals: EvidenceSignals | null;
  snapshot: VerifiedEvidenceSnapshot | null;
  sufficiency_classification: SufficiencyClassification | null;

  /** Explainability / audit fields */
  verification_reason: VerificationReason | null;
  routing_reason: RoutingReason | null;

  /** Populated when the engine failed closed */
  failure_reason: EngineFailureReason | null;
  failure_detail: string | null;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Process a single dispute through the deterministic evidence pipeline.
 *
 * Fail-closed design: any error at any stage routes to MANUAL_REVIEW.
 * The function itself never throws — all errors are captured in EngineResult.
 *
 * Milestone 3 terminal conditions:
 *   - DEFENDABLE: final_state = SUFFICIENCY_ASSESSED
 *   - NOT_DEFENDABLE / error: final_state = MANUAL_REVIEW
 *
 * @param db - synthetic merchant database to query
 * @param ingest - dispute ingestion payload
 */
export function processDispute(
  db: SyntheticMerchantDb,
  ingest: DisputeIngest,
): EngineResult {
  const states: DisputeState[] = ["RECEIVED"];

  const base: Omit<EngineResult, "final_state" | "states"> = {
    dispute_id: ingest.dispute_id,
    transaction_id: ingest.transaction_id,
    signals: null,
    snapshot: null,
    sufficiency_classification: null,
    verification_reason: null,
    routing_reason: null,
    failure_reason: null,
    failure_detail: null,
  };

  // Helper: fail closed to MANUAL_REVIEW
  function failClosed(
    reason: EngineFailureReason,
    detail: string,
    snapshot: VerifiedEvidenceSnapshot | null = null,
  ): EngineResult {
    states.push("MANUAL_REVIEW");
    return {
      ...base,
      snapshot,
      states,
      final_state: "MANUAL_REVIEW",
      failure_reason: reason,
      failure_detail: detail,
    };
  }

  try {
    // ------------------------------------------------------------------
    // Step 1: RECEIVED → EVIDENCE_FETCHING
    // ------------------------------------------------------------------
    const t1 = transition("RECEIVED", "EVIDENCE_FETCHING");
    if (!t1.ok) {
      return failClosed("STATE_TRANSITION_ERROR", t1.error.message);
    }
    states.push("EVIDENCE_FETCHING");

    // ------------------------------------------------------------------
    // Step 2: Retrieve evidence from the merchant DB
    // ------------------------------------------------------------------
    const lookupResult = lookupEvidenceByTransaction(db, ingest.transaction_id);

    if (!lookupResult.ok) {
      // Map lookup failure to engine failure, fail closed
      const engineReason: EngineFailureReason =
        lookupResult.reason === "TRANSACTION_NOT_FOUND"
          ? "TRANSACTION_NOT_FOUND"
          : lookupResult.reason === "USER_NOT_FOUND"
            ? "USER_NOT_FOUND"
            : "DB_ERROR";
      return failClosed(engineReason, lookupResult.detail);
    }

    // ------------------------------------------------------------------
    // Step 3: EVIDENCE_FETCHING → EVIDENCE_VERIFIED
    // ------------------------------------------------------------------
    const verificationResult = verifyEvidence(
      lookupResult.records,
      ingest.claimed_user_id,
    );

    if (!verificationResult.ok) {
      return failClosed(
        "VERIFICATION_ERROR",
        verificationResult.detail,
        verificationResult.snapshot,
      );
    }

    const { signals, snapshot, reason: verification_reason } = verificationResult;

    const t2 = transition("EVIDENCE_FETCHING", "EVIDENCE_VERIFIED");
    if (!t2.ok) {
      return failClosed("STATE_TRANSITION_ERROR", t2.error.message, snapshot);
    }
    states.push("EVIDENCE_VERIFIED");

    // ------------------------------------------------------------------
    // Step 4: EVIDENCE_VERIFIED → SUFFICIENCY_ASSESSED
    // ------------------------------------------------------------------
    const t3 = transition("EVIDENCE_VERIFIED", "SUFFICIENCY_ASSESSED");
    if (!t3.ok) {
      return failClosed("STATE_TRANSITION_ERROR", t3.error.message, snapshot);
    }
    states.push("SUFFICIENCY_ASSESSED");

    // ------------------------------------------------------------------
    // Step 5: Route — DEFENDABLE or MANUAL_REVIEW
    // ------------------------------------------------------------------
    const routingResult = routeDispute(signals);
    base.signals = signals;
    base.snapshot = snapshot;
    base.verification_reason = verification_reason;
    base.routing_reason = routingResult.reason;
    base.sufficiency_classification = routingResult.classification;

    if (routingResult.destination === "PROCEED_TO_DRAFTING") {
      // Milestone 3 stops here — RESPONSE_DRAFTED is Milestone 4
      return {
        ...base,
        signals,
        snapshot,
        verification_reason,
        routing_reason: routingResult.reason,
        sufficiency_classification: routingResult.classification,
        states,
        final_state: "SUFFICIENCY_ASSESSED",
      };
    } else {
      // Insufficient/contradictory — transition to MANUAL_REVIEW
      const t4 = transition("SUFFICIENCY_ASSESSED", "MANUAL_REVIEW");
      if (!t4.ok) {
        return failClosed("STATE_TRANSITION_ERROR", t4.error.message, snapshot);
      }
      states.push("MANUAL_REVIEW");

      return {
        ...base,
        signals,
        snapshot,
        verification_reason,
        routing_reason: routingResult.reason,
        sufficiency_classification: routingResult.classification,
        states,
        final_state: "MANUAL_REVIEW",
        failure_reason: null,  // Not an error — expected routing outcome
        failure_detail: routingResult.reason.summary,
      };
    }
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return failClosed("UNEXPECTED_ERROR", `Unexpected engine error: ${detail}`);
  }
}
