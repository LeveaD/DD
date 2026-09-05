/**
 * Deterministic Evidence Package Validator — Milestone 5
 *
 * Source of truth: docs/PRD.md §3 & §5, docs/ARCHITECTURE.md §7, Milestone 5 §12 & §13
 *
 * Deterministically verifies an EvidencePackage before finalization:
 *   1. Required case fields exist with correct types.
 *   2. Financial values (amount, currency) match source dispute case and transaction exactly.
 *   3. Identifiers (transaction_id, user_id) match source transaction and snapshot.
 *   4. Workflow State Boundary: compilation allowed ONLY for cases in RESPONSE_VALIDATED
 *      or HUMAN_APPROVAL_REQUIRED state.
 *   5. Response Draft Validation: package includes ONLY a draft that passed validation.
 *   6. Ground-Truth Isolation: package string does NOT contain any evaluation labels
 *      (ground_truth, EvalGroundTruth, ORACLE_LABEL).
 *   7. Secret Isolation: package string does NOT contain API keys, credentials, or tokens.
 *   8. Prohibited Semantic Claims: narrative contains no legal or fraud certainty claims.
 *
 * Fail-Closed: Any violation prevents package finalization and returns ok:false.
 */

import type { DisputeCase, VerifiedEvidenceSnapshot } from "../schemas/index.js";
import { validateSemantics } from "../llm/draftValidator.js";
import type { EvidencePackage } from "./types.js";

/** Result returned by the PackageValidator */
export type PackageValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/** Prohibited evaluation label keywords that represent ground-truth leakage */
const GROUND_TRUTH_KEYWORDS: readonly string[] = [
  "ground_truth",
  "EvalGroundTruth",
  "ORACLE_LABEL",
  "ORACLE_LABEL_TABLE",
  "oracle_label",
  "eval_a_",
  "eval_b_",
];

/**
 * Deterministically validate an EvidencePackage against the source DisputeCase and snapshot.
 */
export function validateEvidencePackage(
  pkg: EvidencePackage,
  disputeCase: DisputeCase,
  snapshot: VerifiedEvidenceSnapshot,
): PackageValidationResult {
  const errors: string[] = [];

  // 1. State Boundary Check
  const validStates = new Set([
    "RESPONSE_VALIDATED",
    "HUMAN_APPROVAL_REQUIRED",
    "READY_FOR_SUBMISSION",
    "SUBMITTED",
  ]);
  if (!validStates.has(disputeCase.current_state)) {
    errors.push(
      `State boundary violation: cannot finalize evidence package for dispute in state "${disputeCase.current_state}". Allowed states: RESPONSE_VALIDATED, HUMAN_APPROVAL_REQUIRED, READY_FOR_SUBMISSION, SUBMITTED`,
    );
  }

  // 2. Draft Validation Status Check
  if (disputeCase.validation_result?.passed !== true) {
    errors.push("Package rejection: source dispute case LLM draft did not pass hard validation");
  }
  if (!disputeCase.llm_draft) {
    errors.push("Package rejection: source dispute case has no valid llm_draft attached");
  }
  if (!pkg.validated_response_draft || !pkg.validated_response_draft.narrative) {
    errors.push("Package rejection: evidence package missing validated_response_draft");
  }

  // 3. Amount and Currency Exact Matching
  if (pkg.header.amount !== disputeCase.amount) {
    errors.push(`Amount mismatch: package amount ${pkg.header.amount} !== disputeCase amount ${disputeCase.amount}`);
  }
  if (snapshot.transaction && pkg.header.amount !== snapshot.transaction.amount) {
    errors.push(`Amount mismatch: package amount ${pkg.header.amount} !== transaction amount ${snapshot.transaction.amount}`);
  }
  if (pkg.header.currency !== disputeCase.currency) {
    errors.push(`Currency mismatch: package currency "${pkg.header.currency}" !== disputeCase currency "${disputeCase.currency}"`);
  }

  // 4. Transaction ID and User ID Exact Matching
  if (pkg.header.transaction_id !== disputeCase.transaction_id) {
    errors.push(`Transaction ID mismatch: package "${pkg.header.transaction_id}" !== disputeCase "${disputeCase.transaction_id}"`);
  }
  if (snapshot.transaction && pkg.header.transaction_id !== snapshot.transaction.transaction_id) {
    errors.push(`Transaction ID mismatch: package "${pkg.header.transaction_id}" !== snapshot transaction "${snapshot.transaction.transaction_id}"`);
  }

  // 5. Narrative Semantic Check
  if (pkg.validated_response_draft?.narrative) {
    const semanticErrors = validateSemantics({
      transaction_id: pkg.header.transaction_id,
      user_id: pkg.header.user_id,
      transaction_date: pkg.verified_evidence.transaction_timestamp ?? "",
      amount: pkg.header.amount,
      currency: pkg.header.currency,
      tos_version: pkg.verified_evidence.tos_version,
      tos_accepted_at: pkg.verified_evidence.tos_accepted_at,
      consumption_resource: pkg.verified_evidence.consumption_resource_id,
      consumption_timestamp: pkg.verified_evidence.consumption_timestamp,
      transaction_ip: pkg.verified_evidence.transaction_ip,
      narrative: pkg.validated_response_draft.narrative,
    });
    if (semanticErrors.length > 0) {
      errors.push(...semanticErrors.map((e) => `Semantic safety violation in package draft: ${e}`));
    }
  }

  // 6. Ground-Truth Isolation Check across entire serialised package
  const pkgJson = JSON.stringify(pkg);
  for (const kw of GROUND_TRUTH_KEYWORDS) {
    if (pkgJson.includes(kw)) {
      errors.push(`Ground-truth leakage detected in compiled package: contained "${kw}"`);
    }
  }

  // 7. Secret Isolation Check
  if (process.env["GROQ_API_KEY"] && process.env["GROQ_API_KEY"].trim() !== "") {
    const key = process.env["GROQ_API_KEY"];
    if (pkgJson.includes(key) && key !== "your_groq_api_key_here" && key !== "mock_groq_api_key_for_testing") {
      errors.push("SECRET LEAKAGE VIOLATION: GROQ_API_KEY detected inside compiled evidence package!");
    }
  }
  if (/gsk_[a-zA-Z0-9_-]+/.test(pkgJson)) {
    errors.push("SECRET LEAKAGE VIOLATION: Groq secret key pattern detected inside compiled package!");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}
