/**
 * Defensive Router — Milestone 3
 *
 * Takes verified EvidenceSignals and applies the routing policy
 * defined in ARCHITECTURE.md §5 Routing Matrix and PRD §3.
 *
 * Produces:
 *   - SufficiencyClassification (DEFENDABLE | NOT_DEFENDABLE)
 *   - Routing decision (RESPONSE_DRAFTED path | MANUAL_REVIEW path)
 *   - Structured routing reason for explainability/audit
 *
 * CRITICAL:
 *   - Uses ONLY isSufficient(), hasCriticalContradiction(),
 *     hasSufficientPositiveSignals() from the schema module.
 *   - Does NOT read EvalGroundTruth, ORACLE_LABEL_TABLE, or scenarioOracle().
 *   - Does NOT use machine learning, probability scoring, or LLM.
 *   - All routing decisions are deterministic and explainable.
 *
 * Routing policy (per ARCHITECTURE.md §5):
 *   DEFENDABLE  = no critical contradiction AND sufficient positive signals
 *   → next state: SUFFICIENCY_ASSESSED (ready for RESPONSE_DRAFTED in Milestone 4)
 *
 *   NOT_DEFENDABLE = critical contradiction OR missing required signals
 *   → next state: MANUAL_REVIEW
 */

import type { EvidenceSignals, SufficiencyClassification } from "../schemas/index.js";
import {
  isSufficient,
  hasCriticalContradiction,
  hasSufficientPositiveSignals,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Router result types
// ---------------------------------------------------------------------------

export type RoutingDestination =
  /** Sufficient evidence — case continues to LLM drafting (Milestone 4) */
  | "PROCEED_TO_DRAFTING"
  /** Insufficient/contradictory evidence — case goes to human queue */
  | "ROUTE_TO_MANUAL_REVIEW";

export type ManualReviewReason =
  | "IDENTITY_MISMATCH"
  | "CONTRADICTORY_TIMESTAMPS"
  | "MISSING_IP_CONSISTENCY"
  | "MISSING_POST_PURCHASE_CONSUMPTION"
  | "MISSING_TOS_ACCEPTANCE"
  | "INSUFFICIENT_POSITIVE_SIGNALS"
  | "CRITICAL_CONTRADICTION";

export interface RoutingReason {
  classification: SufficiencyClassification;
  destination: RoutingDestination;
  /** Signals that were present (supporting the case) */
  supporting_signals: string[];
  /** Signals that were absent or contradicted */
  missing_or_contradicted_signals: string[];
  /** Specific manual review reasons, if routed to MANUAL_REVIEW */
  manual_review_reasons: ManualReviewReason[];
  /** Human-readable summary for audit/UI */
  summary: string;
}

export interface RouterResult {
  classification: SufficiencyClassification;
  destination: RoutingDestination;
  reason: RoutingReason;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Apply the deterministic routing policy to verified evidence signals.
 *
 * This function reads ONLY EvidenceSignals — no evaluation ground truth.
 * It calls isSufficient() and the two helper predicates from the schema module.
 *
 * @param signals - verified boolean evidence flags from the verifier
 */
export function routeDispute(signals: EvidenceSignals): RouterResult {
  const supporting_signals: string[] = [];
  const missing_or_contradicted_signals: string[] = [];
  const manual_review_reasons: ManualReviewReason[] = [];

  // Assess each signal for the explainability record
  if (signals.identity_match) {
    supporting_signals.push("identity_match");
  } else {
    missing_or_contradicted_signals.push("identity_match");
    manual_review_reasons.push("IDENTITY_MISMATCH");
  }

  if (signals.ip_consistency) {
    supporting_signals.push("ip_consistency");
  } else {
    missing_or_contradicted_signals.push("ip_consistency");
    manual_review_reasons.push("MISSING_IP_CONSISTENCY");
  }

  if (signals.post_purchase_consumption) {
    supporting_signals.push("post_purchase_consumption");
  } else {
    missing_or_contradicted_signals.push("post_purchase_consumption");
    manual_review_reasons.push("MISSING_POST_PURCHASE_CONSUMPTION");
  }

  if (signals.tos_accepted) {
    supporting_signals.push("tos_accepted");
  } else {
    missing_or_contradicted_signals.push("tos_accepted");
    manual_review_reasons.push("MISSING_TOS_ACCEPTANCE");
  }

  if (signals.temporal_sequence_valid) {
    supporting_signals.push("temporal_sequence_valid");
  } else {
    missing_or_contradicted_signals.push("temporal_sequence_valid");
    manual_review_reasons.push("CONTRADICTORY_TIMESTAMPS");
  }

  // Apply two-part sufficiency model (ADR-012)
  const hasContradiction = hasCriticalContradiction(signals);
  const hasSufficient = hasSufficientPositiveSignals(signals);
  const sufficient = isSufficient(signals);

  if (hasContradiction) {
    manual_review_reasons.push("CRITICAL_CONTRADICTION");
  }
  if (!hasSufficient && !hasContradiction) {
    manual_review_reasons.push("INSUFFICIENT_POSITIVE_SIGNALS");
  }

  const classification: SufficiencyClassification = sufficient
    ? "DEFENDABLE"
    : "NOT_DEFENDABLE";

  const destination: RoutingDestination = sufficient
    ? "PROCEED_TO_DRAFTING"
    : "ROUTE_TO_MANUAL_REVIEW";

  let summary: string;
  if (sufficient) {
    summary =
      `Evidence sufficient for drafting. Supporting signals: [${supporting_signals.join(", ")}]. ` +
      `No critical contradictions detected.`;
  } else if (hasContradiction) {
    summary =
      `Critical contradiction detected — case routed to MANUAL_REVIEW. ` +
      `Contradicted signals: [${missing_or_contradicted_signals.join(", ")}]. ` +
      `Supporting signals present: [${supporting_signals.join(", ")}].`;
  } else {
    summary =
      `Insufficient positive signals — case routed to MANUAL_REVIEW. ` +
      `Missing signals: [${missing_or_contradicted_signals.join(", ")}]. ` +
      `Present signals: [${supporting_signals.join(", ")}].`;
  }

  const reason: RoutingReason = {
    classification,
    destination,
    supporting_signals,
    missing_or_contradicted_signals,
    manual_review_reasons: [...new Set(manual_review_reasons)], // deduplicate
    summary,
  };

  return { classification, destination, reason };
}
