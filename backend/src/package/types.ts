/**
 * Evidence Package Data Model & Interfaces — Milestone 5
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/DATA_MODEL.md §4, docs/ARCHITECTURE.md §7
 *
 * Defines the structured container for verified evidence, verification signals,
 * validated AI response narrative, and append-only audit trail summary.
 *
 * IMMUTABILITY & SAFETY BOUNDARIES:
 *   - Compilation is permitted ONLY for cases in RESPONSE_VALIDATED or HUMAN_APPROVAL_REQUIRED state.
 *   - Contains strictly VERIFIED evidence and VALIDATED response narrative.
 *   - NEVER contains unvalidated or rejected draft text.
 *   - NEVER contains Evaluation A ground_truth labels or oracle internal data.
 *   - NEVER contains API keys or secrets.
 */

import type {
  DisputeState,
  SufficiencyClassification,
  EvidenceSignals,
} from "../schemas/index.js";

export interface EvidencePackageHeader {
  package_id: string;
  compiled_at: string;
  dispute_id: string;
  transaction_id: string;
  user_id: string;
  amount: number;
  currency: string;
  chargeback_date: string;
  reason_code: string;
  workflow_state: DisputeState;
}

export interface VerifiedEvidenceSummary {
  found: boolean;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  account_created_at: string | null;
  transaction_id: string | null;
  payment_method: string | null;
  card_last4: string | null;
  transaction_timestamp: string | null;
  transaction_ip: string | null;
  tos_version: string | null;
  tos_accepted_at: string | null;
  tos_ip_address: string | null;
  consumption_resource_id: string | null;
  consumption_timestamp: string | null;
  consumption_ip_address: string | null;
  bytes_downloaded: number | null;
}

export interface VerificationSignalSummary {
  identity_match: boolean;
  ip_consistency: boolean;
  post_purchase_consumption: boolean;
  tos_accepted: boolean;
  temporal_sequence_valid: boolean;
  sufficiency_classification: SufficiencyClassification;
  has_critical_contradiction: boolean;
}

export interface ValidatedDraftSummary {
  narrative: string;
  model_version: string;
  temperature: number;
  requested_at: string;
}

export interface AuditTrailSummaryEntry {
  log_id: string;
  event_type: string;
  timestamp: string;
  previous_state: string;
  next_state: string;
}

/**
 * Authoritative Evidence Package structure.
 * Compiled from verified source evidence and validated LLM draft.
 */
export interface EvidencePackage {
  header: EvidencePackageHeader;
  verified_evidence: VerifiedEvidenceSummary;
  signals: VerificationSignalSummary;
  /** MUST BE A VALIDATED DRAFT ONLY. Null if draft unvalidated/failed */
  validated_response_draft: ValidatedDraftSummary;
  audit_trail: AuditTrailSummaryEntry[];
}
