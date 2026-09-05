import React, { useState } from "react";
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Send,
  FileText,
  Loader2,
  Info,
  Check,
} from "lucide-react";
import type { DisputeDetailDto } from "../../types/api";
import { api } from "../../services/api";
import { StateBadge } from "../operations/OperationsView";
import { EvidenceTopology } from "./EvidenceTopology";
import { EvidenceInspector } from "./EvidenceInspector";
import { AutomationStateBanner } from "./AutomationStateBanner";
import { ResponseIntelligence } from "./ResponseIntelligence";
import { DeterministicValidator } from "./DeterministicValidator";
import { AuditLedger } from "./AuditLedger";
import { EvidencePackageModal } from "./EvidencePackageModal";

interface DisputeWorkspaceProps {
  detail: DisputeDetailDto;
  onBack: () => void;
  onRefresh: () => void;
}

const PIPELINE_STAGES = [
  { id: "RETRIEVAL", label: "EVIDENCE RETRIEVAL" },
  { id: "VERIFICATION", label: "VERIFICATION" },
  { id: "SUFFICIENCY", label: "SUFFICIENCY ASSESSMENT" },
  { id: "DRAFTING", label: "AI DRAFTING" },
  { id: "VALIDATION", label: "FACT VALIDATION" },
  { id: "CONTROL", label: "HUMAN CONTROL" },
];

export const DisputeWorkspace: React.FC<DisputeWorkspaceProps> = ({
  detail,
  onBack,
  onRefresh,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<number>(0);
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleProcess = async () => {
    try {
      setIsProcessing(true);
      setActionError(null);
      setProcessingStage(1);

      // Fast purposeful animation sequence representing real stage progression
      const interval = setInterval(() => {
        setProcessingStage((prev) => (prev < 5 ? prev + 1 : prev));
      }, 350);

      await api.processDispute(detail.dispute_id);
      clearInterval(interval);
      setProcessingStage(6);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setIsProcessing(false);
      setProcessingStage(0);
    }
  };

  const handleApprove = async () => {
    try {
      setIsApproving(true);
      setActionError(null);
      await api.approveDispute(detail.dispute_id);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setIsApproving(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.submitDispute(detail.dispute_id);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canApprove = detail.workflow_state === "HUMAN_APPROVAL_REQUIRED";
  const canSubmit = detail.workflow_state === "READY_FOR_SUBMISSION";
  const isSubmitted = detail.workflow_state === "SUBMITTED";
  const isPdfAvailable =
    detail.workflow_state === "RESPONSE_VALIDATED" ||
    detail.workflow_state === "HUMAN_APPROVAL_REQUIRED" ||
    detail.workflow_state === "READY_FOR_SUBMISSION" ||
    detail.workflow_state === "SUBMITTED";

  // Compute active pipeline step from current state
  const getCurrentStageIndex = (): number => {
    switch (detail.workflow_state) {
      case "RECEIVED":
        return 0;
      case "EVIDENCE_FETCHING":
        return 1;
      case "EVIDENCE_VERIFIED":
        return 2;
      case "SUFFICIENCY_ASSESSED":
      case "MANUAL_REVIEW":
        return 3;
      case "RESPONSE_DRAFTED":
        return 4;
      case "RESPONSE_VALIDATED":
      case "HUMAN_APPROVAL_REQUIRED":
      case "READY_FOR_SUBMISSION":
      case "SUBMITTED":
        return 5;
      default:
        return 0;
    }
  };

  const activeStageIdx = isProcessing ? processingStage : getCurrentStageIndex();

  return (
    <div className="space-y-8 pb-20">
      {/* 1. Header Bar: Navigation + Workflow Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-xs font-mono text-[#8a8880] hover:text-[#f4f3ef] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return to Operations Registry</span>
        </button>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {detail.workflow_state === "RECEIVED" && (
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-sm bg-white text-[#090a0d] hover:bg-[#e2dfd7] text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>EXECUTING PIPELINE...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-[#090a0d]" />
                  <span>PROCESS DISPUTE</span>
                </>
              )}
            </button>
          )}

          {canApprove && (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-sm bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {isApproving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>APPROVING...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>APPROVE RESPONSE</span>
                </>
              )}
            </button>
          )}

          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-sm bg-emerald-500 hover:bg-emerald-400 text-[#090a0d] text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>SUBMITTING...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>SUBMIT (SIMULATED)</span>
                </>
              )}
            </button>
          )}

          {isPdfAvailable && (
            <button
              onClick={() => setShowPdfModal(true)}
              className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-mono text-white transition-colors cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-[#8a8880]" />
              <span>EVIDENCE PACKAGE PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Error Notice */}
      {actionError && (
        <div className="p-3 rounded-sm bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-between">
          <span>Action execution failed: {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Simulated Submission Notice */}
      {isSubmitted && (
        <div className="p-3.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-mono flex items-center space-x-3">
          <Info className="h-4 w-4 text-emerald-400 shrink-0" />
          <div>
            <span className="font-bold text-emerald-300">SIMULATED SUBMISSION LOGGED: </span>
            <span>
              Case state transitioned to SUBMITTED in state machine. No live card network, bank, or payment gateway production API was contacted.
            </span>
          </div>
        </div>
      )}

      {/* 2. Large Editorial Case Identifiers & Financial Values */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <span className="text-[11px] font-mono tracking-widest text-[#8a8880] uppercase">
                INVESTIGATION DOSSIER
              </span>
              <StateBadge state={detail.workflow_state} />
            </div>

            {/* Massive Editorial Dispute Identifier */}
            <h1 className="text-4xl sm:text-5xl font-mono font-medium text-white tracking-tight">
              {detail.dispute_id}
            </h1>

            <p className="text-xs font-mono text-[#8a8880]">
              Transaction ID: <span className="text-white font-semibold">{detail.transaction_id}</span> • Claimed User: <span className="text-white font-semibold">{detail.claimed_user_id}</span>
            </p>
          </div>

          {/* Large Financial Value */}
          <div className="flex flex-col items-start lg:items-end font-mono">
            <span className="text-[10px] text-[#5c5a54] uppercase tracking-wider">DISPUTED AMOUNT</span>
            <div className="flex items-baseline space-x-2 pt-0.5">
              <span className="text-3xl sm:text-4xl font-serif text-white">
                ₹{detail.amount.toLocaleString()}
              </span>
              <span className="text-xs text-[#8a8880] font-mono">{detail.currency}</span>
            </div>
            <span className="text-[11px] text-[#5c5a54] pt-1">
              Reason: {detail.reason_code} (Fraud / Unrecognized)
            </span>
          </div>
        </div>

        {/* Floating Technical Metadata Bar */}
        <div className="pt-3 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-[#5c5a54] block text-[10px]">CHARGEBACK DATE</span>
            <span className="text-[#f4f3ef]">{detail.chargeback_date.split("T")[0]}</span>
          </div>
          <div>
            <span className="text-[#5c5a54] block text-[10px]">SUFFICIENCY CLASSIFICATION</span>
            <span className="text-white font-semibold">
              {detail.sufficiency_classification || "UNASSESSED"}
            </span>
          </div>
          <div>
            <span className="text-[#5c5a54] block text-[10px]">EVIDENCE STATUS</span>
            <span className="text-[#f4f3ef]">
              {detail.verified_evidence_summary.found ? "Merchant Snapshot Verified" : "Pending Extraction"}
            </span>
          </div>
          <div>
            <span className="text-[#5c5a54] block text-[10px]">SECURITY AUDIT</span>
            <span className="text-[#f4f3ef]">{detail.audit_timeline.length} Audit Events</span>
          </div>
        </div>
      </section>

      {/* 3. Fast Purposeful Processing Experience Sequence */}
      <section className="surface-subtle p-3 rounded-sm space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#8a8880]">
          <span>PIPELINE EXECUTION SEQUENCE</span>
          <span>STAGE 0{Math.min(activeStageIdx + 1, 6)} OF 06</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 font-mono text-[10px]">
          {PIPELINE_STAGES.map((st, idx) => {
            const isDone = idx < activeStageIdx;
            const isCurrent = idx === activeStageIdx;

            return (
              <div
                key={st.id}
                className={`p-2 rounded-sm border transition-all ${
                  isCurrent && isProcessing
                    ? "border-amber-400 bg-amber-500/10 text-amber-300"
                    : isDone
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                    : isCurrent
                    ? "border-white/30 bg-white/[0.04] text-white"
                    : "border-white/[0.04] text-[#5c5a54]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px]">0{idx + 1}</span>
                  {isDone && <Check className="h-3 w-3 text-emerald-400" />}
                  {isCurrent && isProcessing && <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />}
                </div>
                <div className="font-semibold truncate">{st.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Deterministic Router State Banner (Authoritative Automation Paused / Eligible) */}
      <AutomationStateBanner detail={detail} />

      {/* 5. Core Visual Feature: Evidence Topology Graph */}
      <EvidenceTopology
        summary={detail.verified_evidence_summary}
        signals={detail.verification_results.signals}
        amount={detail.amount}
        currency={detail.currency}
        workflowState={detail.workflow_state}
        classification={detail.sufficiency_classification}
        validationStatus={detail.validation_status}
      />

      {/* 6. Two-Column Layout: Deep Inspection & Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Columns: Evidence Inspector, AI Intelligence, Hard Fact Validator */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progressive Telemetry Inspector */}
          <EvidenceInspector
            summary={detail.verified_evidence_summary}
            results={detail.verification_results}
          />

          {/* Subordinate Response Intelligence (Groq Draft) */}
          <ResponseIntelligence
            draft={detail.validated_draft}
            workflowState={detail.workflow_state}
          />

          {/* Hard Fact Validator Verification Rows */}
          <DeterministicValidator status={detail.validation_status} />
        </div>

        {/* Right 1 Column: Append-Only Audit Ledger */}
        <div className="space-y-6">
          <AuditLedger timeline={detail.audit_timeline} />
        </div>
      </div>

      {/* 7. Evidence Package PDF Viewer Modal */}
      {showPdfModal && (
        <EvidencePackageModal
          disputeId={detail.dispute_id}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  );
};
