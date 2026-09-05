/**
 * LLM Drafting & Deterministic Validation Module — Milestone 4 Entry Point
 *
 * Source of truth: docs/PRD.md §3, docs/ARCHITECTURE.md §7, docs/PROJECT_RULES.md Rules 7 & 8
 * LLM Provider: Groq API (`groq-sdk`)
 *
 * Coordinates the bounded LLM drafting workflow:
 *   1. Receives a VerifiedEvidenceSnapshot and DisputeCase.
 *   2. Enforces source evidence immutability (verifies snapshot is unmodified).
 *   3. Constructs structured prompt (SYSTEM instruction + USER data message).
 *   4. Calls GroqDraftClient (or mock) to generate a structured JSON draft.
 *   5. Hard-validates response deterministically (no LLM judge).
 *   6. Handles validation failures and API errors by routing to MANUAL_REVIEW (fail-closed).
 *   7. Executes state transitions according to stateMachine rules.
 *   8. Excludes invalid drafts from final evidence package while retaining them for audit logging.
 */

import type {
  DisputeCase,
  VerifiedEvidenceSnapshot,
  LLMDraftResult,
  ValidationResult,
  DisputeState,
} from "../schemas/index.js";
import { transition } from "../engine/stateMachine.js";
import {
  type GroqDraftClient,
  createGroqClient,
  resolveModel,
  resolveTemperature,
} from "./groqClient.js";
import { buildPrompt } from "./promptBuilder.js";
import { validateDraft, toValidationResult, type DraftValidationResult } from "./draftValidator.js";

// Re-export submodules
export * from "./groqClient.js";
export * from "./promptBuilder.js";
export * from "./draftValidator.js";

/** Exact semantic string required by PRD §3 / Milestone 4 §7 for rejected drafts */
export const AUDIT_EXCLUSION_SEMANTIC =
  "The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the append-only audit log for traceability.";

/**
 * Result returned by the LLM drafting pipeline for audit logging and workflow integration.
 */
export interface DraftingPipelineResult {
  dispute_id: string;
  success: boolean;
  final_state: DisputeState;
  model_id: string;
  temperature: number;
  requested_at: string;
  /** Validated draft narrative (populated only when success is true) */
  llm_draft?: LLMDraftResult;
  /** Validation result (always present) */
  validation_result: ValidationResult;
  /** Raw generated output — retained in audit log even if validation failed */
  raw_llm_output?: string;
  /** Structured audit note (e.g. AUDIT_EXCLUSION_SEMANTIC when rejected) */
  audit_note: string;
}

import { AuditLogger } from "../audit/auditLogger.js";

/** Options for executing the drafting pipeline */
export interface RunDraftingOptions {
  /** Dispute case to draft a response for (must be in SUFFICIENCY_ASSESSED state) */
  disputeCase: DisputeCase;
  /** Verified evidence snapshot from deterministic engine */
  snapshot: VerifiedEvidenceSnapshot;
  /** Optional custom Groq client (e.g. deterministic mock for testing) */
  client?: GroqDraftClient;
  /** Optional AuditLogger instance to automatically record pipeline audit entries */
  auditLogger?: AuditLogger;
}

/**
 * Executes the bounded LLM drafting & deterministic validation pipeline.
 *
 * IMMUTABILITY GUARANTEE:
 *   The snapshot parameter is deep-cloned before processing and verified
 *   to remain unchanged after execution.
 *
 * FAIL-CLOSED BEHAVIOUR:
 *   Any API error, missing key, timeout, malformed JSON, or validation violation
 *   causes the case to route immediately to MANUAL_REVIEW.
 *
 * NO AUTOMATIC RETRIES:
 *   Per zero-automatic-retry decision (ADR-008 / PRD §4).
 *
 * NO GROUND-TRUTH LEAKAGE:
 *   Only VerifiedEvidenceSnapshot is consumed; ground_truth fields are prohibited.
 */
export async function runDraftingPipeline(
  options: RunDraftingOptions,
): Promise<DraftingPipelineResult> {
  const { disputeCase, snapshot } = options;
  const requestedAt = new Date().toISOString();

  // IMMUTABILITY CHECK PREPARATION: Snapshot deep copy before call
  const snapshotBefore = JSON.stringify(snapshot);

  // 1. Resolve client
  let client: GroqDraftClient;
  if (options.client) {
    client = options.client;
  } else {
    const clientRes = createGroqClient();
    if (!clientRes.ok) {
      // Missing API key or config error -> fail closed to MANUAL_REVIEW
      const prevState = disputeCase.current_state;
      transition(disputeCase.current_state, "MANUAL_REVIEW");
      disputeCase.current_state = "MANUAL_REVIEW";
      const failVal: ValidationResult = {
        passed: false,
        unsupported_claims: [clientRes.detail],
        reason: clientRes.reason,
      };
      disputeCase.validation_result = failVal;

      options.auditLogger?.append({
        dispute_id: disputeCase.dispute_id,
        event_type: "LLM_API_FAILURE",
        previous_state: prevState,
        next_state: "MANUAL_REVIEW",
        validation_result: failVal,
        failure_reason: clientRes.detail,
      });

      return {
        dispute_id: disputeCase.dispute_id,
        success: false,
        final_state: "MANUAL_REVIEW",
        model_id: resolveModel(),
        temperature: resolveTemperature(),
        requested_at: requestedAt,
        validation_result: failVal,
        audit_note: `Client creation failed (${clientRes.reason}). ${AUDIT_EXCLUSION_SEMANTIC}`,
      };
    }
    client = clientRes.client;
  }

  const modelId = client.modelId;
  const temperature = client.temperature;

  // 2. Build constrained prompt
  const { systemInstruction, dataMessage } = buildPrompt(snapshot);

  // Log draft requested event if logger provided
  options.auditLogger?.append({
    dispute_id: disputeCase.dispute_id,
    event_type: "LLM_DRAFT_REQUESTED",
    previous_state: disputeCase.current_state,
    next_state: disputeCase.current_state,
    llm_prompt_metadata: { model_version: modelId, temperature },
  });

  // 3. Invoke LLM client with fail-closed error handling
  let rawResponse: string;
  try {
    rawResponse = await client.generateDraft(systemInstruction, dataMessage);
  } catch (err: unknown) {
    // Timeout, HTTP error, network failure, or empty response -> route to MANUAL_REVIEW
    const errMsg = err instanceof Error ? err.message : String(err);
    const prevState = disputeCase.current_state;

    // Transition state to MANUAL_REVIEW
    const trans = transition(disputeCase.current_state, "MANUAL_REVIEW");
    if (trans.ok) {
      disputeCase.current_state = "MANUAL_REVIEW";
    }

    const failVal: ValidationResult = {
      passed: false,
      unsupported_claims: [`API execution error: ${errMsg}`],
      reason: "API_FAILURE",
    };
    disputeCase.validation_result = failVal;

    options.auditLogger?.append({
      dispute_id: disputeCase.dispute_id,
      event_type: "LLM_API_FAILURE",
      previous_state: prevState,
      next_state: "MANUAL_REVIEW",
      validation_result: failVal,
      failure_reason: errMsg,
    });

    // Verify source immutability
    const snapshotAfter = JSON.stringify(snapshot);
    if (snapshotBefore !== snapshotAfter) {
      throw new Error("CRITICAL SAFETY VIOLATION: VerifiedEvidenceSnapshot was mutated during drafting!");
    }

    return {
      dispute_id: disputeCase.dispute_id,
      success: false,
      final_state: "MANUAL_REVIEW",
      model_id: modelId,
      temperature,
      requested_at: requestedAt,
      validation_result: failVal,
      audit_note: `API error encountered: ${errMsg}. ${AUDIT_EXCLUSION_SEMANTIC}`,
    };
  }

  // 4. Deterministic validation (hard post-generation check)
  const validation: DraftValidationResult = validateDraft(rawResponse, snapshot);
  const valResult = toValidationResult(validation);

  // 5. Handle Validation Failure
  if (!validation.passed || !validation.parsed) {
    const prevState = disputeCase.current_state;

    // Transition state: SUFFICIENCY_ASSESSED → RESPONSE_DRAFTED → RESPONSE_VALIDATION_FAILED → MANUAL_REVIEW
    if (disputeCase.current_state === "SUFFICIENCY_ASSESSED") {
      transition(disputeCase.current_state, "RESPONSE_DRAFTED");
      disputeCase.current_state = "RESPONSE_DRAFTED";
    }
    if (disputeCase.current_state === "RESPONSE_DRAFTED") {
      transition(disputeCase.current_state, "RESPONSE_VALIDATION_FAILED");
      disputeCase.current_state = "RESPONSE_VALIDATION_FAILED";
    }
    if (disputeCase.current_state === "RESPONSE_VALIDATION_FAILED") {
      transition(disputeCase.current_state, "MANUAL_REVIEW");
      disputeCase.current_state = "MANUAL_REVIEW";
    }

    disputeCase.validation_result = valResult;
    // Exclude invalid draft from case.llm_draft
    delete disputeCase.llm_draft;

    options.auditLogger?.append({
      dispute_id: disputeCase.dispute_id,
      event_type: "POST_GEN_VALIDATION_FAILED",
      previous_state: prevState,
      next_state: "MANUAL_REVIEW",
      llm_output: rawResponse, // Retained in audit log even if rejected
      validation_result: valResult,
      failure_reason: valResult.reason ?? "VALIDATION_FAILED",
    });

    // Verify source immutability
    const snapshotAfter = JSON.stringify(snapshot);
    if (snapshotBefore !== snapshotAfter) {
      throw new Error("CRITICAL SAFETY VIOLATION: VerifiedEvidenceSnapshot was mutated during drafting!");
    }

    return {
      dispute_id: disputeCase.dispute_id,
      success: false,
      final_state: "MANUAL_REVIEW",
      model_id: modelId,
      temperature,
      requested_at: requestedAt,
      validation_result: valResult,
      raw_llm_output: rawResponse,
      audit_note: AUDIT_EXCLUSION_SEMANTIC,
    };
  }

  // 6. Handle Valid Response
  // Valid transitions: SUFFICIENCY_ASSESSED → RESPONSE_DRAFTED → RESPONSE_VALIDATED → HUMAN_APPROVAL_REQUIRED
  const startState = disputeCase.current_state;
  let currentState = disputeCase.current_state;

  if (currentState === "SUFFICIENCY_ASSESSED") {
    const t1 = transition(currentState, "RESPONSE_DRAFTED");
    if (t1.ok) currentState = "RESPONSE_DRAFTED";
  }

  if (currentState === "RESPONSE_DRAFTED") {
    const t2 = transition(currentState, "RESPONSE_VALIDATED");
    if (t2.ok) currentState = "RESPONSE_VALIDATED";
  }

  if (currentState === "RESPONSE_VALIDATED") {
    const t3 = transition(currentState, "HUMAN_APPROVAL_REQUIRED");
    if (t3.ok) currentState = "HUMAN_APPROVAL_REQUIRED";
  }

  disputeCase.current_state = currentState;

  const draftResult: LLMDraftResult = {
    text: validation.parsed.narrative,
    model_version: modelId,
    temperature,
    requested_at: requestedAt,
  };

  disputeCase.llm_draft = draftResult;
  disputeCase.validation_result = valResult;

  options.auditLogger?.append({
    dispute_id: disputeCase.dispute_id,
    event_type: "POST_GEN_VALIDATION_PASSED",
    previous_state: startState,
    next_state: currentState,
    llm_output: validation.parsed.narrative,
    validation_result: valResult,
  });

  // Verify source immutability
  const snapshotAfter = JSON.stringify(snapshot);
  if (snapshotBefore !== snapshotAfter) {
    throw new Error("CRITICAL SAFETY VIOLATION: VerifiedEvidenceSnapshot was mutated during drafting!");
  }

  return {
    dispute_id: disputeCase.dispute_id,
    success: true,
    final_state: currentState,
    model_id: modelId,
    temperature,
    requested_at: requestedAt,
    llm_draft: draftResult,
    validation_result: valResult,
    raw_llm_output: rawResponse,
    audit_note: "Draft generated and validated successfully. Awaiting human approval.",
  };
}
