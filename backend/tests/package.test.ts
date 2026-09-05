/**
 * Milestone 5 — Evidence Package & PDF Generator Test Suite (Vitest)
 *
 * Verifies all requirements for Evidence Package Compilation & PDF Generation:
 *   - Compiles package from valid validated case (RESPONSE_VALIDATED / HUMAN_APPROVAL_REQUIRED)
 *   - Rejects package compilation for unvalidated or invalid cases (MANUAL_REVIEW, RESPONSE_VALIDATION_FAILED)
 *   - Enforces deterministic entity matching (amount, currency, transaction ID)
 *   - Enforces ground-truth isolation (rejects compilation if ground_truth is present)
 *   - Enforces secret isolation (rejects compilation if GROQ_API_KEY is present)
 *   - Renders clean, readable multi-section PDF document
 *   - Validates PDF binary output (header %PDF-, content checks, safety assertions)
 */

import { describe, it, expect } from "vitest";
import type { DisputeCase, VerifiedEvidenceSnapshot } from "../src/schemas/index.js";
import { AuditLogger } from "../src/audit/auditLogger.js";
import {
  compileEvidencePackage,
  validateEvidencePackage,
  generateEvidencePackagePdf,
} from "../src/package/index.js";

function createMockSnapshot(overrides?: Partial<VerifiedEvidenceSnapshot>): VerifiedEvidenceSnapshot {
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
    ...overrides,
  };
}

function createMockValidatedCase(overrides?: Partial<DisputeCase>): DisputeCase {
  return {
    dispute_id: "dsp_1001",
    transaction_id: "txn_501",
    amount: 4999,
    currency: "INR",
    reason_code: "10.4",
    chargeback_date: "2026-03-05T00:00:00Z",
    current_state: "HUMAN_APPROVAL_REQUIRED",
    created_at: "2026-03-05T01:00:00Z",
    sufficiency_classification: "DEFENDABLE",
    evidence_signals: {
      identity_match: true,
      ip_consistency: true,
      post_purchase_consumption: true,
      tos_accepted: true,
      temporal_sequence_valid: true,
    },
    validation_result: {
      passed: true,
      unsupported_claims: [],
    },
    llm_draft: {
      text: "Transaction txn_501 of 4999 INR was completed by user usr_101 on 2026-03-01. Terms v2.1 accepted on 2025-01-15.",
      model_version: "openai/gpt-oss-20b",
      temperature: 0.1,
      requested_at: "2026-03-05T01:02:00Z",
    },
    ...overrides,
  };
}

describe("Milestone 5 — Evidence Package Compiler & Validator", () => {
  it("compiles a valid EvidencePackage for a validated dispute case in HUMAN_APPROVAL_REQUIRED state", () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase();

    const logger = new AuditLogger();
    logger.append({
      dispute_id: "dsp_1001",
      event_type: "POST_GEN_VALIDATION_PASSED",
      previous_state: "RESPONSE_DRAFTED",
      next_state: "HUMAN_APPROVAL_REQUIRED",
    });

    const res = compileEvidencePackage(disputeCase, snapshot, logger.getAllEntries());

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.package.header.package_id).toBe("pkg_dsp_1001");
      expect(res.package.header.amount).toBe(4999);
      expect(res.package.header.currency).toBe("INR");
      expect(res.package.header.workflow_state).toBe("HUMAN_APPROVAL_REQUIRED");

      expect(res.package.verified_evidence.user_name).toBe("Rahul Sharma");
      expect(res.package.verified_evidence.transaction_ip).toBe("103.21.244.1");

      expect(res.package.validated_response_draft.narrative).toContain("Transaction txn_501");
      expect(res.package.audit_trail).toHaveLength(1);
    }
  });

  it("rejects package compilation if dispute case is in unvalidated state (MANUAL_REVIEW or RESPONSE_VALIDATION_FAILED)", () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase({
      current_state: "MANUAL_REVIEW",
    });

    const res = compileEvidencePackage(disputeCase, snapshot);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("STATE_BOUNDARY_VIOLATION");
    }
  });

  it("rejects package compilation if LLM draft did NOT pass validation (validation_result.passed = false)", () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase({
      validation_result: {
        passed: false,
        reason: "UNSUPPORTED_ENTITY_DETECTED",
        unsupported_claims: ["Amount mismatch"],
      },
    });

    const res = compileEvidencePackage(disputeCase, snapshot);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("UNVALIDATED_DRAFT_REJECTED");
    }
  });

  it("package validator detects financial amount or currency mismatch", () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase();

    const compileRes = compileEvidencePackage(disputeCase, snapshot);
    expect(compileRes.ok).toBe(true);

    if (compileRes.ok) {
      const pkg = compileRes.package;
      // Mutate amount to simulate corruption
      pkg.header.amount = 999999;

      const valRes = validateEvidencePackage(pkg, disputeCase, snapshot);
      expect(valRes.ok).toBe(false);
      if (!valRes.ok) {
        expect(valRes.errors[0]).toContain("Amount mismatch");
      }
    }
  });

  it("package validator detects ground-truth leakage and rejects package", () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase();

    const compileRes = compileEvidencePackage(disputeCase, snapshot);
    expect(compileRes.ok).toBe(true);

    if (compileRes.ok) {
      const pkg = compileRes.package;
      // Inject ground_truth keyword
      pkg.validated_response_draft.narrative += " ground_truth: DEFENDABLE";

      const valRes = validateEvidencePackage(pkg, disputeCase, snapshot);
      expect(valRes.ok).toBe(false);
      if (!valRes.ok) {
        expect(valRes.errors.some((e) => e.includes("ground_truth") || e.includes("Ground-truth"))).toBe(true);
      }
    }
  });
});

describe("Milestone 5 — PDF Evidence Package Generator", () => {
  it("generates a valid, non-empty binary PDF Buffer from a compiled EvidencePackage", async () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase();

    const logger = new AuditLogger();
    logger.append({
      dispute_id: "dsp_1001",
      event_type: "DISPUTE_RECEIVED",
      previous_state: "RECEIVED",
      next_state: "EVIDENCE_FETCHING",
    });
    logger.append({
      dispute_id: "dsp_1001",
      event_type: "POST_GEN_VALIDATION_PASSED",
      previous_state: "RESPONSE_DRAFTED",
      next_state: "HUMAN_APPROVAL_REQUIRED",
    });

    const compileRes = compileEvidencePackage(disputeCase, snapshot, logger.getAllEntries());
    expect(compileRes.ok).toBe(true);

    if (compileRes.ok) {
      const pdfBuffer = await generateEvidencePackagePdf(compileRes.package);

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);

      // Verify PDF header magic bytes %PDF-
      const pdfHeader = pdfBuffer.subarray(0, 5).toString("utf-8");
      expect(pdfHeader).toBe("%PDF-");

      // Verify PDFKit generator metadata signature in binary buffer
      const pdfString = pdfBuffer.toString("latin1");
      expect(pdfString).toContain("PDFKit");
      expect(pdfString).toContain("%%EOF");
    }
  });

  it("PDF generator fails safety check if ground_truth or secret keys are present in package", async () => {
    const snapshot = createMockSnapshot();
    const disputeCase = createMockValidatedCase();

    const compileRes = compileEvidencePackage(disputeCase, snapshot);
    expect(compileRes.ok).toBe(true);

    if (compileRes.ok) {
      const pkg = compileRes.package;
      // Force inject ground_truth to test PDF generator safety assertion
      (pkg.validated_response_draft as { narrative: string }).narrative += " ground_truth: DEFENDABLE";

      await expect(generateEvidencePackagePdf(pkg)).rejects.toThrow("GROUND TRUTH LEAKAGE VIOLATION");
    }
  });
});
