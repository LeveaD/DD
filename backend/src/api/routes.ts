/**
 * API Route Handlers — Milestone 7
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/ARCHITECTURE.md, Milestone 7 §1–§17
 *
 * Exposes DisputeDefend engine capabilities over HTTP REST endpoints for the React dashboard.
 *
 * STRICT ADAPTER PRINCIPLE:
 *   - Route handlers contain ZERO business logic.
 *   - Routing logic, verification, sufficiency rules, LLM drafting, validation, and state machine
 *     are exclusively performed by pre-existing engine modules.
 *   - NEVER exposes evaluation ground_truth or API secrets.
 */

import { Router, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { DemoDisputeStore } from "./store.js";
import { formatDisputeListItem, formatDisputeDetail } from "./dto.js";
import { processDispute, type DisputeIngest } from "../engine/index.js";
import { transition } from "../engine/stateMachine.js";
import { runDraftingPipeline } from "../llm/index.js";
import { compileEvidencePackage } from "../package/compiler.js";
import { generateEvidencePackagePdf } from "../package/pdfGenerator.js";
import { MERCHANT_DB } from "../data/fixtures.js";

export function createRouter(store: DemoDisputeStore): Router {
  const router = Router();

  /**
   * 1. GET /api/health
   * Simple health check endpoint.
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: { status: "ok" },
    });
  });

  /**
   * 2. GET /api/disputes
   * List all demo disputes formatted for the dashboard overview.
   */
  router.get("/disputes", (_req: Request, res: Response) => {
    const all = store.getAllDisputes();
    const list = all.map((item) => formatDisputeListItem(item.disputeCase));
    res.status(200).json({
      success: true,
      data: list,
    });
  });

  /**
   * 3. GET /api/disputes/:id
   * Fetch detailed information for a specific dispute case.
   */
  router.get("/disputes/:id", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = store.getDispute(id);
    if (!item) {
      res.status(404).json({
        success: false,
        error: {
          code: "DISPUTE_NOT_FOUND",
          message: `Dispute '${id}' was not found`,
        },
      });
      return;
    }

    const auditEntries = store.auditLogger.getEntriesForDispute(id);
    const dto = formatDisputeDetail(item.disputeCase, item.snapshot, auditEntries, item.claimedUserId);
    res.status(200).json({
      success: true,
      data: dto,
    });
  });

  /**
   * 4. POST /api/disputes/:id/process
   * Process dispute through deterministic engine and Groq drafting pipeline.
   * Demonstrates idempotency: repeated processing of already-processed cases returns current result.
   */
  router.post("/disputes/:id/process", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const item = store.getDispute(id);
      if (!item) {
        res.status(404).json({
          success: false,
          error: {
            code: "DISPUTE_NOT_FOUND",
            message: `Dispute '${id}' was not found`,
          },
        });
        return;
      }

      const { disputeCase, snapshot } = item;

      // DEMO IDEMPOTENCY:
      // If already processed beyond RECEIVED (e.g. HUMAN_APPROVAL_REQUIRED, READY_FOR_SUBMISSION, SUBMITTED, MANUAL_REVIEW),
      // return existing detail without re-running drafting pipeline or creating duplicate state transitions.
      const nonProcessableStates = new Set([
        "HUMAN_APPROVAL_REQUIRED",
        "READY_FOR_SUBMISSION",
        "SUBMITTED",
        "MANUAL_REVIEW",
      ]);

      if (nonProcessableStates.has(disputeCase.current_state)) {
        const auditEntries = store.auditLogger.getEntriesForDispute(id);
        const dto = formatDisputeDetail(disputeCase, snapshot, auditEntries, item.claimedUserId);
        res.status(200).json({
          success: true,
          data: dto,
        });
        return;
      }

      // Execute existing engine pipeline
      const ingest: DisputeIngest = {
        dispute_id: disputeCase.dispute_id,
        transaction_id: disputeCase.transaction_id,
        claimed_user_id: item.claimedUserId ?? snapshot.user?.user_id ?? "usr_101",
        amount: disputeCase.amount,
        currency: disputeCase.currency,
        reason_code: disputeCase.reason_code,
        chargeback_date: disputeCase.chargeback_date,
      };

      const engineResult = processDispute(MERCHANT_DB.db, ingest);

      // Record audit logs for engine processing
      store.auditLogger.append({
        dispute_id: disputeCase.dispute_id,
        event_type: "DISPUTE_RECEIVED",
        previous_state: "RECEIVED",
        next_state: "EVIDENCE_FETCHING",
      });

      if (engineResult.signals) {
        disputeCase.evidence_signals = engineResult.signals;
        if (engineResult.sufficiency_classification) {
          disputeCase.sufficiency_classification = engineResult.sufficiency_classification;
        }

        store.auditLogger.append({
          dispute_id: disputeCase.dispute_id,
          event_type: "EVIDENCE_VERIFIED",
          previous_state: "EVIDENCE_FETCHING",
          next_state: "EVIDENCE_VERIFIED",
        });

        store.auditLogger.append({
          dispute_id: disputeCase.dispute_id,
          event_type: "SUFFICIENCY_ASSESSED",
          previous_state: "EVIDENCE_VERIFIED",
          next_state: engineResult.final_state,
        });
      }

      disputeCase.current_state = engineResult.final_state;

      // If DEFENDABLE (final_state === SUFFICIENCY_ASSESSED), run Groq LLM drafting pipeline
      if (engineResult.final_state === "SUFFICIENCY_ASSESSED") {
        await runDraftingPipeline({
          disputeCase,
          snapshot,
          auditLogger: store.auditLogger,
        });
      } else if (engineResult.final_state === "MANUAL_REVIEW") {
        store.auditLogger.append({
          dispute_id: disputeCase.dispute_id,
          event_type: "ROUTED_TO_MANUAL_REVIEW",
          previous_state: "SUFFICIENCY_ASSESSED",
          next_state: "MANUAL_REVIEW",
          failure_reason: engineResult.failure_detail ?? "Evidence insufficient or contradictory",
        });
      }

      const auditEntries = store.auditLogger.getEntriesForDispute(id);
      const dto = formatDisputeDetail(disputeCase, snapshot, auditEntries, item.claimedUserId);

      res.status(200).json({
        success: true,
        data: dto,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * 5. POST /api/disputes/:id/approve
   * Transition dispute from HUMAN_APPROVAL_REQUIRED -> READY_FOR_SUBMISSION.
   */
  router.post("/disputes/:id/approve", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = store.getDispute(id);
    if (!item) {
      res.status(404).json({
        success: false,
        error: {
          code: "DISPUTE_NOT_FOUND",
          message: `Dispute '${id}' was not found`,
        },
      });
      return;
    }

    const { disputeCase, snapshot } = item;

    if (disputeCase.current_state !== "HUMAN_APPROVAL_REQUIRED") {
      res.status(409).json({
        success: false,
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: `Cannot approve dispute in state '${disputeCase.current_state}'. Human approval is only valid from state 'HUMAN_APPROVAL_REQUIRED'.`,
        },
      });
      return;
    }

    const trans = transition("HUMAN_APPROVAL_REQUIRED", "READY_FOR_SUBMISSION");
    if (!trans.ok) {
      res.status(409).json({
        success: false,
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: trans.error.message,
        },
      });
      return;
    }

    disputeCase.current_state = "READY_FOR_SUBMISSION";

    store.auditLogger.append({
      dispute_id: disputeCase.dispute_id,
      event_type: "HUMAN_APPROVED",
      previous_state: "HUMAN_APPROVAL_REQUIRED",
      next_state: "READY_FOR_SUBMISSION",
      human_action: {
        analyst_id: "demo_analyst_1",
        action: "APPROVE",
        timestamp: new Date().toISOString(),
      },
    });

    const auditEntries = store.auditLogger.getEntriesForDispute(id);
    const dto = formatDisputeDetail(disputeCase, snapshot, auditEntries, item.claimedUserId);

    res.status(200).json({
      success: true,
      data: dto,
    });
  });

  /**
   * 6. POST /api/disputes/:id/submit
   * Transition dispute from READY_FOR_SUBMISSION -> SUBMITTED.
   * Explicitly marked as SIMULATED SUBMISSION.
   */
  router.post("/disputes/:id/submit", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = store.getDispute(id);
    if (!item) {
      res.status(404).json({
        success: false,
        error: {
          code: "DISPUTE_NOT_FOUND",
          message: `Dispute '${id}' was not found`,
        },
      });
      return;
    }

    const { disputeCase, snapshot } = item;

    if (disputeCase.current_state !== "READY_FOR_SUBMISSION") {
      res.status(409).json({
        success: false,
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: `Cannot submit dispute in state '${disputeCase.current_state}'. Submission is allowed only from state 'READY_FOR_SUBMISSION'.`,
        },
      });
      return;
    }

    const trans = transition("READY_FOR_SUBMISSION", "SUBMITTED");
    if (!trans.ok) {
      res.status(409).json({
        success: false,
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: trans.error.message,
        },
      });
      return;
    }

    disputeCase.current_state = "SUBMITTED";

    store.auditLogger.append({
      dispute_id: disputeCase.dispute_id,
      event_type: "DISPUTE_SUBMITTED",
      previous_state: "READY_FOR_SUBMISSION",
      next_state: "SUBMITTED",
    });

    const auditEntries = store.auditLogger.getEntriesForDispute(id);
    const dto = formatDisputeDetail(disputeCase, snapshot, auditEntries, item.claimedUserId);

    res.status(200).json({
      success: true,
      data: {
        ...dto,
        is_simulated: true,
        submission_notice:
          "SIMULATED SUBMISSION — Dispute recorded as SUBMITTED in state machine. No real bank or payment gateway API was contacted.",
      },
    });
  });

  /**
   * 7. GET /api/disputes/:id/audit
   * Fetch append-only audit trail for a dispute case in chronological order.
   */
  router.get("/disputes/:id/audit", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = store.getDispute(id);
    if (!item) {
      res.status(404).json({
        success: false,
        error: {
          code: "DISPUTE_NOT_FOUND",
          message: `Dispute '${id}' was not found`,
        },
      });
      return;
    }

    const auditEntries = store.auditLogger.getEntriesForDispute(id);
    res.status(200).json({
      success: true,
      data: auditEntries,
    });
  });

  /**
   * 8. GET /api/disputes/:id/evidence
   * Fetch verified evidence summary for a dispute case.
   */
  router.get("/disputes/:id/evidence", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = store.getDispute(id);
    if (!item) {
      res.status(404).json({
        success: false,
        error: {
          code: "DISPUTE_NOT_FOUND",
          message: `Dispute '${id}' was not found`,
        },
      });
      return;
    }

    const auditEntries = store.auditLogger.getEntriesForDispute(id);
    const dto = formatDisputeDetail(item.disputeCase, item.snapshot, auditEntries, item.claimedUserId);

    res.status(200).json({
      success: true,
      data: {
        dispute_id: dto.dispute_id,
        transaction_id: dto.transaction_id,
        claimed_user_id: dto.claimed_user_id,
        verified_evidence_summary: dto.verified_evidence_summary,
        verification_results: dto.verification_results,
      },
    });
  });

  /**
   * 9. GET /api/disputes/:id/evidence-package
   * Generate and stream the validated Evidence Package PDF artifact.
   */
  router.get("/disputes/:id/evidence-package", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const item = store.getDispute(id);
      if (!item) {
        res.status(404).json({
          success: false,
          error: {
            code: "DISPUTE_NOT_FOUND",
            message: `Dispute '${id}' was not found`,
          },
        });
        return;
      }

      const { disputeCase, snapshot } = item;
      const auditEntries = store.auditLogger.getEntriesForDispute(id);

      const compileResult = compileEvidencePackage(disputeCase, snapshot, auditEntries);
      if (!compileResult.ok) {
        res.status(409).json({
          success: false,
          error: {
            code: "EVIDENCE_PACKAGE_NOT_AVAILABLE",
            message: `Cannot generate evidence package: ${compileResult.reason}`,
            detail: compileResult.errors.join("; "),
          },
        });
        return;
      }

      const pdfBuffer = await generateEvidencePackagePdf(compileResult.package);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="evidence_package_${id}.pdf"`);
      res.status(200).send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  });

  /**
   * 10. GET /api/evaluation/summary
   * Fetch read-only evaluation benchmark results from docs/eval_results.json.
   */
  router.get("/evaluation/summary", (_req: Request, res: Response) => {
    try {
      const evalPath = path.resolve(process.cwd(), "docs", "eval_results.json");
      const parentEvalPath = path.resolve(process.cwd(), "..", "docs", "eval_results.json");
      let targetPath = evalPath;
      if (!fs.existsSync(targetPath) && fs.existsSync(parentEvalPath)) {
        targetPath = parentEvalPath;
      }

      if (fs.existsSync(targetPath)) {
        const jsonContent = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
        res.status(200).json({
          success: true,
          data: jsonContent,
        });
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: "EVALUATION_SUMMARY_NOT_FOUND",
            message: "docs/eval_results.json file not found on server",
          },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: {
          code: "EVALUATION_READ_ERROR",
          message: `Failed to read evaluation summary: ${msg}`,
        },
      });
    }
  });

  /**
   * 11. POST /api/reset
   * Reset store in-memory state and audit logs to clean initial demo state.
   */
  router.post("/reset", (_req: Request, res: Response) => {
    store.reset();
    res.status(200).json({
      success: true,
      data: {
        status: "reset_complete",
        disputes_count: store.getAllDisputes().length,
      },
    });
  });

  return router;
}
