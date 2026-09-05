#!/usr/bin/env node
/**
 * Evaluation Runner CLI Entry Point — Milestone 6
 *
 * Source of truth: docs/PRD.md §6, docs/EVALUATION.md §4
 */

import { runAllEvaluations } from "./runner.js";

runAllEvaluations({
  exportPath: "../docs/eval_results.json",
});
