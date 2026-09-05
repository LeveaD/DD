/**
 * Draft Validator — Milestone 4 (Post-Generation Hard Validator)
 *
 * Deterministically validates the structured JSON output from the Groq
 * drafting layer against the VerifiedEvidenceSnapshot.
 *
 * Validation is DETERMINISTIC — no LLM judge, no probabilistic scoring.
 *
 * Checks performed (per ARCHITECTURE.md §7):
 *   1. Structural validity: required fields exist with correct types.
 *   2. Entity correctness: transaction_id, user_id, amount, currency,
 *      transaction_date, transaction_ip match the snapshot exactly.
 *   3. Evidence support: consumption and TOS fields match or are null.
 *   4. Semantic restrictions: narrative does not contain prohibited
 *      fraud-certainty, intent-assertion, or legal-conclusion phrases.
 *   5. Ground-truth isolation: output does not reference evaluation labels.
 *
 * A single violation fails the entire draft.
 * Rejected output is retained for audit logging; it is excluded from
 * the final evidence package and cannot progress through the workflow.
 *
 * Compatible with Evaluation B fault classes:
 *   DATE_MUTATION, IP_FABRICATION, AMOUNT_ALTERATION,
 *   EMAIL_HALLUCINATION, TRANSACTION_ID_HALLUCINATION,
 *   UNSUPPORTED_INTENT_CLAIM.
 */

import type { VerifiedEvidenceSnapshot, ValidationResult } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Parsed draft shape (internal)
// ---------------------------------------------------------------------------

export interface ParsedDraft {
  transaction_id: string;
  user_id: string;
  transaction_date: string;
  amount: number;
  currency: string;
  tos_version: string | null;
  tos_accepted_at: string | null;
  consumption_resource: string | null;
  consumption_timestamp: string | null;
  transaction_ip: string | null;
  narrative: string;
}

// ---------------------------------------------------------------------------
// Prohibited semantic phrases (semantic safety check)
// ---------------------------------------------------------------------------

/**
 * Prohibited phrases that assert fraud certainty, customer intent,
 * or legal conclusions.
 *
 * Per PRD §3 and ARCHITECTURE.md §7:
 *   "Do NOT state or imply legal conclusions, customer intent, or
 *   guaranteed fraud proof."
 */
const PROHIBITED_PHRASES: readonly string[] = [
  "intentionally committed fraud",
  "intentionally defrauded",
  "deliberately committed",
  "committed fraud",
  "customer is guilty",
  "customer is fraudulent",
  "customer definitely",
  "provably fraudulent",
  "criminal activity",
  "criminal fraud",
  "legally liable",
  "legal liability",
  "proved fraud",
  "proven fraud",
  "is a fraudster",
  "intent to defraud",
  "bad faith",
  "knowingly filed a false",
  "knowingly filed false",
] as const;

/**
 * Evaluation label phrases that must never appear in an LLM-generated draft.
 * These represent ground-truth leakage from the evaluation dataset.
 */
const EVAL_LABEL_PHRASES: readonly string[] = [
  "ground_truth",
  "DEFENDABLE",
  "NOT_DEFENDABLE",
  "ORACLE_LABEL",
  "EvalGroundTruth",
  "eval_a_",
  "eval_b_",
] as const;

// ---------------------------------------------------------------------------
// Structural parser
// ---------------------------------------------------------------------------

/**
 * Parse and structurally validate raw JSON string from the Groq response.
 * Returns null if parsing fails or required fields are missing/wrong type.
 */
export function parseDraftJson(
  raw: string,
): { ok: true; draft: ParsedDraft } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["Response is not valid JSON"] };
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, errors: ["Response is not a JSON object"] };
  }

  const rec = obj as Record<string, unknown>;

  // Required string fields
  const requiredStrings: (keyof ParsedDraft)[] = [
    "transaction_id",
    "user_id",
    "transaction_date",
    "currency",
    "narrative",
  ];
  for (const field of requiredStrings) {
    if (typeof rec[field] !== "string" || (rec[field] as string).trim() === "") {
      errors.push(`Required field "${field}" is missing or not a non-empty string`);
    }
  }

  // Required numeric field
  if (typeof rec["amount"] !== "number" || !isFinite(rec["amount"] as number)) {
    errors.push(`Required field "amount" is missing or not a finite number`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Nullable string fields
  function nullableString(key: string): string | null {
    const v = rec[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v;
    return null; // wrong type — treated as absent
  }

  const draft: ParsedDraft = {
    transaction_id: rec["transaction_id"] as string,
    user_id: rec["user_id"] as string,
    transaction_date: rec["transaction_date"] as string,
    amount: rec["amount"] as number,
    currency: rec["currency"] as string,
    tos_version: nullableString("tos_version"),
    tos_accepted_at: nullableString("tos_accepted_at"),
    consumption_resource: nullableString("consumption_resource"),
    consumption_timestamp: nullableString("consumption_timestamp"),
    transaction_ip: nullableString("transaction_ip"),
    narrative: rec["narrative"] as string,
  };

  return { ok: true, draft };
}

// ---------------------------------------------------------------------------
// Entity validator
// ---------------------------------------------------------------------------

/**
 * Verify that every factual entity in the parsed draft matches the snapshot exactly.
 * Returns a list of entity violations (empty = no violations).
 */
export function validateEntities(
  draft: ParsedDraft,
  snapshot: VerifiedEvidenceSnapshot,
): string[] {
  const violations: string[] = [];

  // Transaction ID
  if (snapshot.transaction !== null) {
    if (draft.transaction_id !== snapshot.transaction.transaction_id) {
      violations.push(
        `transaction_id mismatch: draft="${draft.transaction_id}" snapshot="${snapshot.transaction.transaction_id}"`,
      );
    }

    // Amount (major currency units — must match exactly)
    if (draft.amount !== snapshot.transaction.amount) {
      violations.push(
        `amount mismatch: draft=${draft.amount} snapshot=${snapshot.transaction.amount} (major currency units)`,
      );
    }

    // Currency
    if (draft.currency !== snapshot.transaction.currency) {
      violations.push(
        `currency mismatch: draft="${draft.currency}" snapshot="${snapshot.transaction.currency}"`,
      );
    }

    // Transaction date
    if (draft.transaction_date !== snapshot.transaction.timestamp) {
      violations.push(
        `transaction_date mismatch: draft="${draft.transaction_date}" snapshot="${snapshot.transaction.timestamp}"`,
      );
    }

    // Transaction IP (if draft includes it, it must match)
    if (
      draft.transaction_ip !== null &&
      draft.transaction_ip !== snapshot.transaction.ip_address
    ) {
      violations.push(
        `transaction_ip mismatch: draft="${draft.transaction_ip}" snapshot="${snapshot.transaction.ip_address}"`,
      );
    }
  }

  // User ID
  if (snapshot.user !== null) {
    if (draft.user_id !== snapshot.user.user_id) {
      violations.push(
        `user_id mismatch: draft="${draft.user_id}" snapshot="${snapshot.user.user_id}"`,
      );
    }
  }

  // TOS version (if draft claims a version, it must match)
  if (draft.tos_version !== null && snapshot.tos_log !== null) {
    if (draft.tos_version !== snapshot.tos_log.tos_version) {
      violations.push(
        `tos_version mismatch: draft="${draft.tos_version}" snapshot="${snapshot.tos_log.tos_version}"`,
      );
    }
  }
  if (draft.tos_version !== null && snapshot.tos_log === null) {
    violations.push(
      `tos_version "${draft.tos_version}" is claimed but no TOS log exists in snapshot`,
    );
  }

  // TOS accepted_at
  if (draft.tos_accepted_at !== null && snapshot.tos_log !== null) {
    if (draft.tos_accepted_at !== snapshot.tos_log.accepted_at) {
      violations.push(
        `tos_accepted_at mismatch: draft="${draft.tos_accepted_at}" snapshot="${snapshot.tos_log.accepted_at}"`,
      );
    }
  }
  if (draft.tos_accepted_at !== null && snapshot.tos_log === null) {
    violations.push(
      `tos_accepted_at claimed but no TOS log in snapshot`,
    );
  }

  // Consumption resource
  if (draft.consumption_resource !== null && snapshot.consumption_log !== null) {
    if (draft.consumption_resource !== snapshot.consumption_log.resource_id) {
      violations.push(
        `consumption_resource mismatch: draft="${draft.consumption_resource}" snapshot="${snapshot.consumption_log.resource_id}"`,
      );
    }
  }
  if (draft.consumption_resource !== null && snapshot.consumption_log === null) {
    violations.push(
      `consumption_resource claimed but no consumption log in snapshot`,
    );
  }

  // Consumption timestamp
  if (draft.consumption_timestamp !== null && snapshot.consumption_log !== null) {
    if (draft.consumption_timestamp !== snapshot.consumption_log.consumed_at) {
      violations.push(
        `consumption_timestamp mismatch: draft="${draft.consumption_timestamp}" snapshot="${snapshot.consumption_log.consumed_at}"`,
      );
    }
  }
  if (draft.consumption_timestamp !== null && snapshot.consumption_log === null) {
    violations.push(
      `consumption_timestamp claimed but no consumption log in snapshot`,
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Semantic / narrative validator
// ---------------------------------------------------------------------------

/**
 * Check narrative for prohibited phrases (fraud certainty, intent claims,
 * legal conclusions, evaluation label references).
 */
export function validateSemantics(draft: ParsedDraft): string[] {
  const violations: string[] = [];
  const narrativeLower = draft.narrative.toLowerCase();
  const narrativeRaw = draft.narrative;

  for (const phrase of PROHIBITED_PHRASES) {
    if (narrativeLower.includes(phrase.toLowerCase())) {
      violations.push(`Prohibited semantic claim detected: "${phrase}"`);
    }
  }

  for (const phrase of EVAL_LABEL_PHRASES) {
    if (narrativeRaw.includes(phrase)) {
      violations.push(`Evaluation label reference detected in draft: "${phrase}"`);
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main validation entry point
// ---------------------------------------------------------------------------

export interface DraftValidationResult {
  /** Mirrors ValidationResult for schema compatibility */
  passed: boolean;
  unsupported_claims: string[];
  reason?: string;
  /** Parsed draft (available even if validation failed, for audit logging) */
  parsed: ParsedDraft | null;
}

/**
 * Fully validate a raw Groq response string against the verified evidence snapshot.
 *
 * Steps:
 *   1. Parse JSON structure
 *   2. Validate entity correctness
 *   3. Validate semantic safety
 *
 * A single failure in any step returns passed:false.
 * The parsed draft (if available) is always returned for audit logging.
 *
 * @param rawResponse - raw string from Groq API
 * @param snapshot - verified evidence snapshot (read-only)
 */
export function validateDraft(
  rawResponse: string,
  snapshot: VerifiedEvidenceSnapshot,
): DraftValidationResult {
  // Step 1: Parse
  const parseResult = parseDraftJson(rawResponse);
  if (!parseResult.ok) {
    return {
      passed: false,
      unsupported_claims: parseResult.errors,
      reason: "STRUCTURAL_PARSE_FAILURE",
      parsed: null,
    };
  }

  const { draft } = parseResult;
  const allViolations: string[] = [];

  // Step 2: Entity validation
  const entityViolations = validateEntities(draft, snapshot);
  allViolations.push(...entityViolations);

  // Step 3: Semantic safety
  const semanticViolations = validateSemantics(draft);
  allViolations.push(...semanticViolations);

  if (allViolations.length > 0) {
    return {
      passed: false,
      unsupported_claims: allViolations,
      reason: entityViolations.length > 0
        ? "UNSUPPORTED_ENTITY_DETECTED"
        : "UNSUPPORTED_SEMANTIC_CLAIM",
      parsed: draft,
    };
  }

  return {
    passed: true,
    unsupported_claims: [],
    parsed: draft,
  };
}

/** Convenience adapter to convert DraftValidationResult → ValidationResult */
export function toValidationResult(r: DraftValidationResult): ValidationResult {
  const result: ValidationResult = {
    passed: r.passed,
    unsupported_claims: r.unsupported_claims,
  };
  if (r.reason !== undefined) {
    result.reason = r.reason;
  }
  return result;
}
