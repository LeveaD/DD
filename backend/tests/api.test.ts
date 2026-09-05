/**
 * API Test Suite — Milestone 7
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/ARCHITECTURE.md, Milestone 7 §20 & §21
 *
 * Tests the REST API endpoints using supertest:
 *   - GET  /api/health
 *   - GET  /api/disputes
 *   - GET  /api/disputes/:id
 *   - POST /api/disputes/:id/process
 *   - POST /api/disputes/:id/approve
 *   - POST /api/disputes/:id/submit
 *   - GET  /api/disputes/:id/audit
 *   - GET  /api/disputes/:id/evidence
 *   - GET  /api/disputes/:id/evidence-package
 *   - GET  /api/evaluation/summary
 *   - Security: No ground_truth, no secret keys, strict state machine enforcement, fail-closed handling.
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/api/app.js";
import { DemoDisputeStore } from "../src/api/store.js";
import type { GroqDraftClient } from "../src/llm/groqClient.js";
import type { VerifiedEvidenceSnapshot } from "../src/schemas/index.js";
import { runDraftingPipeline } from "../src/llm/index.js";

function createMockGroqClient(snapshot: VerifiedEvidenceSnapshot): GroqDraftClient {
  return {
    modelId: "openai/gpt-oss-20b",
    temperature: 0.1,
    async generateDraft(): Promise<string> {
      return JSON.stringify({
        transaction_id: snapshot.transaction!.transaction_id,
        user_id: snapshot.user!.user_id,
        transaction_date: snapshot.transaction!.timestamp,
        amount: snapshot.transaction!.amount,
        currency: snapshot.transaction!.currency,
        tos_version: snapshot.tos_log?.tos_version ?? null,
        tos_accepted_at: snapshot.tos_log?.accepted_at ?? null,
        consumption_resource: snapshot.consumption_log?.resource_id ?? null,
        consumption_timestamp: snapshot.consumption_log?.consumed_at ?? null,
        transaction_ip: snapshot.transaction!.ip_address,
        narrative: `Transaction ${snapshot.transaction!.transaction_id} was completed by user ${snapshot.user!.user_id} for amount ${snapshot.transaction!.amount} ${snapshot.transaction!.currency} on ${snapshot.transaction!.timestamp}.`,
      });
    },
  };
}

describe("Milestone 7 — REST API Adapter", () => {
  let store: DemoDisputeStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new DemoDisputeStore();
    app = createApp(store);
  });

  // ---------------------------------------------------------------------------
  // 1. Health Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/health", () => {
    it("returns status 200 with status ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: "ok" },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. List Disputes Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/disputes", () => {
    it("returns pre-seeded demo disputes list", async () => {
      const res = await request(app).get("/api/disputes");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);

      const d1001 = res.body.data.find((d: { id: string }) => d.id === "D-1001");
      expect(d1001).toBeDefined();
      expect(d1001.dispute_id).toBe("D-1001");
      expect(d1001.state).toBe("RECEIVED");
    });

    it("does NOT expose ground_truth or API keys in dispute list", async () => {
      const res = await request(app).get("/api/disputes");
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain("ground_truth");
      expect(jsonStr).not.toContain("gsk_");
      expect(jsonStr).not.toContain("GROQ_API_KEY");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Get Dispute Detail Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/disputes/:id", () => {
    it("returns detailed dispute object for existing dispute", async () => {
      const res = await request(app).get("/api/disputes/D-1001");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("D-1001");
      expect(res.body.data.dispute_id).toBe("D-1001");
      expect(res.body.data.workflow_state).toBe("RECEIVED");
      expect(res.body.data.verified_evidence_summary).toBeDefined();
      expect(res.body.data.verification_results).toBeDefined();
      expect(Array.isArray(res.body.data.audit_timeline)).toBe(true);
    });

    it("returns 404 for unknown dispute ID", async () => {
      const res = await request(app).get("/api/disputes/D-9999");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("DISPUTE_NOT_FOUND");
    });

    it("does NOT expose ground_truth or secrets in detail payload", async () => {
      const res = await request(app).get("/api/disputes/D-1001");
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain("ground_truth");
      expect(jsonStr).not.toContain("gsk_");
      expect(jsonStr).not.toContain("ORACLE");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Process Dispute Endpoint
  // ---------------------------------------------------------------------------
  describe("POST /api/disputes/:id/process", () => {
    it("processes missing evidence dispute (D-1002) -> routes to MANUAL_REVIEW", async () => {
      const res = await request(app).post("/api/disputes/D-1002/process");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workflow_state).toBe("MANUAL_REVIEW");
      expect(res.body.data.sufficiency_classification).toBe("NOT_DEFENDABLE");
    });

    it("processes contradictory evidence dispute (D-1003) -> routes to MANUAL_REVIEW", async () => {
      const res = await request(app).post("/api/disputes/D-1003/process");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workflow_state).toBe("MANUAL_REVIEW");
      expect(res.body.data.sufficiency_classification).toBe("NOT_DEFENDABLE");
    });

    it("processes identity mismatch dispute (D-1004) -> routes to MANUAL_REVIEW", async () => {
      const res = await request(app).post("/api/disputes/D-1004/process");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workflow_state).toBe("MANUAL_REVIEW");
      expect(res.body.data.sufficiency_classification).toBe("NOT_DEFENDABLE");
      expect(res.body.data.verification_results.signals.identity_match).toBe(false);
      expect(res.body.data.verification_results.manual_review_reasons).toContain("IDENTITY_MISMATCH");
      expect(res.body.data.validated_draft).toBeNull();
    });

    it("is idempotent: repeatedly processing an already-processed case returns current state", async () => {
      const first = await request(app).post("/api/disputes/D-1002/process");
      expect(first.body.data.workflow_state).toBe("MANUAL_REVIEW");

      const second = await request(app).post("/api/disputes/D-1002/process");
      expect(second.status).toBe(200);
      expect(second.body.success).toBe(true);
      expect(second.body.data.workflow_state).toBe("MANUAL_REVIEW");
    });

    it("returns 404 when attempting to process unknown dispute", async () => {
      const res = await request(app).post("/api/disputes/D-UNKNOWN/process");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("DISPUTE_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Approval Endpoint
  // ---------------------------------------------------------------------------
  describe("POST /api/disputes/:id/approve", () => {
    it("transitions state from HUMAN_APPROVAL_REQUIRED -> READY_FOR_SUBMISSION on approval", async () => {
      // Setup: move D-1001 into HUMAN_APPROVAL_REQUIRED using mock LLM
      const item = store.getDispute("D-1001")!;
      item.disputeCase.current_state = "SUFFICIENCY_ASSESSED";
      const mockClient = createMockGroqClient(item.snapshot);
      await runDraftingPipeline({
        disputeCase: item.disputeCase,
        snapshot: item.snapshot,
        client: mockClient,
        auditLogger: store.auditLogger,
      });
      expect(item.disputeCase.current_state).toBe("HUMAN_APPROVAL_REQUIRED");

      // Execute approve endpoint
      const res = await request(app).post("/api/disputes/D-1001/approve");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workflow_state).toBe("READY_FOR_SUBMISSION");
    });

    it("rejects approval with 409 Conflict when state is NOT HUMAN_APPROVAL_REQUIRED", async () => {
      // D-1001 is in RECEIVED state initially
      const res = await request(app).post("/api/disputes/D-1001/approve");
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects approval for dispute in MANUAL_REVIEW state with 409 Conflict", async () => {
      await request(app).post("/api/disputes/D-1002/process"); // moves to MANUAL_REVIEW
      const res = await request(app).post("/api/disputes/D-1002/approve");
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Submission Endpoint
  // ---------------------------------------------------------------------------
  describe("POST /api/disputes/:id/submit", () => {
    it("transitions from READY_FOR_SUBMISSION -> SUBMITTED and marks as simulated", async () => {
      const item = store.getDispute("D-1001")!;
      item.disputeCase.current_state = "READY_FOR_SUBMISSION";

      const res = await request(app).post("/api/disputes/D-1001/submit");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workflow_state).toBe("SUBMITTED");
      expect(res.body.data.is_simulated).toBe(true);
      expect(res.body.data.submission_notice).toContain("SIMULATED SUBMISSION");
    });

    it("rejects submission directly from HUMAN_APPROVAL_REQUIRED with 409 Conflict", async () => {
      const item = store.getDispute("D-1001")!;
      item.disputeCase.current_state = "HUMAN_APPROVAL_REQUIRED";

      const res = await request(app).post("/api/disputes/D-1001/submit");
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects submission from RECEIVED state with 409 Conflict", async () => {
      const res = await request(app).post("/api/disputes/D-1001/submit");
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Audit Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/disputes/:id/audit", () => {
    it("returns chronological audit log entries for dispute", async () => {
      await request(app).post("/api/disputes/D-1002/process");
      const res = await request(app).get("/api/disputes/D-1002/audit");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].dispute_id).toBe("D-1002");
    });

    it("returns 404 for unknown dispute audit query", async () => {
      const res = await request(app).get("/api/disputes/D-9999/audit");
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Evidence Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/disputes/:id/evidence", () => {
    it("returns verified evidence summary distinct from generated draft", async () => {
      const item = store.getDispute("D-1001")!;
      const res = await request(app).get("/api/disputes/D-1001/evidence");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dispute_id).toBe("D-1001");
      expect(res.body.data.verified_evidence_summary).toBeDefined();
      expect(res.body.data.verified_evidence_summary.user_id).toBe(item.snapshot.user?.user_id);
      // Must not contain generated response draft
      expect(res.body.data.validated_draft).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. PDF Evidence Package Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/disputes/:id/evidence-package", () => {
    it("generates and streams PDF for validated dispute case", async () => {
      // Prepare case D-1001 in HUMAN_APPROVAL_REQUIRED with mock draft
      const item = store.getDispute("D-1001")!;
      item.disputeCase.current_state = "SUFFICIENCY_ASSESSED";
      const mockClient = createMockGroqClient(item.snapshot);
      await runDraftingPipeline({
        disputeCase: item.disputeCase,
        snapshot: item.snapshot,
        client: mockClient,
        auditLogger: store.auditLogger,
      });

      const res = await request(app).get("/api/disputes/D-1001/evidence-package");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toBe("application/pdf");
      expect(res.header["content-disposition"]).toContain("evidence_package_D-1001.pdf");
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(100);
    });

    it("rejects package generation for case in MANUAL_REVIEW state with 409 Conflict", async () => {
      await request(app).post("/api/disputes/D-1002/process"); // moves to MANUAL_REVIEW
      const res = await request(app).get("/api/disputes/D-1002/evidence-package");

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("EVIDENCE_PACKAGE_NOT_AVAILABLE");
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Evaluation Summary Endpoint
  // ---------------------------------------------------------------------------
  describe("GET /api/evaluation/summary", () => {
    it("returns evaluation benchmark metrics summary", async () => {
      const res = await request(app).get("/api/evaluation/summary");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.evaluation_a).toBeDefined();
      expect(res.body.data.evaluation_b).toBeDefined();
      expect(res.body.data.evaluation_a.combined.precision).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Security & Fail-Closed Tests
  // ---------------------------------------------------------------------------
  describe("Security & Boundary Verification", () => {
    it("ignores client attempts to force state via request body", async () => {
      const res = await request(app)
        .post("/api/disputes/D-1001/approve")
        .send({ state: "SUBMITTED" }); // Malicious client payload trying to force state

      // D-1001 is in RECEIVED state, so approval is rejected despite body payload
      expect(res.status).toBe(409);
      const item = store.getDispute("D-1001")!;
      expect(item.disputeCase.current_state).toBe("RECEIVED");
    });

    it("returns 404 for non-existent API routes", async () => {
      const res = await request(app).get("/api/non-existent-endpoint");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Reset Endpoint
  // ---------------------------------------------------------------------------
  describe("POST /api/reset", () => {
    it("resets store state and audit log to clean initial state", async () => {
      // Process a dispute first
      await request(app).post("/api/disputes/D-1002/process");
      const beforeReset = store.getDispute("D-1002")!;
      expect(beforeReset.disputeCase.current_state).toBe("MANUAL_REVIEW");
      expect(store.auditLogger.getAllEntries().length).toBeGreaterThan(0);

      // Call reset endpoint
      const res = await request(app).post("/api/reset");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("reset_complete");
      expect(res.body.data.disputes_count).toBe(4);

      // Verify D-1002 is back in RECEIVED state and audit log is empty
      const afterReset = store.getDispute("D-1002")!;
      expect(afterReset.disputeCase.current_state).toBe("RECEIVED");
      expect(store.auditLogger.getAllEntries().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Controlled Validator Failure Demo
  // ---------------------------------------------------------------------------
  describe("Controlled Validator Failure Pipeline", () => {
    it("fails closed to MANUAL_REVIEW when model generates corrupted entity, retains in audit, excludes from package", async () => {
      const item = store.getDispute("D-1001")!;
      item.disputeCase.current_state = "SUFFICIENCY_ASSESSED";

      // Mock LLM client generating an altered financial amount (999999 instead of 3999)
      const corruptedClient: GroqDraftClient = {
        modelId: "openai/gpt-oss-20b",
        temperature: 0.1,
        async generateDraft() {
          return JSON.stringify({
            transaction_id: item.snapshot.transaction!.transaction_id,
            user_id: item.snapshot.user!.user_id,
            transaction_date: item.snapshot.transaction!.timestamp,
            amount: 999999, // CORRUPTED AMOUNT
            currency: item.snapshot.transaction!.currency,
            tos_version: item.snapshot.tos_log?.tos_version ?? null,
            tos_accepted_at: item.snapshot.tos_log?.accepted_at ?? null,
            consumption_resource: item.snapshot.consumption_log?.resource_id ?? null,
            consumption_timestamp: item.snapshot.consumption_log?.consumed_at ?? null,
            transaction_ip: item.snapshot.transaction!.ip_address,
            narrative: "Transaction with corrupted amount.",
          });
        },
      };

      const result = await runDraftingPipeline({
        disputeCase: item.disputeCase,
        snapshot: item.snapshot,
        client: corruptedClient,
        auditLogger: store.auditLogger,
      });

      // Assertions
      expect(result.success).toBe(false);
      expect(result.final_state).toBe("MANUAL_REVIEW");
      expect(item.disputeCase.current_state).toBe("MANUAL_REVIEW");
      expect(item.disputeCase.llm_draft).toBeUndefined(); // Excluded from package
      expect(item.disputeCase.validation_result?.passed).toBe(false);

      // Verify rejected draft retained in audit log
      const auditEntries = store.auditLogger.getEntriesForDispute("D-1001");
      const failEntry = auditEntries.find((e) => e.event_type === "POST_GEN_VALIDATION_FAILED");
      expect(failEntry).toBeDefined();
      expect(failEntry?.llm_output).toContain("999999");

      // Verify PDF package cannot be generated
      const pdfRes = await request(app).get("/api/disputes/D-1001/evidence-package");
      expect(pdfRes.status).toBe(409);
      expect(pdfRes.body.error.code).toBe("EVIDENCE_PACKAGE_NOT_AVAILABLE");
    });
  });
});
