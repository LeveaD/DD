/**
 * Frontend Unit & Integration Tests — Milestone 8
 *
 * Source of truth: Milestone 8 §35
 * Tests API client mappings, DTO structures, and component helper logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../services/api";

describe("Frontend API Client Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches health status successfully", async () => {
    const mockData = { success: true, data: { status: "ok" } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as unknown as Response);

    const res = await api.getHealth();
    expect(res.status).toBe("ok");
    expect(global.fetch).toHaveBeenCalledWith("/api/health", expect.anything());
  });

  it("fetches disputes list successfully", async () => {
    const mockList = [
      {
        id: "D-1001",
        dispute_id: "D-1001",
        transaction_id: "txn_501",
        amount: 4999,
        currency: "INR",
        reason_code: "10.4",
        chargeback_date: "2026-03-05T00:00:00Z",
        state: "RECEIVED",
        classification: "DEFENDABLE",
      },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockList }),
    } as unknown as Response);

    const res = await api.getDisputes();
    expect(res.length).toBe(1);
    expect(res[0].dispute_id).toBe("D-1001");
  });

  it("triggers process dispute via POST request", async () => {
    const mockDetail = {
      id: "D-1001",
      dispute_id: "D-1001",
      transaction_id: "txn_501",
      claimed_user_id: "usr_101",
      amount: 4999,
      currency: "INR",
      reason_code: "10.4",
      chargeback_date: "2026-03-05T00:00:00Z",
      workflow_state: "HUMAN_APPROVAL_REQUIRED",
      sufficiency_classification: "DEFENDABLE",
      verified_evidence_summary: { found: true },
      verification_results: { signals: null, supporting_signals: [], missing_or_contradicted_signals: [], manual_review_reasons: [], summary: null },
      validated_draft: null,
      validation_status: null,
      audit_timeline: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockDetail }),
    } as unknown as Response);

    const res = await api.processDispute("D-1001");
    expect(res.dispute_id).toBe("D-1001");
    expect(global.fetch).toHaveBeenCalledWith("/api/disputes/D-1001/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("handles API error responses cleanly without crashing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: { code: "DISPUTE_NOT_FOUND", message: "Dispute not found" },
      }),
    } as unknown as Response);

    await expect(api.getDisputeDetail("D-9999")).rejects.toThrow("Dispute not found");
  });
});
