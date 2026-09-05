/**
 * Independent Evaluation A Scenario Oracle
 *
 * CRITICAL: This module is COMPLETELY ISOLATED from production routing logic.
 *
 * It MUST NOT import or call:
 *   - isSufficient()
 *   - hasCriticalContradiction()
 *   - hasSufficientPositiveSignals()
 *   - any production evidence assessment function
 *   - any workflow state machine
 *   - any future dispute decision engine
 *
 * Its sole job is to translate a ScenarioSpec (an independently authored
 * description of what kind of evidence exists for a synthetic case) into
 * a ground-truth label: DEFENDABLE | NOT_DEFENDABLE.
 *
 * Data flow (per EVALUATION.md §2.1):
 *
 *   ScenarioSpec
 *       ↓
 *   scenarioOracle()           ← THIS MODULE ONLY
 *       ↓
 *   EvalGroundTruth (label)
 *
 * Separately:
 *
 *   same synthetic case evidence
 *       ↓
 *   production routing logic   ← FUTURE MILESTONE 3
 *       ↓
 *   predicted classification
 *
 * The evaluator (Milestone 6) will compare oracle label vs production prediction.
 */

import type { EvalGroundTruth } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Scenario specification — the independently authored description of a case
// ---------------------------------------------------------------------------

/**
 * The type of scenario, independently authored before any routing logic exists.
 *
 * FULL_EVIDENCE: All supporting signals present and temporally consistent.
 *   → ground truth = DEFENDABLE
 *
 * MISSING_IP: Identity matches, TOS and consumption exist, but IP consistency
 *   signal is absent (no matching IP log).
 *   → ground truth = NOT_DEFENDABLE  (insufficient positive signals)
 *
 * MISSING_CONSUMPTION: Identity matches, TOS and IP exist, but no post-purchase
 *   consumption log was recorded.
 *   → ground truth = NOT_DEFENDABLE  (insufficient positive signals)
 *
 * MISSING_TOS: Identity matches, IP and consumption exist, but no TOS record.
 *   → ground truth = NOT_DEFENDABLE  (insufficient positive signals)
 *
 * CONTRADICTORY_TIMESTAMPS: Identity matches, signals appear present, but the
 *   event sequence is logically impossible (consumption precedes purchase, or
 *   TOS accepted after transaction).
 *   → ground truth = NOT_DEFENDABLE  (critical contradiction)
 *
 * IDENTITY_MISMATCH: The user_id in the dispute does not match the transaction.
 *   → ground truth = NOT_DEFENDABLE  (critical contradiction)
 *
 * PARTIAL_IP_MISMATCH: Identity matches, TOS and consumption exist, but the
 *   IP address used at consumption differs from checkout IP.
 *   → ground truth = NOT_DEFENDABLE  (insufficient positive signals)
 *
 * MISSING_EVIDENCE_ENTIRELY: Transaction exists but no telemetry records at all.
 *   → ground truth = NOT_DEFENDABLE  (insufficient positive signals)
 */
export type ScenarioType =
  | "FULL_EVIDENCE"
  | "MISSING_IP"
  | "MISSING_CONSUMPTION"
  | "MISSING_TOS"
  | "CONTRADICTORY_TIMESTAMPS"
  | "IDENTITY_MISMATCH"
  | "PARTIAL_IP_MISMATCH"
  | "MISSING_EVIDENCE_ENTIRELY";

/**
 * An independently authored specification describing what kind of evidence
 * exists for this synthetic case.  Written by the scenario oracle before
 * any production routing code exists.
 */
export interface ScenarioSpec {
  scenarioType: ScenarioType;
  /** Human-readable description for traceability */
  description: string;
}

// ---------------------------------------------------------------------------
// Oracle label table — statically defined, not derived from production logic
// ---------------------------------------------------------------------------

/**
 * Maps each independently authored ScenarioType to its ground-truth label.
 *
 * This mapping is the definitive "independently authored scenario truth"
 * described in the Milestone 2 specification.  It encodes the intent of
 * each scenario type without calling any production routing function.
 *
 * DEFENDABLE scenarios: cases where the scenario explicitly states that
 * all required supporting evidence is present and temporally consistent.
 *
 * NOT_DEFENDABLE scenarios: cases where the scenario explicitly states that
 * evidence is insufficient, contradictory, or entirely missing.
 */
const ORACLE_LABEL_TABLE: Record<ScenarioType, EvalGroundTruth> = {
  FULL_EVIDENCE:             "DEFENDABLE",
  MISSING_IP:                "NOT_DEFENDABLE",
  MISSING_CONSUMPTION:       "NOT_DEFENDABLE",
  MISSING_TOS:               "NOT_DEFENDABLE",
  CONTRADICTORY_TIMESTAMPS:  "NOT_DEFENDABLE",
  IDENTITY_MISMATCH:         "NOT_DEFENDABLE",
  PARTIAL_IP_MISMATCH:       "NOT_DEFENDABLE",
  MISSING_EVIDENCE_ENTIRELY: "NOT_DEFENDABLE",
};

// ---------------------------------------------------------------------------
// Oracle function
// ---------------------------------------------------------------------------

/**
 * Assign a ground-truth label to a scenario specification.
 *
 * This function is the ONLY authorised source of Evaluation A ground truth.
 * It reads from ORACLE_LABEL_TABLE — a statically defined mapping —
 * and never invokes production routing logic.
 *
 * @param spec - the independently authored scenario specification
 * @returns the pre-established ground-truth label for the evaluation dataset
 */
export function scenarioOracle(spec: ScenarioSpec): EvalGroundTruth {
  return ORACLE_LABEL_TABLE[spec.scenarioType];
}

// ---------------------------------------------------------------------------
// Scenario library — the set of independently authored scenario specs
// ---------------------------------------------------------------------------

/**
 * All scenario types available for Evaluation A dataset generation.
 * Used by the dataset generator to assign scenario types to cases.
 */
export const ALL_SCENARIO_TYPES: readonly ScenarioType[] = [
  "FULL_EVIDENCE",
  "MISSING_IP",
  "MISSING_CONSUMPTION",
  "MISSING_TOS",
  "CONTRADICTORY_TIMESTAMPS",
  "IDENTITY_MISMATCH",
  "PARTIAL_IP_MISMATCH",
  "MISSING_EVIDENCE_ENTIRELY",
] as const;

/**
 * Scenario descriptions for traceability. Authored independently.
 */
export const SCENARIO_DESCRIPTIONS: Record<ScenarioType, string> = {
  FULL_EVIDENCE:
    "All supporting signals present: identity match, consistent IP, TOS accepted before purchase, post-purchase consumption with valid timestamps.",
  MISSING_IP:
    "Identity matches transaction but no session/login IP log matching the checkout IP is present.",
  MISSING_CONSUMPTION:
    "Identity matches and TOS accepted, but no post-purchase consumption log recorded for the transaction.",
  MISSING_TOS:
    "Identity matches and consumption log exists, but no Terms-of-Service acceptance record is present.",
  CONTRADICTORY_TIMESTAMPS:
    "Signals appear present but event timestamps are logically impossible: consumption recorded before purchase, or TOS accepted after transaction.",
  IDENTITY_MISMATCH:
    "The user_id recorded in the chargeback dispute does not match the user_id on the original transaction record.",
  PARTIAL_IP_MISMATCH:
    "Identity matches and TOS/consumption exist, but the IP address at consumption differs from the checkout IP address.",
  MISSING_EVIDENCE_ENTIRELY:
    "Transaction exists in the database but no associated telemetry records (IP logs, TOS logs, consumption logs) are present.",
};

/** Helper: get the full ScenarioSpec for a given ScenarioType */
export function makeScenarioSpec(scenarioType: ScenarioType): ScenarioSpec {
  return {
    scenarioType,
    description: SCENARIO_DESCRIPTIONS[scenarioType],
  };
}
