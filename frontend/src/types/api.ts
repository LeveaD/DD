/**
 * Frontend API DTO & Entity Types — Milestone 8
 *
 * Source of truth: backend/src/api/dto.ts & docs/DATA_MODEL.md
 */

export type DisputeState =
  | "RECEIVED"
  | "EVIDENCE_FETCHING"
  | "EVIDENCE_VERIFIED"
  | "SUFFICIENCY_ASSESSED"
  | "RESPONSE_DRAFTED"
  | "RESPONSE_VALIDATED"
  | "RESPONSE_VALIDATION_FAILED"
  | "HUMAN_APPROVAL_REQUIRED"
  | "READY_FOR_SUBMISSION"
  | "SUBMITTED"
  | "MANUAL_REVIEW";

export type SufficiencyClassification = "DEFENDABLE" | "NOT_DEFENDABLE";

export interface EvidenceSignals {
  identity_match: boolean;
  ip_consistency: boolean;
  post_purchase_consumption: boolean;
  tos_accepted: boolean;
  temporal_sequence_valid: boolean;
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

export interface VerifiedEvidenceSummary {
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
}

export interface VerificationResults {
  signals: EvidenceSignals | null;
  supporting_signals: string[];
  missing_or_contradicted_signals: string[];
  manual_review_reasons: string[];
  summary: string | null;
}

export interface ValidatedDraftDto {
  narrative: string;
  model_version: string;
  temperature: number;
  validated_at: string;
}

export interface ValidationStatusDto {
  passed: boolean;
  reason?: string;
  unsupported_claims?: string[];
}

export interface AuditTimelineItem {
  log_id: string;
  timestamp: string;
  event_type: string;
  previous_state: string;
  next_state: string;
  failure_reason?: string;
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
  verified_evidence_summary: VerifiedEvidenceSummary;
  verification_results: VerificationResults;
  validated_draft: ValidatedDraftDto | null;
  validation_status: ValidationStatusDto | null;
  audit_timeline: AuditTimelineItem[];
  is_simulated?: boolean;
  submission_notice?: string;
}

export interface AuditLogEntry {
  log_id: string;
  dispute_id: string;
  timestamp: string;
  event_type: string;
  previous_state: string;
  next_state: string;
  verified_evidence_snapshot?: Record<string, unknown>;
  llm_prompt_metadata?: { model_version: string; temperature: number };
  llm_output?: string;
  validation_result?: { passed: boolean; reason?: string };
  human_action?: { analyst_id: string; action: string; timestamp: string };
  failure_reason?: string;
}

export interface EvaluationSummaryData {
  evaluation_version: string;
  seed: number;
  evaluated_at: string;
  evaluation_a: {
    benchmark_name: string;
    seed: number;
    total_cases: number;
    dev_split: {
      count: number;
      confusion_matrix: { tp: number; tn: number; fp: number; fn: number };
      precision: number;
      recall: number;
      f1: number;
      false_positive_rate: number;
      false_negative_rate: number;
      manual_review_rate: number;
    };
    holdout_split: {
      count: number;
      confusion_matrix: { tp: number; tn: number; fp: number; fn: number };
      precision: number;
      recall: number;
      f1: number;
      false_positive_rate: number;
      false_negative_rate: number;
      manual_review_rate: number;
      label?: string;
    };
    combined: {
      count: number;
      confusion_matrix: { tp: number; tn: number; fp: number; fn: number };
      precision: number;
      recall: number;
      f1: number;
      false_positive_rate: number;
      false_negative_rate: number;
      manual_review_rate: number;
    };
  };
  evaluation_b: {
    benchmark_name: string;
    total_samples: number;
    clean_samples_count: number;
    fault_injected_samples_count: number;
    clean_pass_rate: number;
    fault_detection_rate: number;
    false_acceptance_rate: number;
    overall_pass_accuracy: number;
    fault_class_breakdown: Record<
      string,
      {
        fault_class: string;
        total_samples: number;
        rejected_count: number;
        accepted_count: number;
        detection_rate: number;
        false_acceptance_rate: number;
      }
    >;
  };
}

export type ApiResponse<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: { code: string; message: string; detail?: string } };
