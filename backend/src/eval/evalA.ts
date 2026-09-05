/**
 * Evaluation A Runner — Milestone 6 (Deterministic Evidence Routing Performance)
 *
 * Source of truth: docs/PRD.md §6, docs/EVALUATION.md §2, docs/ARCHITECTURE.md §5
 *
 * Evaluates the production deterministic evidence routing engine against the
 * independent oracle ground-truth labels established in Milestone 2.
 *
 * NON-CIRCULAR ARCHITECTURE:
 *   - Ground truth labels (`evalCase.ground_truth`) are read directly from the dataset.
 *   - Ground truth is NEVER generated or modified by calling production routing.
 *   - Production routing `routeDispute(signals)` is executed separately to generate predictions.
 *   - Zero live Groq API calls.
 */

import type { EvidenceSignals, EvalACase } from "../schemas/index.js";
import { EVAL_A } from "../data/fixtures.js";
import { routeDispute } from "../engine/router.js";
import {
  computeClassificationMetrics,
  computeCostSummary,
  type GroundTruthPredictionPair,
  type ClassificationMetrics,
  type CostSummary,
} from "./metrics.js";

export interface ErrorCaseDetails {
  case_id: string;
  split: string;
  scenario_type: string;
  error_type: "FALSE_POSITIVE" | "FALSE_NEGATIVE";
  ground_truth: "DEFENDABLE" | "NOT_DEFENDABLE";
  prediction: "DEFENDABLE" | "MANUAL_REVIEW";
  reason_summary: string;
}

export interface EvalAResult {
  benchmark_name: string;
  seed: number;
  total_cases: number;
  dev_split: ClassificationMetrics & { cost_summary: CostSummary };
  holdout_split: ClassificationMetrics & { cost_summary: CostSummary; label: string };
  combined: ClassificationMetrics & { cost_summary: CostSummary };
  error_analysis: {
    false_positives_count: number;
    false_negatives_count: number;
    error_cases: ErrorCaseDetails[];
  };
}

/**
 * Execute Evaluation A benchmark.
 *
 * @param cases Optional custom EvalACase array (defaults to canonical EVAL_A fixture)
 */
export function runEvalA(cases: readonly EvalACase[] = EVAL_A.cases): EvalAResult {
  const allPairs: GroundTruthPredictionPair[] = [];
  const devPairs: GroundTruthPredictionPair[] = [];
  const holdoutPairs: GroundTruthPredictionPair[] = [];
  const errorCases: ErrorCaseDetails[] = [];

  for (const evalCase of cases) {
    // 1. Independent Ground Truth from dataset oracle (NEVER overwritten)
    const ground_truth = evalCase.ground_truth;

    // 2. Extract synthetic evidence signals
    const synthData = evalCase.synthetic_evidence as Record<string, unknown>;
    const signals = synthData["evidence_signals"] as EvidenceSignals;
    const scenarioType = (synthData["scenario_type"] as string) ?? "UNKNOWN";

    if (!signals) {
      throw new Error(`EvalACase ${evalCase.case_id} missing evidence_signals in synthetic_evidence`);
    }

    // 3. Execute production router independently
    const routeRes = routeDispute(signals);

    // 4. Map production prediction: DEFENDABLE vs MANUAL_REVIEW
    const prediction: "DEFENDABLE" | "MANUAL_REVIEW" =
      routeRes.destination === "PROCEED_TO_DRAFTING" ? "DEFENDABLE" : "MANUAL_REVIEW";

    const pair: GroundTruthPredictionPair = {
      case_id: evalCase.case_id,
      ground_truth,
      prediction,
      scenario_type: scenarioType,
      reason_summary: routeRes.reason.summary,
    };

    allPairs.push(pair);

    if (evalCase.split === "DEV") {
      devPairs.push(pair);
    } else {
      holdoutPairs.push(pair);
    }

    // 5. Identify False Positives & False Negatives for Error Analysis
    if (ground_truth === "NOT_DEFENDABLE" && prediction === "DEFENDABLE") {
      errorCases.push({
        case_id: evalCase.case_id,
        split: evalCase.split,
        scenario_type: scenarioType,
        error_type: "FALSE_POSITIVE",
        ground_truth,
        prediction,
        reason_summary: routeRes.reason.summary,
      });
    } else if (ground_truth === "DEFENDABLE" && prediction === "MANUAL_REVIEW") {
      errorCases.push({
        case_id: evalCase.case_id,
        split: evalCase.split,
        scenario_type: scenarioType,
        error_type: "FALSE_NEGATIVE",
        ground_truth,
        prediction,
        reason_summary: routeRes.reason.summary,
      });
    }
  }

  // Compute metrics for splits
  const devMetrics = computeClassificationMetrics(devPairs);
  const devCost = computeCostSummary(devMetrics.confusion_matrix);

  const holdoutMetrics = computeClassificationMetrics(holdoutPairs);
  const holdoutCost = computeCostSummary(holdoutMetrics.confusion_matrix);

  const combinedMetrics = computeClassificationMetrics(allPairs);
  const combinedCost = computeCostSummary(combinedMetrics.confusion_matrix);

  const falsePositivesCount = errorCases.filter((e) => e.error_type === "FALSE_POSITIVE").length;
  const falseNegativesCount = errorCases.filter((e) => e.error_type === "FALSE_NEGATIVE").length;

  return {
    benchmark_name: "Evaluation A — Deterministic Evidence Routing Performance",
    seed: 42,
    total_cases: cases.length,
    dev_split: {
      ...devMetrics,
      cost_summary: devCost,
    },
    holdout_split: {
      ...holdoutMetrics,
      cost_summary: holdoutCost,
      label: "Synthetic Holdout Benchmark (Isolated Unseen Data)",
    },
    combined: {
      ...combinedMetrics,
      cost_summary: combinedCost,
    },
    error_analysis: {
      false_positives_count: falsePositivesCount,
      false_negatives_count: falseNegativesCount,
      error_cases: errorCases,
    },
  };
}
