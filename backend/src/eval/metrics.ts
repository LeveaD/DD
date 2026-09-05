/**
 * Evaluation Metrics Calculation Functions — Milestone 6
 *
 * Source of truth: docs/PRD.md §6, docs/EVALUATION.md §2 & §3
 *
 * Pure, deterministic metric functions that calculate confusion matrices,
 * classification metrics (Precision, Recall, F1, FPR, FNR, MRR), and cost estimates.
 *
 * INVARIANTS:
 *   - Operating strictly on recorded predictions and ground-truth labels.
 *   - Never modifies case results or production routing logic.
 *   - Safely handles zero denominators (never returns NaN or Infinity).
 *   - Ground truth is strictly preserved as provided.
 */

export interface ConfusionMatrix {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
}

export interface ClassificationMetrics {
  count: number;
  confusion_matrix: ConfusionMatrix;
  precision: number;
  recall: number;
  f1: number;
  false_positive_rate: number;
  false_negative_rate: number;
  manual_review_rate: number;
}

export interface GroundTruthPredictionPair {
  case_id: string;
  ground_truth: "DEFENDABLE" | "NOT_DEFENDABLE";
  prediction: "DEFENDABLE" | "MANUAL_REVIEW";
  scenario_type?: string;
  reason_summary?: string;
}

/**
 * Calculate Confusion Matrix from GroundTruthPredictionPairs.
 *
 * Positive class: "DEFENDABLE"
 * Non-positive class: "MANUAL_REVIEW" (or any non-DEFENDABLE outcome)
 *
 * TP: ground_truth = DEFENDABLE, prediction = DEFENDABLE
 * FN: ground_truth = DEFENDABLE, prediction = MANUAL_REVIEW
 * TN: ground_truth = NOT_DEFENDABLE, prediction = MANUAL_REVIEW
 * FP: ground_truth = NOT_DEFENDABLE, prediction = DEFENDABLE
 */
export function computeConfusionMatrix(
  pairs: readonly GroundTruthPredictionPair[],
): ConfusionMatrix {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const pair of pairs) {
    if (pair.ground_truth === "DEFENDABLE" && pair.prediction === "DEFENDABLE") {
      tp += 1;
    } else if (pair.ground_truth === "DEFENDABLE" && pair.prediction !== "DEFENDABLE") {
      fn += 1;
    } else if (pair.ground_truth === "NOT_DEFENDABLE" && pair.prediction !== "DEFENDABLE") {
      tn += 1;
    } else if (pair.ground_truth === "NOT_DEFENDABLE" && pair.prediction === "DEFENDABLE") {
      fp += 1;
    }
  }

  return { tp, tn, fp, fn };
}

/** Precision = TP / (TP + FP). Returns 0 if denominator is 0. */
export function computePrecision(tp: number, fp: number): number {
  const denominator = tp + fp;
  if (denominator === 0) return 0;
  return tp / denominator;
}

/** Recall = TP / (TP + FN). Returns 0 if denominator is 0. */
export function computeRecall(tp: number, fn: number): number {
  const denominator = tp + fn;
  if (denominator === 0) return 0;
  return tp / denominator;
}

/** F1 = 2 * P * R / (P + R). Returns 0 if denominator is 0. */
export function computeF1(precision: number, recall: number): number {
  const denominator = precision + recall;
  if (denominator === 0) return 0;
  return (2 * precision * recall) / denominator;
}

/** False Positive Rate = FP / (FP + TN). Returns 0 if denominator is 0. */
export function computeFalsePositiveRate(fp: number, tn: number): number {
  const denominator = fp + tn;
  if (denominator === 0) return 0;
  return fp / denominator;
}

/** False Negative Rate = FN / (FN + TP). Returns 0 if denominator is 0. */
export function computeFalseNegativeRate(fn: number, tp: number): number {
  const denominator = fn + tp;
  if (denominator === 0) return 0;
  return fn / denominator;
}

/** Manual Review Rate = manualReviewCount / total. Returns 0 if total is 0. */
export function computeManualReviewRate(manualReviewCount: number, total: number): number {
  if (total === 0) return 0;
  return manualReviewCount / total;
}

/**
 * Compute complete classification metrics from GroundTruthPredictionPairs.
 */
export function computeClassificationMetrics(
  pairs: readonly GroundTruthPredictionPair[],
): ClassificationMetrics {
  const count = pairs.length;
  const cm = computeConfusionMatrix(pairs);

  const prec = computePrecision(cm.tp, cm.fp);
  const rec = computeRecall(cm.tp, cm.fn);
  const f1 = computeF1(prec, rec);
  const fpr = computeFalsePositiveRate(cm.fp, cm.tn);
  const fnr = computeFalseNegativeRate(cm.fn, cm.tp);

  const manualReviewCount = pairs.filter((p) => p.prediction === "MANUAL_REVIEW").length;
  const mrr = computeManualReviewRate(manualReviewCount, count);

  return {
    count,
    confusion_matrix: cm,
    precision: Number(prec.toFixed(4)),
    recall: Number(rec.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    false_positive_rate: Number(fpr.toFixed(4)),
    false_negative_rate: Number(fnr.toFixed(4)),
    manual_review_rate: Number(mrr.toFixed(4)),
  };
}

/** Cost assumptions for illustrative error cost analysis (per EVALUATION.md §2.3) */
export const COST_ASSUMPTIONS = {
  /** Assumed operational & penalty risk cost of a False Positive (in major currency units, e.g. INR / USD) */
  FALSE_POSITIVE_UNIT_COST: 50.0,
  /** Assumed manual review labor & compilation cost of a False Negative */
  FALSE_NEGATIVE_UNIT_COST: 15.0,
  NOTE: "Illustrative operational cost assumptions for benchmark risk analysis; does not represent actual merchant bank loss figures.",
};

export interface CostSummary {
  false_positives: number;
  false_negatives: number;
  unit_fp_cost: number;
  unit_fn_cost: number;
  total_fp_cost: number;
  total_fn_cost: number;
  total_error_cost: number;
  cost_note: string;
}

export function computeCostSummary(cm: ConfusionMatrix): CostSummary {
  const total_fp_cost = cm.fp * COST_ASSUMPTIONS.FALSE_POSITIVE_UNIT_COST;
  const total_fn_cost = cm.fn * COST_ASSUMPTIONS.FALSE_NEGATIVE_UNIT_COST;

  return {
    false_positives: cm.fp,
    false_negatives: cm.fn,
    unit_fp_cost: COST_ASSUMPTIONS.FALSE_POSITIVE_UNIT_COST,
    unit_fn_cost: COST_ASSUMPTIONS.FALSE_NEGATIVE_UNIT_COST,
    total_fp_cost,
    total_fn_cost,
    total_error_cost: total_fp_cost + total_fn_cost,
    cost_note: COST_ASSUMPTIONS.NOTE,
  };
}
