/**
 * Canonical Dataset Fixtures — Milestone 2
 *
 * Pre-generates and exports the canonical seeded datasets.
 * Callers import these instead of calling the generators directly,
 * so every part of the system uses the same deterministic dataset.
 *
 * Generated once at module load time with seed = 42.
 * Frozen to prevent accidental mutation.
 */

import { generateMerchantDb } from "./merchantDb.js";
import { generateEvalADataset, generateEvalBDataset, EVAL_A_SEED } from "./generator.js";

export const SEED = EVAL_A_SEED; // 42

/** Canonical synthetic merchant database (seed 42) */
export const MERCHANT_DB = generateMerchantDb(SEED, 300);

/** Canonical Evaluation A dataset: 150 cases, 105 DEV + 45 HOLDOUT */
export const EVAL_A = generateEvalADataset(SEED);

/** Canonical Evaluation B dataset: 200 cases, 100 CLEAN + 100 FAULT_INJECTED */
export const EVAL_B = generateEvalBDataset(SEED);
