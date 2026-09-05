/**
 * Evaluation Runner & Metrics Exporter — Milestone 6
 *
 * Source of truth: docs/PRD.md §6, docs/EVALUATION.md §4, Milestone 6 §14–§16
 *
 * Executes Evaluation A & Evaluation B benchmarks, formats a human-readable
 * console report, and exports machine-readable JSON metrics to docs/eval_results.json.
 *
 * REPRODUCIBILITY & SAFETY GUARANTEES:
 *   - 100% deterministic — executing twice against unchanged code produces identical metric values.
 *   - ZERO hardcoded or manufactured metric values.
 *   - ZERO live Groq API calls during evaluation execution.
 *   - ZERO secret leakage in exported JSON.
 */

import * as fs from "fs";
import * as path from "path";

import { runEvalA, type EvalAResult } from "./evalA.js";
import { runEvalB, type EvalBResult } from "./evalB.js";

export interface CombinedEvaluationReport {
  evaluation_version: string;
  seed: number;
  evaluated_at: string;
  evaluation_a: EvalAResult;
  evaluation_b: EvalBResult;
}

export interface RunEvaluationOptions {
  seed?: number;
  exportPath?: string;
  quiet?: boolean;
}

/**
 * Execute Evaluation A and Evaluation B benchmarks and return the full evaluation report.
 * Optionally writes machine-readable JSON results to `exportPath`.
 */
export function runAllEvaluations(options?: RunEvaluationOptions): CombinedEvaluationReport {
  const seed = options?.seed ?? 42;
  const exportPath = options?.exportPath ?? "docs/eval_results.json";
  const evaluatedAt = new Date().toISOString();

  // Run Benchmark A and Benchmark B
  const evalA = runEvalA();
  const evalB = runEvalB();

  const report: CombinedEvaluationReport = {
    evaluation_version: "1.0.0",
    seed,
    evaluated_at: evaluatedAt,
    evaluation_a: evalA,
    evaluation_b: evalB,
  };

  // Safety Assertion on Report Output: No Secrets
  const reportJson = JSON.stringify(report, null, 2);
  if (process.env["GROQ_API_KEY"] && process.env["GROQ_API_KEY"].trim() !== "") {
    const key = process.env["GROQ_API_KEY"];
    if (key !== "your_groq_api_key_here" && key !== "mock_groq_api_key_for_testing" && reportJson.includes(key)) {
      throw new Error("SECRET LEAKAGE VIOLATION: GROQ_API_KEY detected inside evaluation export payload!");
    }
  }

  // Export JSON file if path specified
  if (exportPath) {
    try {
      const resolvedPath = path.resolve(process.cwd(), exportPath);
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolvedPath, reportJson, "utf-8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Could not export metrics to ${exportPath}: ${msg}`);
    }
  }

  if (!options?.quiet) {
    printConsoleReport(report);
  }

  return report;
}

/**
 * Print a clean, formatted human-readable console report.
 */
export function printConsoleReport(report: CombinedEvaluationReport): void {
  const { evaluation_a: a, evaluation_b: b } = report;

  console.log("================================================================================");
  console.log("               DISPUTEDEFEND AI — MILESTONE 6 EVALUATION REPORT                 ");
  console.log("================================================================================");
  console.log(`Evaluated At: ${report.evaluated_at}  |  Seed: ${report.seed}  |  Version: ${report.evaluation_version}`);
  console.log("--------------------------------------------------------------------------------\n");

  console.log("--------------------------------------------------------------------------------");
  console.log(" 1. EVALUATION A — DETERMINISTIC EVIDENCE ROUTING PERFORMANCE (NON-CIRCULAR)");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Total Benchmark Cases: ${a.total_cases}`);
  console.log("\n[ DEVELOPMENT SPLIT (105 cases) ]");
  console.log(`  Precision: ${a.dev_split.precision}  |  Recall: ${a.dev_split.recall}  |  F1: ${a.dev_split.f1}`);
  console.log(`  FPR: ${a.dev_split.false_positive_rate}  |  FNR: ${a.dev_split.false_negative_rate}  |  Manual Review Rate: ${a.dev_split.manual_review_rate}`);
  console.log(`  Confusion Matrix: TP=${a.dev_split.confusion_matrix.tp}, TN=${a.dev_split.confusion_matrix.tn}, FP=${a.dev_split.confusion_matrix.fp}, FN=${a.dev_split.confusion_matrix.fn}`);

  console.log("\n[ SYNTHETIC HOLDOUT BENCHMARK (45 cases — isolated unseen set) ]");
  console.log(`  Precision: ${a.holdout_split.precision}  |  Recall: ${a.holdout_split.recall}  |  F1: ${a.holdout_split.f1}`);
  console.log(`  FPR: ${a.holdout_split.false_positive_rate}  |  FNR: ${a.holdout_split.false_negative_rate}  |  Manual Review Rate: ${a.holdout_split.manual_review_rate}`);
  console.log(`  Confusion Matrix: TP=${a.holdout_split.confusion_matrix.tp}, TN=${a.holdout_split.confusion_matrix.tn}, FP=${a.holdout_split.confusion_matrix.fp}, FN=${a.holdout_split.confusion_matrix.fn}`);

  console.log("\n[ COMBINED DATASET (150 cases) ]");
  console.log(`  Precision: ${a.combined.precision}  |  Recall: ${a.combined.recall}  |  F1: ${a.combined.f1}`);
  console.log(`  FPR: ${a.combined.false_positive_rate}  |  FNR: ${a.combined.false_negative_rate}  |  Manual Review Rate: ${a.combined.manual_review_rate}`);
  console.log(`  Confusion Matrix: TP=${a.combined.confusion_matrix.tp}, TN=${a.combined.confusion_matrix.tn}, FP=${a.combined.confusion_matrix.fp}, FN=${a.combined.confusion_matrix.fn}`);
  console.log(`  Total Error Cost (Illustrative): ₹${a.combined.cost_summary.total_error_cost} (FP cost: ₹${a.combined.cost_summary.total_fp_cost}, FN cost: ₹${a.combined.cost_summary.total_fn_cost})`);
  console.log(`  Error Analysis: ${a.error_analysis.false_positives_count} False Positives, ${a.error_analysis.false_negatives_count} False Negatives`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log(" 2. EVALUATION B — LLM OUTPUT SAFETY & HARD VALIDATOR BENCHMARK");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Total Test Harness Samples: ${b.total_samples} (${b.clean_samples_count} Clean + ${b.fault_injected_samples_count} Fault Injected)`);
  console.log(`  Clean Data Pass Rate: ${b.clean_pass_rate}%`);
  console.log(`  Fault Detection Rate: ${b.fault_detection_rate}%`);
  console.log(`  False Acceptance Rate (FAR): ${b.false_acceptance_rate}%`);
  console.log(`  Overall Validator Accuracy: ${b.overall_pass_accuracy}%`);

  console.log("\n[ FAULT CLASS BREAKDOWN ]");
  for (const fc of Object.keys(b.fault_class_breakdown)) {
    const item = b.fault_class_breakdown[fc as keyof typeof b.fault_class_breakdown];
    console.log(
      `  - ${item.fault_class.padEnd(28, " ")}: ${String(item.rejected_count).padStart(2, " ")}/${item.total_samples} Rejected (Detection: ${item.detection_rate}%, FAR: ${item.false_acceptance_rate}%)`,
    );
  }
  console.log("================================================================================\n");
}
