/**
 * Milestone 5 — Application-Level Append-Only Audit Log Test Suite (Vitest)
 *
 * Verifies all requirements for audit logging in Milestone 5:
 *   - Append and retrieve only (no update or delete APIs exist)
 *   - Event order preservation
 *   - Rejected LLM output retention in audit entries (with exact audit semantic string)
 *   - Secret key sanitization (GROQ_API_KEY is never logged)
 *   - Integration with runDraftingPipeline
 */

import { describe, it, expect } from "vitest";
import { AuditLogger, REJECTED_DRAFT_AUDIT_SEMANTIC } from "../src/audit/auditLogger.js";
import { runDraftingPipeline } from "../src/llm/index.js";
import type { DisputeCase, VerifiedEvidenceSnapshot } from "../src/schemas/index.js";

function createMockSnapshot(): VerifiedEvidenceSnapshot {
  return {
    found: true,
    user: {
      user_id: "usr_101",
      name: "Rahul Sharma",
      email: "rahul.sharma@example.com",
      created_at: "2025-01-15T08:30:00Z",
    },
    transaction: {
      transaction_id: "txn_501",
      user_id: "usr_101",
      amount: 4999,
      currency: "INR",
      timestamp: "2026-03-01T10:00:00Z",
      ip_address: "103.21.244.1",
      payment_method: "card",
      card_last4: "4321",
    },
    ip_logs: [],
    tos_log: {
      tos_id: "tos_001",
      user_id: "usr_101",
      tos_version: "v2.1",
      accepted_at: "2025-01-15T08:31:00Z",
      ip_address: "103.21.244.1",
    },
    consumption_log: {
      consumption_id: "csl_001",
      user_id: "usr_101",
      transaction_id: "txn_501",
      resource_id: "res_analytics_pro",
      consumed_at: "2026-03-01T10:05:00Z",
      ip_address: "103.21.244.1",
      bytes_downloaded: 1048576,
    },
  };
}

function createMockDisputeCase(): DisputeCase {
  return {
    dispute_id: "dsp_1001",
    transaction_id: "txn_501",
    amount: 4999,
    currency: "INR",
    reason_code: "10.4",
    chargeback_date: "2026-03-05T00:00:00Z",
    current_state: "SUFFICIENCY_ASSESSED",
    created_at: "2026-03-05T01:00:00Z",
    sufficiency_classification: "DEFENDABLE",
  };
}

describe("Milestone 5 — Append-Only Audit Log", () => {
  it("appends entries and retrieves them by dispute ID preserving insertion order", () => {
    const logger = new AuditLogger();

    const e1 = logger.append({
      dispute_id: "dsp_1001",
      event_type: "DISPUTE_RECEIVED",
      previous_state: "RECEIVED",
      next_state: "EVIDENCE_FETCHING",
    });

    const e2 = logger.append({
      dispute_id: "dsp_1001",
      event_type: "EVIDENCE_VERIFIED",
      previous_state: "EVIDENCE_FETCHING",
      next_state: "EVIDENCE_VERIFIED",
    });

    const e3 = logger.append({
      dispute_id: "dsp_1002",
      event_type: "DISPUTE_RECEIVED",
      previous_state: "RECEIVED",
      next_state: "EVIDENCE_FETCHING",
    });

    const entries1001 = logger.getEntriesForDispute("dsp_1001");
    expect(entries1001).toHaveLength(2);
    expect(entries1001[0]?.log_id).toBe(e1.log_id);
    expect(entries1001[1]?.log_id).toBe(e2.log_id);

    const all = logger.getAllEntries();
    expect(all).toHaveLength(3);
    expect(all[2]?.log_id).toBe(e3.log_id);
  });

  it("does NOT expose update, modify, or delete API methods", () => {
    const logger = new AuditLogger() as unknown as Record<string, unknown>;

    expect(logger["update"]).toBeUndefined();
    expect(logger["modify"]).toBeUndefined();
    expect(logger["delete"]).toBeUndefined();
    expect(logger["remove"]).toBeUndefined();
    expect(logger["pop"]).toBeUndefined();
  });

  it("retains rejected LLM output in audit entries when validation fails during drafting pipeline", async () => {
    const logger = new AuditLogger();
    const snapshot = createMockSnapshot();
    const disputeCase = createMockDisputeCase();

    // Mock client returning an invalid response with mutated amount
    const invalidJson = JSON.stringify({
      transaction_id: "txn_501",
      user_id: "usr_101",
      transaction_date: "2026-03-01T10:00:00Z",
      amount: 999999, // Amount alteration
      currency: "INR",
      tos_version: "v2.1",
      tos_accepted_at: "2025-01-15T08:31:00Z",
      consumption_resource: "res_analytics_pro",
      consumption_timestamp: "2026-03-01T10:05:00Z",
      transaction_ip: "103.21.244.1",
      narrative: "Mutated amount draft",
    });

    const mockClient = {
      modelId: "openai/gpt-oss-20b",
      temperature: 0.1,
      generateDraft: async () => invalidJson,
    };

    const res = await runDraftingPipeline({
      disputeCase,
      snapshot,
      client: mockClient,
      auditLogger: logger,
    });

    expect(res.success).toBe(false);
    expect(res.final_state).toBe("MANUAL_REVIEW");
    expect(disputeCase.llm_draft).toBeUndefined(); // Excluded from final package

    // Verify rejected draft retained in audit logger
    const entries = logger.getEntriesForDispute("dsp_1001");
    const failEntry = entries.find((e) => e.event_type === "POST_GEN_VALIDATION_FAILED");

    expect(failEntry).toBeDefined();
    expect(failEntry?.llm_output).toBe(invalidJson);
    expect(failEntry?.validation_result?.passed).toBe(false);
    expect(res.audit_note).toBe(REJECTED_DRAFT_AUDIT_SEMANTIC);
  });

  it("sanitizes secret API key patterns so credentials are never logged in audit entries", () => {
    process.env["GROQ_API_KEY"] = "gsk_secret_test_key_123456789";
    const logger = new AuditLogger();

    const entry = logger.append({
      dispute_id: "dsp_1001",
      event_type: "SYSTEM_ERROR",
      previous_state: "SUFFICIENCY_ASSESSED",
      next_state: "MANUAL_REVIEW",
      failure_reason: "Failed call with key gsk_secret_test_key_123456789",
      llm_output: "Response containing gsk_secret_test_key_123456789",
    });

    expect(entry.failure_reason).not.toContain("gsk_secret_test_key_123456789");
    expect(entry.llm_output).not.toContain("gsk_secret_test_key_123456789");
    expect(entry.failure_reason).toContain("[REDACTED");
    expect(entry.llm_output).toContain("[REDACTED");
  });
});
