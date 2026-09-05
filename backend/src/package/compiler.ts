/**
 * Evidence Package Compiler — Milestone 5
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/ARCHITECTURE.md §7, Milestone 5 §6–§8
 *
 * Compiles a verified, audit-ready EvidencePackage from a DisputeCase,
 * VerifiedEvidenceSnapshot, and AuditLogEntries.
 *
 * STRICT SOURCE OF TRUTH:
 *   - Compiled strictly from verified source evidence and validated LLM draft.
 *   - NEVER compiles from unvalidated, raw, or rejected drafts.
 *   - Allowed ONLY after RESPONSE_VALIDATED or HUMAN_APPROVAL_REQUIRED state.
 *   - NEVER includes ground_truth, oracle labels, or secret keys.
 */

import type {
  DisputeCase,
  VerifiedEvidenceSnapshot,
  AuditLogEntry,
  EvidenceSignals,
} from "../schemas/index.js";
import { hasCriticalContradiction } from "../schemas/index.js";
import type { EvidencePackage, AuditTrailSummaryEntry } from "./types.js";
import { validateEvidencePackage } from "./validator.js";

export type CompilePackageResult =
  | { ok: true; package: EvidencePackage }
  | { ok: false; reason: string; errors: string[] };

/**
 * Compile a verified EvidencePackage.
 *
 * @param disputeCase DisputeCase object (must be in RESPONSE_VALIDATED or HUMAN_APPROVAL_REQUIRED)
 * @param snapshot VerifiedEvidenceSnapshot object
 * @param auditEntries Chronological list of AuditLogEntries for this case
 */
export function compileEvidencePackage(
  disputeCase: DisputeCase,
  snapshot: VerifiedEvidenceSnapshot,
  auditEntries: readonly AuditLogEntry[] = [],
): CompilePackageResult {
  // 1. State Boundary Check
  const allowedStates = new Set(["RESPONSE_VALIDATED", "HUMAN_APPROVAL_REQUIRED"]);
  if (!allowedStates.has(disputeCase.current_state)) {
    return {
      ok: false,
      reason: "STATE_BOUNDARY_VIOLATION",
      errors: [
        `Cannot compile evidence package for dispute in state "${disputeCase.current_state}". Allowed states: RESPONSE_VALIDATED, HUMAN_APPROVAL_REQUIRED`,
      ],
    };
  }

  // 2. Draft Validation Status Check
  if (disputeCase.validation_result?.passed !== true) {
    return {
      ok: false,
      reason: "UNVALIDATED_DRAFT_REJECTED",
      errors: ["Dispute case LLM draft has not passed hard validation"],
    };
  }

  if (!disputeCase.llm_draft) {
    return {
      ok: false,
      reason: "MISSING_VALIDATED_DRAFT",
      errors: ["No llm_draft object present on dispute case"],
    };
  }

  // 3. Extract verified supporting signals
  const defaultSignals: EvidenceSignals = {
    identity_match: snapshot.user !== null && snapshot.transaction !== null && snapshot.user.user_id === snapshot.transaction.user_id,
    ip_consistency: false,
    post_purchase_consumption: snapshot.consumption_log !== null,
    tos_accepted: snapshot.tos_log !== null,
    temporal_sequence_valid: true,
  };
  const signals = disputeCase.evidence_signals ?? defaultSignals;

  // 4. Extract audit trail for this dispute ID
  const caseAuditEntries: AuditTrailSummaryEntry[] = auditEntries
    .filter((e) => e.dispute_id === disputeCase.dispute_id)
    .map((e) => ({
      log_id: e.log_id,
      event_type: e.event_type,
      timestamp: e.timestamp,
      previous_state: e.previous_state,
      next_state: e.next_state,
    }));

  // 5. Assemble Evidence Package structure
  const compiledPackage: EvidencePackage = {
    header: {
      package_id: `pkg_${disputeCase.dispute_id}`,
      compiled_at: new Date().toISOString(),
      dispute_id: disputeCase.dispute_id,
      transaction_id: disputeCase.transaction_id,
      user_id: snapshot.user?.user_id ?? "UNKNOWN",
      amount: disputeCase.amount,
      currency: disputeCase.currency,
      chargeback_date: disputeCase.chargeback_date,
      reason_code: disputeCase.reason_code,
      workflow_state: disputeCase.current_state,
    },
    verified_evidence: {
      found: snapshot.found,
      user_id: snapshot.user?.user_id ?? null,
      user_name: snapshot.user?.name ?? null,
      user_email: snapshot.user?.email ?? null,
      account_created_at: snapshot.user?.created_at ?? null,
      transaction_id: snapshot.transaction?.transaction_id ?? null,
      payment_method: snapshot.transaction?.payment_method ?? null,
      card_last4: snapshot.transaction?.card_last4 ?? null,
      transaction_timestamp: snapshot.transaction?.timestamp ?? null,
      transaction_ip: snapshot.transaction?.ip_address ?? null,
      tos_version: snapshot.tos_log?.tos_version ?? null,
      tos_accepted_at: snapshot.tos_log?.accepted_at ?? null,
      tos_ip_address: snapshot.tos_log?.ip_address ?? null,
      consumption_resource_id: snapshot.consumption_log?.resource_id ?? null,
      consumption_timestamp: snapshot.consumption_log?.consumed_at ?? null,
      consumption_ip_address: snapshot.consumption_log?.ip_address ?? null,
      bytes_downloaded: snapshot.consumption_log?.bytes_downloaded ?? null,
    },
    signals: {
      identity_match: signals.identity_match,
      ip_consistency: signals.ip_consistency,
      post_purchase_consumption: signals.post_purchase_consumption,
      tos_accepted: signals.tos_accepted,
      temporal_sequence_valid: signals.temporal_sequence_valid,
      sufficiency_classification: disputeCase.sufficiency_classification ?? "NOT_DEFENDABLE",
      has_critical_contradiction: hasCriticalContradiction(signals),
    },
    validated_response_draft: {
      narrative: disputeCase.llm_draft.text,
      model_version: disputeCase.llm_draft.model_version,
      temperature: disputeCase.llm_draft.temperature,
      requested_at: disputeCase.llm_draft.requested_at ?? new Date().toISOString(),
    },
    audit_trail: caseAuditEntries,
  };

  // 6. Deterministically validate compiled package before returning
  const validationRes = validateEvidencePackage(compiledPackage, disputeCase, snapshot);
  if (!validationRes.ok) {
    return {
      ok: false,
      reason: "PACKAGE_VALIDATION_FAILED",
      errors: validationRes.errors,
    };
  }

  return { ok: true, package: compiledPackage };
}
