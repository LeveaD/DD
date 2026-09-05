/**
 * PDF Evidence Package Generator — Milestone 5
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/ARCHITECTURE.md §7, Milestone 5 §9–§11
 *
 * Generates a clean, readable PDF evidence package Buffer using PDFKit.
 *
 * SECTIONS RENDERED:
 *   1. Header: DisputeDefend AI — Evidence Package
 *   2. Case Summary: case ID, transaction ID, user ID, amount (major currency units), currency, dates
 *   3. Verified Merchant Evidence: read-only merchant telemetry
 *   4. Verification & Consistency Signals: identity match, IP consistency, TOS, consumption
 *   5. AI-Generated Response Draft: clearly labeled VALIDATED response narrative
 *   6. Audit Trail & Traceability: workflow events, state transitions, timestamps
 *
 * SAFETY INVARIANTS:
 *   - NEVER renders unvalidated/rejected LLM text.
 *   - NEVER includes API keys, secret tokens, or ground_truth labels.
 *   - Clean, professional typography for live hackathon demonstration.
 */

import PDFDocument from "pdfkit";
import type { EvidencePackage } from "./types.js";

/**
 * Generate a PDF document buffer from a compiled EvidencePackage.
 *
 * @param pkg Validated EvidencePackage structure
 * @returns Promise resolving to Node Buffer containing binary PDF data
 */
export function generateEvidencePackagePdf(pkg: EvidencePackage): Promise<Buffer> {
  // Pre-check input EvidencePackage for ground-truth or secret leakage
  const pkgJson = JSON.stringify(pkg);
  if (
    pkgJson.includes("ground_truth") ||
    pkgJson.includes("EvalGroundTruth") ||
    pkgJson.includes("ORACLE_LABEL")
  ) {
    return Promise.reject(
      new Error("GROUND TRUTH LEAKAGE VIOLATION: Evaluation label detected in EvidencePackage!"),
    );
  }

  if (process.env["GROQ_API_KEY"] && process.env["GROQ_API_KEY"].trim() !== "") {
    const key = process.env["GROQ_API_KEY"];
    if (
      key !== "your_groq_api_key_here" &&
      key !== "mock_groq_api_key_for_testing" &&
      pkgJson.includes(key)
    ) {
      return Promise.reject(
        new Error("SECRET LEAKAGE VIOLATION: GROQ_API_KEY detected in EvidencePackage!"),
      );
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const resultBuffer = Buffer.concat(chunks);
        resolve(resultBuffer);
      });
      doc.on("error", (err) => reject(err));

      // Header
      doc.fontSize(20).fillColor("#1e293b").text("DisputeDefend AI — Evidence Package", { align: "center" });
      doc.moveDown(0.4);
      doc
        .fontSize(9)
        .fillColor("#64748b")
        .text(`Package ID: ${pkg.header.package_id}  |  Compiled: ${pkg.header.compiled_at}`, { align: "center" });
      doc.moveDown(1);

      // 1. Case Summary
      doc.fontSize(12).fillColor("#0f172a").text("1. CASE SUMMARY", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#334155");
      doc.text(`Dispute ID: ${pkg.header.dispute_id}`);
      doc.text(`Transaction ID: ${pkg.header.transaction_id}`);
      doc.text(`User ID: ${pkg.header.user_id}`);
      doc.text(`Disputed Amount: ₹${pkg.header.amount.toLocaleString()} (${pkg.header.amount} ${pkg.header.currency}) [Major Currency Units]`);
      doc.text(`Reason Code: ${pkg.header.reason_code}`);
      doc.text(`Chargeback Date: ${pkg.header.chargeback_date}`);
      doc.text(`Current Workflow State: ${pkg.header.workflow_state}`);
      doc.moveDown(0.8);

      // 2. Verified Merchant Evidence
      doc.fontSize(12).fillColor("#0f172a").text("2. VERIFIED MERCHANT EVIDENCE (READ-ONLY TELEMETRY)", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#334155");
      doc.text(`Merchant Database Record Found: ${pkg.verified_evidence.found ? "YES" : "NO"}`);
      if (pkg.verified_evidence.user_name) {
        doc.text(`Customer Name: ${pkg.verified_evidence.user_name} (${pkg.verified_evidence.user_email ?? "N/A"})`);
        doc.text(`Account Registration: ${pkg.verified_evidence.account_created_at ?? "N/A"}`);
      }
      doc.text(
        `Payment Method: ${pkg.verified_evidence.payment_method ?? "N/A"} (Card Last4: ${pkg.verified_evidence.card_last4 ?? "N/A"})`,
      );
      doc.text(`Checkout Timestamp: ${pkg.verified_evidence.transaction_timestamp ?? "N/A"}`);
      doc.text(`Checkout IP Address: ${pkg.verified_evidence.transaction_ip ?? "N/A"} (Supporting Signal)`);
      if (pkg.verified_evidence.tos_version) {
        doc.text(
          `TOS Acceptance Log: Version ${pkg.verified_evidence.tos_version} accepted at ${pkg.verified_evidence.tos_accepted_at} (IP: ${pkg.verified_evidence.tos_ip_address ?? "N/A"})`,
        );
      }
      if (pkg.verified_evidence.consumption_resource_id) {
        doc.text(
          `Digital Resource Access: Resource "${pkg.verified_evidence.consumption_resource_id}" consumed at ${pkg.verified_evidence.consumption_timestamp} (IP: ${pkg.verified_evidence.consumption_ip_address ?? "N/A"}, Bytes: ${pkg.verified_evidence.bytes_downloaded ?? 0})`,
        );
      }
      doc.moveDown(0.8);

      // 3. Verification & Consistency Signals
      doc.fontSize(12).fillColor("#0f172a").text("3. VERIFICATION & CONSISTENCY SIGNALS", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#334155");
      doc.text(`Identity Match (Disputer == Purchaser): ${pkg.signals.identity_match ? "VERIFIED (PASS)" : "MISMATCH (FAIL)"}`);
      doc.text(`IP Consistency (Checkout IP == Session/Access IP): ${pkg.signals.ip_consistency ? "CONSISTENT (PASS)" : "INCONSISTENT / ABSENT SIGNAL"}`);
      doc.text(`Post-Purchase Consumption Log: ${pkg.signals.post_purchase_consumption ? "VERIFIED LOGGED (PASS)" : "NO LOG RECORDED"}`);
      doc.text(`TOS Acceptance Log: ${pkg.signals.tos_accepted ? "VERIFIED ACCEPTED (PASS)" : "NO TOS LOG"}`);
      doc.text(`Temporal Sequence Valid: ${pkg.signals.temporal_sequence_valid ? "VALID (PASS)" : "INVALID SEQUENCE"}`);
      doc.text(`Deterministic Sufficiency Classification: ${pkg.signals.sufficiency_classification}`);
      doc.text(`Critical Contradiction Status: ${pkg.signals.has_critical_contradiction ? "CONTRADICTION DETECTED" : "NONE"}`);
      doc.moveDown(0.8);

      // 4. AI-Generated Response Draft (Validated)
      doc.fontSize(12).fillColor("#0f172a").text("4. AI-GENERATED RESPONSE DRAFT (VALIDATED DRAFT ONLY)", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#475569");
      doc.text(
        `Model Version: ${pkg.validated_response_draft.model_version}  |  Temp: ${pkg.validated_response_draft.temperature}  |  Validated At: ${pkg.validated_response_draft.requested_at}`,
      );
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#0f172a");
      doc.text(`"${pkg.validated_response_draft.narrative}"`);
      doc.moveDown(0.8);

      // 5. Audit Trail & Traceability
      doc.fontSize(12).fillColor("#0f172a").text("5. AUDIT TRAIL & WORKFLOW TRACEABILITY", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#475569");
      if (pkg.audit_trail.length === 0) {
        doc.text("No audit log entries attached.");
      } else {
        for (const entry of pkg.audit_trail) {
          doc.text(`[${entry.timestamp}] ${entry.event_type}: ${entry.previous_state} → ${entry.next_state} (Log ID: ${entry.log_id})`);
        }
      }

      // Footer
      doc.moveDown(1.5);
      doc
        .fontSize(8)
        .fillColor("#94a3b8")
        .text("SIMULATED MERCHANT EVIDENCE PACKAGE — FOR DEMO & HUMAN AUDIT REVIEW ONLY", { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
