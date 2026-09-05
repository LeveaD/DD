/**
 * API Data Transfer Objects & Serialization Helpers — Milestone 7
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/DATA_MODEL.md, Milestone 7 §3–§15
 *
 * Converts internal DisputeCase, VerifiedEvidenceSnapshot, and AuditLogEntry
 * entities into clean, frontend-friendly JSON DTOs for the React dashboard.
 *
 * SAFETY INVARIANTS:
 *   - NEVER exposes Evaluation A ground_truth labels or oracle internal data.
 *   - NEVER exposes GROQ_API_KEY, secrets, or internal credentials.
 *   - Clearly distinguishes VERIFIED EVIDENCE from GENERATED RESPONSE DRAFT.
 */

import type {
  DisputeCase,
  VerifiedEvidenceSnapshot,
  AuditLogEntry,
  DisputeState,
  SufficiencyClassification,
  EvidenceSignals,
} from "../schemas/index.js";

/** Standard API envelope format for success and error responses */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiErrorDetail };

export interface ApiErrorDetail {
  code: string;
  message: string;
  detail?: string;
}

export interface DisputeListItemDto {
  id: string;
  dispute_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  reason_code: string;
  chargeback_date: string;
  state: DisputeState;
  classification: SufficiencyClassification | null;
}

export interface DisputeDetailDto {
  id: string;
  dispute_id: string;
  transaction_id: string;
  claimed_user_id: string;
  amount: number;
  currency: string;
  reason_code: string;
  chargeback_date: string;
  workflow_state: DisputeState;
  sufficiency_classification: SufficiencyClassification | null;
  verified_evidence_summary: {
    found: boolean;
    user_id: string | null;
    user_name: string | null;
    user_email: string | null;
    transaction_timestamp: string | null;
    transaction_ip: string | null;
    payment_method: string | null;
    card_last4: string | null;
    tos_version: string | null;
    tos_accepted_at: string | null;
    consumption_resource: string | null;
    consumption_timestamp: string | null;
  };
  verification_results: {
    signals: EvidenceSignals | null;
    supporting_signals: string[];
    missing_or_contradicted_signals: string[];
    manual_review_reasons: string[];
    summary: string | null;
  };
  validated_draft: {
    narrative: string;
    model_version: string;
    temperature: number;
    validated_at: string;
  } | null;
  validation_status: {
    passed: boolean;
    reason?: string;
    unsupported_claims?: string[];
  } | null;
  audit_timeline: Array<{
    log_id: string;
    timestamp: string;
    event_type: string;
    previous_state: string;
    next_state: string;
    failure_reason?: string;
  }>;
}

/** Format DisputeListItemDto from DisputeCase */
export function formatDisputeListItem(c: DisputeCase): DisputeListItemDto {
  return {
    id: c.dispute_id,
    dispute_id: c.dispute_id,
    transaction_id: c.transaction_id,
    amount: c.amount,
    currency: c.currency,
    reason_code: c.reason_code,
    chargeback_date: c.chargeback_date,
    state: c.current_state,
    classification: c.sufficiency_classification ?? null,
  };
}

/** Format DisputeDetailDto from DisputeCase, VerifiedEvidenceSnapshot, and AuditLogEntries */
export function formatDisputeDetail(
  c: DisputeCase,
  snapshot: VerifiedEvidenceSnapshot,
  auditEntries: readonly AuditLogEntry[] = [],
): DisputeDetailDto {
  const auditTimeline = auditEntries
    .filter((e) => e.dispute_id === c.dispute_id)
    .map((e) => ({
      log_id: e.log_id,
      timestamp: e.timestamp,
      event_type: e.event_type,
      previous_state: e.previous_state,
      next_state: e.next_state,
      ...(e.failure_reason ? { failure_reason: e.failure_reason } : {}),
    }));

  const signals = c.evidence_signals ?? null;

  return {
    id: c.dispute_id,
    dispute_id: c.dispute_id,
    transaction_id: c.transaction_id,
    claimed_user_id: snapshot.user?.user_id ?? "usr_101",
    amount: c.amount,
    currency: c.currency,
    reason_code: c.reason_code,
    chargeback_date: c.chargeback_date,
    workflow_state: c.current_state,
    sufficiency_classification: c.sufficiency_classification ?? null,
    verified_evidence_summary: {
      found: snapshot.found,
      user_id: snapshot.user?.user_id ?? null,
      user_name: snapshot.user?.name ?? null,
      user_email: snapshot.user?.email ?? null,
      transaction_timestamp: snapshot.transaction?.timestamp ?? null,
      transaction_ip: snapshot.transaction?.ip_address ?? null,
      payment_method: snapshot.transaction?.payment_method ?? null,
      card_last4: snapshot.transaction?.card_last4 ?? null,
      tos_version: snapshot.tos_log?.tos_version ?? null,
      tos_accepted_at: snapshot.tos_log?.accepted_at ?? null,
      consumption_resource: snapshot.consumption_log?.resource_id ?? null,
      consumption_timestamp: snapshot.consumption_log?.consumed_at ?? null,
    },
    verification_results: {
      signals,
      supporting_signals: signals ? getSupportingSignalsList(signals) : [],
      missing_or_contradicted_signals: signals ? getMissingSignalsList(signals) : [],
      manual_review_reasons: signals ? getManualReviewReasonsList(signals) : [],
      summary: c.sufficiency_classification ? `Classification: ${c.sufficiency_classification}` : null,
    },
    validated_draft: c.llm_draft
      ? {
          narrative: c.llm_draft.text,
          model_version: c.llm_draft.model_version,
          temperature: c.llm_draft.temperature,
          validated_at: c.llm_draft.requested_at ?? new Date().toISOString(),
        }
      : null,
    validation_status: c.validation_result
      ? {
          passed: c.validation_result.passed,
          ...(c.validation_result.reason ? { reason: c.validation_result.reason } : {}),
          unsupported_claims: c.validation_result.unsupported_claims,
        }
      : null,
    audit_timeline: auditTimeline,
  };
}

function getSupportingSignalsList(s: EvidenceSignals): string[] {
  const list: string[] = [];
  if (s.identity_match) list.push("identity_match");
  if (s.ip_consistency) list.push("ip_consistency");
  if (s.post_purchase_consumption) list.push("post_purchase_consumption");
  if (s.tos_accepted) list.push("tos_accepted");
  if (s.temporal_sequence_valid) list.push("temporal_sequence_valid");
  return list;
}

function getMissingSignalsList(s: EvidenceSignals): string[] {
  const list: string[] = [];
  if (!s.identity_match) list.push("identity_match");
  if (!s.ip_consistency) list.push("ip_consistency");
  if (!s.post_purchase_consumption) list.push("post_purchase_consumption");
  if (!s.tos_accepted) list.push("tos_accepted");
  if (!s.temporal_sequence_valid) list.push("temporal_sequence_valid");
  return list;
}

function getManualReviewReasonsList(s: EvidenceSignals): string[] {
  const list: string[] = [];
  if (!s.identity_match) list.push("IDENTITY_MISMATCH");
  if (!s.temporal_sequence_valid) list.push("CONTRADICTORY_TIMESTAMPS");
  if (!s.ip_consistency) list.push("MISSING_IP_CONSISTENCY");
  if (!s.post_purchase_consumption) list.push("MISSING_POST_PURCHASE_CONSUMPTION");
  if (!s.tos_accepted) list.push("MISSING_TOS_ACCEPTANCE");
  return list;
}
