/**
 * Evaluation Dataset Generator — Milestone 2
 *
 * Generates:
 *   - Evaluation A: 150 cases (105 DEV + 45 HOLDOUT), seed 42
 *   - Evaluation B: 200 cases (100 CLEAN + 100 FAULT_INJECTED)
 *
 * Determinism guarantee: same seed + same generator version → identical output.
 *
 * CRITICAL: Evaluation A ground truth is assigned by scenarioOracle()
 * BEFORE any production routing logic is invoked.
 * Production routing is NOT used here.
 *
 * Data leakage prevention: EvidenceSignals / VerifiedEvidenceSnapshot
 * objects do NOT receive a ground_truth field.
 */

import type {
  EvalACase,
  EvalBCase,
  EvalSplit,
  EvalBSampleType,
  EvidenceSignals,
  VerifiedEvidenceSnapshot,
  User,
  Transaction,
  IPLog,
  TOSLog,
  ConsumptionLog,
} from "../schemas/index.js";

import { createRng } from "./rng.js";
import { generateMerchantDb } from "./merchantDb.js";
import {
  scenarioOracle,
  makeScenarioSpec,
  ALL_SCENARIO_TYPES,
  type ScenarioType,
} from "./scenarioOracle.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EVAL_A_SEED = 42;
export const EVAL_A_TOTAL = 150;
export const EVAL_A_DEV_COUNT = 105;
export const EVAL_A_HOLDOUT_COUNT = 45;

export const EVAL_B_TOTAL = 200;
export const EVAL_B_CLEAN_COUNT = 100;
export const EVAL_B_FAULT_COUNT = 100;

// Seed offset for Eval B to keep it independent from Eval A
const EVAL_B_SEED_OFFSET = 1000;

// ---------------------------------------------------------------------------
// §1  Fault injection types for Evaluation B
// ---------------------------------------------------------------------------

export type FaultType =
  | "DATE_MUTATION"
  | "IP_FABRICATION"
  | "AMOUNT_ALTERATION"
  | "EMAIL_HALLUCINATION"
  | "TRANSACTION_ID_HALLUCINATION"
  | "UNSUPPORTED_INTENT_CLAIM";

const FAULT_TYPES: readonly FaultType[] = [
  "DATE_MUTATION",
  "IP_FABRICATION",
  "AMOUNT_ALTERATION",
  "EMAIL_HALLUCINATION",
  "TRANSACTION_ID_HALLUCINATION",
  "UNSUPPORTED_INTENT_CLAIM",
] as const;

// ---------------------------------------------------------------------------
// §2  Evidence snapshot builders — per ScenarioType
//     These build raw evidence structures.
//     They do NOT call production routing or isSufficient().
//     They do NOT add a ground_truth field.
// ---------------------------------------------------------------------------

interface EvidenceBundle {
  signals: EvidenceSignals;
  snapshot: VerifiedEvidenceSnapshot;
}

/**
 * Date helper: offset an ISO-8601 string by ±minutes.
 * Only used for controlled timestamp mutation.
 */
function offsetTimestamp(isoStr: string, offsetMinutes: number): string {
  const ms = new Date(isoStr).getTime();
  return new Date(ms + offsetMinutes * 60_000).toISOString();
}

/**
 * Build evidence bundle matching a ScenarioType.
 * The bundle contains the raw EvidenceSignals and VerifiedEvidenceSnapshot
 * for this case.  It does NOT contain a ground_truth label.
 */
function buildEvidenceBundle(
  scenarioType: ScenarioType,
  user: User,
  transaction: Transaction,
  ipLogs: IPLog[],
  tosLog: TOSLog,
  consumptionLog: ConsumptionLog,
  altIp: string,
): EvidenceBundle {
  switch (scenarioType) {
    case "FULL_EVIDENCE": {
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: true,
        post_purchase_consumption: true,
        tos_accepted: true,
        temporal_sequence_valid: true,
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: ipLogs,
        tos_log: tosLog,
        consumption_log: consumptionLog,
        found: true,
      };
      return { signals, snapshot };
    }

    case "MISSING_IP": {
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: false,   // no matching IP log
        post_purchase_consumption: true,
        tos_accepted: true,
        temporal_sequence_valid: true,
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: [],             // no IP logs present
        tos_log: tosLog,
        consumption_log: consumptionLog,
        found: true,
      };
      return { signals, snapshot };
    }

    case "MISSING_CONSUMPTION": {
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: true,
        post_purchase_consumption: false, // no consumption record
        tos_accepted: true,
        temporal_sequence_valid: false,   // temporal chain broken without consumption
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: ipLogs,
        tos_log: tosLog,
        consumption_log: null,   // explicitly absent
        found: true,
      };
      return { signals, snapshot };
    }

    case "MISSING_TOS": {
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: true,
        post_purchase_consumption: true,
        tos_accepted: false,     // no TOS record
        temporal_sequence_valid: false,  // tos_accepted false breaks temporal check
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: ipLogs,
        tos_log: null,           // explicitly absent
        consumption_log: consumptionLog,
        found: true,
      };
      return { signals, snapshot };
    }

    case "CONTRADICTORY_TIMESTAMPS": {
      // Consumption timestamp is BEFORE the transaction — logically impossible
      const badConsumption: ConsumptionLog = {
        ...consumptionLog,
        consumed_at: offsetTimestamp(transaction.timestamp, -30), // 30 min before txn
      };
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: true,
        post_purchase_consumption: true,
        tos_accepted: true,
        temporal_sequence_valid: false, // critical contradiction
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: ipLogs,
        tos_log: tosLog,
        consumption_log: badConsumption,
        found: true,
      };
      return { signals, snapshot };
    }

    case "IDENTITY_MISMATCH": {
      // A different user is referenced on the transaction
      const mismatchedTransaction: Transaction = {
        ...transaction,
        user_id: "usr_MISMATCH_999", // does not match user.user_id
      };
      const signals: EvidenceSignals = {
        identity_match: false,   // critical contradiction
        ip_consistency: true,
        post_purchase_consumption: true,
        tos_accepted: true,
        temporal_sequence_valid: true,
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction: mismatchedTransaction,
        ip_logs: ipLogs,
        tos_log: tosLog,
        consumption_log: consumptionLog,
        found: true,
      };
      return { signals, snapshot };
    }

    case "PARTIAL_IP_MISMATCH": {
      // Consumption logged from a different IP than checkout
      const mismatchedConsumption: ConsumptionLog = {
        ...consumptionLog,
        ip_address: altIp, // different from transaction.ip_address
      };
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: false,  // IP at consumption ≠ checkout IP
        post_purchase_consumption: true,
        tos_accepted: true,
        temporal_sequence_valid: true,
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: ipLogs,
        tos_log: tosLog,
        consumption_log: mismatchedConsumption,
        found: true,
      };
      return { signals, snapshot };
    }

    case "MISSING_EVIDENCE_ENTIRELY": {
      const signals: EvidenceSignals = {
        identity_match: true,
        ip_consistency: false,
        post_purchase_consumption: false,
        tos_accepted: false,
        temporal_sequence_valid: false,
      };
      const snapshot: VerifiedEvidenceSnapshot = {
        user,
        transaction,
        ip_logs: [],
        tos_log: null,
        consumption_log: null,
        found: true,
      };
      return { signals, snapshot };
    }
  }
}

// ---------------------------------------------------------------------------
// §3  Evaluation A generator
// ---------------------------------------------------------------------------

/**
 * Scenario distribution for Eval A — ensures diverse coverage.
 * DEV and HOLDOUT use different distributions to avoid near-duplication.
 */
const DEV_SCENARIO_DISTRIBUTION: readonly ScenarioType[] = [
  // FULL_EVIDENCE: ~35% of DEV (37 cases) — defendable path
  ...Array<ScenarioType>(37).fill("FULL_EVIDENCE"),
  // NOT_DEFENDABLE varieties split across remaining ~65% (68 cases)
  ...Array<ScenarioType>(11).fill("MISSING_IP"),
  ...Array<ScenarioType>(11).fill("MISSING_CONSUMPTION"),
  ...Array<ScenarioType>(10).fill("MISSING_TOS"),
  ...Array<ScenarioType>(10).fill("CONTRADICTORY_TIMESTAMPS"),
  ...Array<ScenarioType>(9).fill("IDENTITY_MISMATCH"),
  ...Array<ScenarioType>(9).fill("PARTIAL_IP_MISMATCH"),
  ...Array<ScenarioType>(8).fill("MISSING_EVIDENCE_ENTIRELY"),
] as const;

// Verify count
const _devCheck: number = DEV_SCENARIO_DISTRIBUTION.length;
if (_devCheck !== EVAL_A_DEV_COUNT) {
  throw new Error(`DEV_SCENARIO_DISTRIBUTION length ${_devCheck} !== ${EVAL_A_DEV_COUNT}`);
}

const HOLDOUT_SCENARIO_DISTRIBUTION: readonly ScenarioType[] = [
  // FULL_EVIDENCE: ~33% of HOLDOUT (15 cases)
  ...Array<ScenarioType>(15).fill("FULL_EVIDENCE"),
  // NOT_DEFENDABLE varieties — different proportions than DEV (30 cases total)
  ...Array<ScenarioType>(5).fill("MISSING_IP"),
  ...Array<ScenarioType>(5).fill("MISSING_CONSUMPTION"),
  ...Array<ScenarioType>(5).fill("MISSING_TOS"),
  ...Array<ScenarioType>(5).fill("CONTRADICTORY_TIMESTAMPS"),
  ...Array<ScenarioType>(5).fill("IDENTITY_MISMATCH"),
  ...Array<ScenarioType>(5).fill("PARTIAL_IP_MISMATCH"),
  // Note: MISSING_EVIDENCE_ENTIRELY covered in DEV; omitted here to hit exact 45.
] as const;

const _holdoutCheck: number = HOLDOUT_SCENARIO_DISTRIBUTION.length;
if (_holdoutCheck !== EVAL_A_HOLDOUT_COUNT) {
  throw new Error(`HOLDOUT_SCENARIO_DISTRIBUTION length ${_holdoutCheck} !== ${EVAL_A_HOLDOUT_COUNT}`);
}

export interface EvalADataset {
  cases: EvalACase[];
  devCases: EvalACase[];
  holdoutCases: EvalACase[];
}

/**
 * Generate the canonical Evaluation A dataset.
 *
 * Ground truth is assigned by scenarioOracle() — NOT by production routing.
 * The oracle maps each ScenarioType to DEFENDABLE/NOT_DEFENDABLE based on
 * an independently authored static label table.
 *
 * Runtime evidence snapshots do NOT contain ground_truth fields.
 *
 * @param seed - must be 42 for the canonical dataset
 */
export function generateEvalADataset(seed: number = EVAL_A_SEED): EvalADataset {
  // Generate enough merchant bundles for all cases
  const { bundles } = generateMerchantDb(seed, EVAL_A_TOTAL);

  // Shuffle a copy of the scenario distribution arrays deterministically
  const rng = createRng(seed + 7); // offset to keep separate from DB seed
  const devScenarios = rng.shuffle([...DEV_SCENARIO_DISTRIBUTION]);
  const holdoutScenarios = rng.shuffle([...HOLDOUT_SCENARIO_DISTRIBUTION]);

  const allScenarios: Array<{ scenarioType: ScenarioType; split: EvalSplit }> = [
    ...devScenarios.map((s) => ({ scenarioType: s, split: "DEV" as EvalSplit })),
    ...holdoutScenarios.map((s) => ({ scenarioType: s, split: "HOLDOUT" as EvalSplit })),
  ];

  const altIpRng = createRng(seed + 13); // deterministic alt IPs

  const cases: EvalACase[] = allScenarios.map((entry, idx) => {
    const caseIdx = String(idx + 1).padStart(3, "0");
    const bundle = bundles[idx];
    if (!bundle) throw new Error(`No merchant bundle at index ${idx}`);

    const spec = makeScenarioSpec(entry.scenarioType);

    // Ground truth assigned by the INDEPENDENT oracle — not production routing
    const ground_truth = scenarioOracle(spec);

    // Build alternate IP for PARTIAL_IP_MISMATCH scenarios
    const altIp = `10.99.${altIpRng.nextInt(1, 254)}.${altIpRng.nextInt(1, 254)}`;

    // Build evidence (snapshot) — does NOT contain ground_truth
    const { signals, snapshot } = buildEvidenceBundle(
      entry.scenarioType,
      bundle.user,
      bundle.transaction,
      bundle.ipLogs,
      bundle.tosLog,
      bundle.consumptionLog,
      altIp,
    );

    const evalCase: EvalACase = {
      case_id: `eval_a_${caseIdx}`,
      seed,
      split: entry.split,
      // Synthetic evidence stored as plain object — no ground_truth field here
      synthetic_evidence: {
        scenario_type: entry.scenarioType,
        scenario_description: spec.description,
        evidence_signals: signals,
        snapshot,
      },
      // Ground truth: oracle-assigned, isolated from runtime inference
      ground_truth,
    };

    return evalCase;
  });

  const devCases = cases.filter((c) => c.split === "DEV");
  const holdoutCases = cases.filter((c) => c.split === "HOLDOUT");

  return { cases, devCases, holdoutCases };
}

// ---------------------------------------------------------------------------
// §4  Evaluation B generator
// ---------------------------------------------------------------------------

/**
 * Build a clean, accurate narrative from a merchant bundle.
 * This is a deterministic template — NOT an LLM call.
 * Used only to create baseline narratives for Eval B.
 */
function buildCleanNarrative(
  user: User,
  transaction: Transaction,
  tosLog: TOSLog,
  consumptionLog: ConsumptionLog,
): string {
  return (
    `On ${transaction.timestamp}, customer ${user.name} (${user.email}, ${user.user_id}) ` +
    `completed transaction ${transaction.transaction_id} for ${transaction.currency} ` +
    `${transaction.amount} via ${transaction.payment_method} from IP ${transaction.ip_address}. ` +
    `Terms of Service version ${tosLog.tos_version} were accepted at ${tosLog.accepted_at}. ` +
    `Post-purchase access to resource ${consumptionLog.resource_id} was recorded at ` +
    `${consumptionLog.consumed_at} from IP ${consumptionLog.ip_address}.`
  );
}

/**
 * Inject a controlled fault into a clean narrative.
 * The fault is deterministic and explicitly controlled.
 * No random LLM hallucinations are used.
 */
function injectFault(
  cleanNarrative: string,
  faultType: FaultType,
  transaction: Transaction,
  user: User,
): string {
  switch (faultType) {
    case "DATE_MUTATION":
      // Shift year to 2029 — a date clearly not in the snapshot
      return cleanNarrative.replace(/2026/g, "2029");

    case "IP_FABRICATION":
      // Replace IP with a fabricated, non-matching address
      return cleanNarrative.replace(
        new RegExp(transaction.ip_address.replace(/\./g, "\\."), "g"),
        "10.99.88.77",
      );

    case "AMOUNT_ALTERATION":
      // Replace the original amount with one clearly altered
      return cleanNarrative.replace(
        String(transaction.amount),
        String(transaction.amount * 20 + 1),
      );

    case "EMAIL_HALLUCINATION":
      // Replace actual email with a fabricated one
      return cleanNarrative.replace(
        user.email,
        `fabricated.identity.notreal@hallucinated-domain.invalid`,
      );

    case "TRANSACTION_ID_HALLUCINATION":
      // Replace actual transaction_id with a fabricated one
      return cleanNarrative.replace(
        transaction.transaction_id,
        `txn_FABRICATED_99999`,
      );

    case "UNSUPPORTED_INTENT_CLAIM":
      // Append an unsupported legal intent claim
      return (
        cleanNarrative +
        " The customer intentionally committed fraud and knowingly filed a false chargeback."
      );
  }
}

export interface EvalBDataset {
  cases: EvalBCase[];
  cleanCases: EvalBCase[];
  faultInjectedCases: EvalBCase[];
}

/**
 * Generate the Evaluation B safety test harness dataset.
 * 100 clean + 100 fault-injected = 200 total.
 * All fault injection is deterministic and explicitly controlled.
 */
export function generateEvalBDataset(seed: number = EVAL_A_SEED): EvalBDataset {
  const bSeed = seed + EVAL_B_SEED_OFFSET;
  const { bundles } = generateMerchantDb(bSeed, EVAL_B_TOTAL);
  const rng = createRng(bSeed + 7);

  const cleanCases: EvalBCase[] = [];
  const faultInjectedCases: EvalBCase[] = [];

  for (let i = 0; i < EVAL_B_TOTAL; i++) {
    const bundle = bundles[i];
    if (!bundle) throw new Error(`No bundle at index ${i}`);

    const sampleIdx = String(i + 1).padStart(3, "0");
    const isClean = i < EVAL_B_CLEAN_COUNT;
    const sample_type: EvalBSampleType = isClean ? "CLEAN" : "FAULT_INJECTED";

    // Build baseline snapshot for this sample — no ground_truth
    const snapshot: VerifiedEvidenceSnapshot = {
      user: bundle.user,
      transaction: bundle.transaction,
      ip_logs: bundle.ipLogs,
      tos_log: bundle.tosLog,
      consumption_log: bundle.consumptionLog,
      found: true,
    };

    const cleanNarrative = buildCleanNarrative(
      bundle.user,
      bundle.transaction,
      bundle.tosLog,
      bundle.consumptionLog,
    );

    let input_narrative: string;
    if (isClean) {
      input_narrative = cleanNarrative;
    } else {
      const faultType = rng.pick(FAULT_TYPES);
      input_narrative = injectFault(
        cleanNarrative,
        faultType,
        bundle.transaction,
        bundle.user,
      );
    }

    const evalBCase: EvalBCase = {
      test_id: `eval_b_${sampleIdx}`,
      sample_type,
      verified_evidence_snapshot: snapshot as unknown as Record<string, unknown>,
      input_narrative,
      expected_validator_outcome: isClean,
    };

    if (isClean) {
      cleanCases.push(evalBCase);
    } else {
      faultInjectedCases.push(evalBCase);
    }
  }

  return {
    cases: [...cleanCases, ...faultInjectedCases],
    cleanCases,
    faultInjectedCases,
  };
}
