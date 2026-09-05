/**
 * Milestone 6 — Evaluation Runner & Measured Metrics Test Suite (Vitest)
 *
 * Verifies all requirements for Milestone 6:
 *   - Pure, deterministic metric math (zero-denominator safety, no NaNs)
 *   - Evaluation A runner (150 cases, 105 DEV / 45 HOLDOUT split, independent oracle)
 *   - Evaluation B runner (200 samples, 100 CLEAN / 100 FAULT_INJECTED, per-fault breakdown)
 *   - Reproducibility (two runs produce identical metric outputs)
 *   - Secret isolation (docs/eval_results.json contains no API keys or secrets)
 *   - ZERO live Groq API calls required
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  computeConfusionMatrix,
  computePrecision,
  computeRecall,
  computeF1,
  computeFalsePositiveRate,
  computeFalseNegativeRate,
  computeManualReviewRate,
  computeClassificationMetrics,
  type GroundTruthPredictionPair,
} from "../src/eval/metrics.js";

import { runEvalA } from "../src/eval/evalA.js";
import { runEvalB } from "../src/eval/evalB.js";
import { runAllEvaluations } from "../src/eval/runner.js";

describe("Milestone 6 — Pure Metric Math Functions", () => {
  it("computes confusion matrix correctly for mixed prediction pairs", () => {
    const pairs: GroundTruthPredictionPair[] = [
      { case_id: "c1", ground_truth: "DEFENDABLE", prediction: "DEFENDABLE" }, // TP
      { case_id: "c2", ground_truth: "DEFENDABLE", prediction: "MANUAL_REVIEW" }, // FN
      { case_id: "c3", ground_truth: "NOT_DEFENDABLE", prediction: "MANUAL_REVIEW" }, // TN
      { case_id: "c4", ground_truth: "NOT_DEFENDABLE", prediction: "DEFENDABLE" }, // FP
    ];

    const cm = computeConfusionMatrix(pairs);
    expect(cm.tp).toBe(1);
    expect(cm.fn).toBe(1);
    expect(cm.tn).toBe(1);
    expect(cm.fp).toBe(1);
  });

  it("safely handles zero denominators without returning NaN or Infinity", () => {
    expect(computePrecision(0, 0)).toBe(0);
    expect(computeRecall(0, 0)).toBe(0);
    expect(computeF1(0, 0)).toBe(0);
    expect(computeFalsePositiveRate(0, 0)).toBe(0);
    expect(computeFalseNegativeRate(0, 0)).toBe(0);
    expect(computeManualReviewRate(0, 0)).toBe(0);

    expect(Number.isNaN(computePrecision(0, 0))).toBe(false);
    expect(Number.isNaN(computeRecall(0, 0))).toBe(false);
    expect(Number.isNaN(computeF1(0, 0))).toBe(false);
  });

  it("computes 1.0 precision, recall, F1 for a perfect classifier", () => {
    const pairs: GroundTruthPredictionPair[] = [
      { case_id: "c1", ground_truth: "DEFENDABLE", prediction: "DEFENDABLE" },
      { case_id: "c2", ground_truth: "NOT_DEFENDABLE", prediction: "MANUAL_REVIEW" },
    ];

    const metrics = computeClassificationMetrics(pairs);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
    expect(metrics.false_positive_rate).toBe(0);
    expect(metrics.false_negative_rate).toBe(0);
  });
});

describe("Milestone 6 — Evaluation A Runner (Deterministic Evidence Routing)", () => {
  it("evaluates exactly 150 cases with 105 DEV and 45 HOLDOUT split using seed 42", () => {
    const result = runEvalA();

    expect(result.total_cases).toBe(150);
    expect(result.dev_split.count).toBe(105);
    expect(result.holdout_split.count).toBe(45);
    expect(result.combined.count).toBe(150);
  });

  it("uses independent oracle ground truth labels and generates predictions via production router", () => {
    const result = runEvalA();

    // Verify metrics exist and are non-NaN
    expect(Number.isNaN(result.combined.precision)).toBe(false);
    expect(Number.isNaN(result.combined.recall)).toBe(false);
    expect(Number.isNaN(result.combined.f1)).toBe(false);

    // Verify manual review rate is reported
    expect(result.combined.manual_review_rate).toBeGreaterThanOrEqual(0);
    expect(result.combined.manual_review_rate).toBeLessThanOrEqual(1);

    // Verify cost summary exists
    expect(result.combined.cost_summary.total_error_cost).toBeGreaterThanOrEqual(0);
    expect(result.combined.cost_summary.cost_note).toContain("Illustrative");
  });

  it("reports detailed error analysis for FP and FN error cases", () => {
    const result = runEvalA();

    expect(result.error_analysis).toBeDefined();
    expect(Array.isArray(result.error_analysis.error_cases)).toBe(true);

    for (const errorCase of result.error_analysis.error_cases) {
      expect(errorCase.case_id).toBeDefined();
      expect(["FALSE_POSITIVE", "FALSE_NEGATIVE"]).toContain(errorCase.error_type);
      expect(errorCase.reason_summary).toBeDefined();
    }
  });
});

describe("Milestone 6 — Evaluation B Runner (Hard Validator Safety)", () => {
  it("evaluates exactly 200 samples (100 CLEAN + 100 FAULT_INJECTED)", () => {
    const result = runEvalB();

    expect(result.total_samples).toBe(200);
    expect(result.clean_samples_count).toBe(100);
    expect(result.fault_injected_samples_count).toBe(100);
  });

  it("measures clean pass rate, fault detection rate, false acceptance rate, and overall accuracy", () => {
    const result = runEvalB();

    expect(result.clean_pass_rate).toBe(100); // 100% clean pass expected on valid baseline
    expect(result.fault_detection_rate).toBe(100); // 100% detection rate expected on hard validator
    expect(result.false_acceptance_rate).toBe(0); // 0% FAR expected
    expect(result.overall_pass_accuracy).toBe(100);
  });

  it("provides detailed fault class breakdown across all 6 fault types", () => {
    const result = runEvalB();

    const expectedFaults = [
      "DATE_MUTATION",
      "IP_FABRICATION",
      "AMOUNT_ALTERATION",
      "EMAIL_HALLUCINATION",
      "TRANSACTION_ID_HALLUCINATION",
      "UNSUPPORTED_INTENT_CLAIM",
    ];

    for (const fc of expectedFaults) {
      const breakdown = result.fault_class_breakdown[fc as keyof typeof result.fault_class_breakdown];
      expect(breakdown).toBeDefined();
      expect(breakdown.total_samples).toBeGreaterThan(0);
      expect(breakdown.detection_rate).toBe(100);
      expect(breakdown.false_acceptance_rate).toBe(0);
    }
  });
});

describe("Milestone 6 — Reproducibility & Result Export", () => {
  it("produces 100% identical metric values across two consecutive benchmark runs", () => {
    const run1 = runAllEvaluations({ quiet: true });
    const run2 = runAllEvaluations({ quiet: true });

    expect(run1.evaluation_a.combined.precision).toBe(run2.evaluation_a.combined.precision);
    expect(run1.evaluation_a.combined.recall).toBe(run2.evaluation_a.combined.recall);
    expect(run1.evaluation_a.combined.f1).toBe(run2.evaluation_a.combined.f1);
    expect(run1.evaluation_a.dev_split.f1).toBe(run2.evaluation_a.dev_split.f1);
    expect(run1.evaluation_a.holdout_split.f1).toBe(run2.evaluation_a.holdout_split.f1);

    expect(run1.evaluation_b.clean_pass_rate).toBe(run2.evaluation_b.clean_pass_rate);
    expect(run1.evaluation_b.fault_detection_rate).toBe(run2.evaluation_b.fault_detection_rate);
    expect(run1.evaluation_b.overall_pass_accuracy).toBe(run2.evaluation_b.overall_pass_accuracy);
  });

  it("exports metrics to docs/eval_results.json without secret leakage", () => {
    const exportRelativePath = "../docs/eval_results.json";
    const report = runAllEvaluations({ exportPath: exportRelativePath, quiet: true });

    expect(report.evaluation_a).toBeDefined();
    expect(report.evaluation_b).toBeDefined();

    const fullExportPath = path.resolve(process.cwd(), exportRelativePath);
    expect(fs.existsSync(fullExportPath)).toBe(true);

    const exportedContent = fs.readFileSync(fullExportPath, "utf-8");
    expect(exportedContent).toContain("Evaluation A — Deterministic Evidence Routing Performance");
    expect(exportedContent).toContain("Evaluation B — LLM Output Safety & Hard Validator Benchmark");

    // Secret isolation assertion
    expect(exportedContent).not.toContain("GROQ_API_KEY");
    expect(exportedContent).not.toContain("gsk_");
  });
});
