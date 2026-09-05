import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  Send,
  FileText,
  Loader2,
  Info,
  Check,
  ExternalLink,
} from "lucide-react";
import type { DisputeListItemDto, DisputeDetailDto } from "../../types/api";
import { api } from "../../services/api";
import { EvidenceTopology } from "../investigation/EvidenceTopology";
import { EvidenceInspector } from "../investigation/EvidenceInspector";
import { AutomationStateBanner } from "../investigation/AutomationStateBanner";
import { ResponseIntelligence } from "../investigation/ResponseIntelligence";
import { DeterministicValidator } from "../investigation/DeterministicValidator";
import { AuditLedger } from "../investigation/AuditLedger";
import { EvidencePackageModal } from "../investigation/EvidencePackageModal";

interface OperationsViewProps {
  disputes: DisputeListItemDto[];
  activeDisputeId: string;
  activeDisputeDetail: DisputeDetailDto | null;
  isLoadingDetail: boolean;
  onSelectDispute: (id: string) => void;
  onRefreshDetail: () => void;
  onNavigateToDisputes: () => void;
}

const PIPELINE_STAGES = [
  { id: "RETRIEVAL", label: "INGEST" },
  { id: "VERIFICATION", label: "VERIFY" },
  { id: "SUFFICIENCY", label: "ASSESS" },
  { id: "DRAFTING", label: "DRAFT" },
  { id: "VALIDATION", label: "VALIDATE" },
  { id: "CONTROL", label: "CONTROL" },
];

export const OperationsView: React.FC<OperationsViewProps> = ({
  disputes,
  activeDisputeId,
  activeDisputeDetail,
  isLoadingDetail,
  onSelectDispute,
  onRefreshDetail,
  onNavigateToDisputes,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<number>(0);
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const detail = activeDisputeDetail;

  const handleProcess = async () => {
    if (!detail) return;
    try {
      setIsProcessing(true);
      setActionError(null);
      setProcessingStage(1);

      const interval = setInterval(() => {
        setProcessingStage((prev) => (prev < 5 ? prev + 1 : prev));
      }, 350);

      await api.processDispute(detail.dispute_id);
      clearInterval(interval);
      setProcessingStage(6);
      onRefreshDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setIsProcessing(false);
      setProcessingStage(0);
    }
  };

  const handleApprove = async () => {
    if (!detail) return;
    try {
      setIsApproving(true);
      setActionError(null);
      await api.approveDispute(detail.dispute_id);
      onRefreshDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setIsApproving(false);
    }
  };

  const handleSubmit = async () => {
    if (!detail) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.submitDispute(detail.dispute_id);
      onRefreshDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canApprove = detail?.workflow_state === "HUMAN_APPROVAL_REQUIRED";
  const canSubmit = detail?.workflow_state === "READY_FOR_SUBMISSION";
  const isSubmitted = detail?.workflow_state === "SUBMITTED";
  const isPdfAvailable =
    detail?.workflow_state === "RESPONSE_VALIDATED" ||
    detail?.workflow_state === "HUMAN_APPROVAL_REQUIRED" ||
    detail?.workflow_state === "READY_FOR_SUBMISSION" ||
    detail?.workflow_state === "SUBMITTED";

  const getCurrentStageIndex = (): number => {
    if (!detail) return 0;
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

  // Canonical cases
  const canonicalIds = ["D-1001", "D-1002", "D-1003", "D-1004"];

  // Dynamic telemetry calculations without hardcoded discrepancies
  const totalCount = disputes.length;
  const defendableCount = disputes.filter(
    (d) =>
      d.classification === "DEFENDABLE" ||
      d.state === "HUMAN_APPROVAL_REQUIRED" ||
      d.state === "READY_FOR_SUBMISSION" ||
      d.state === "SUBMITTED",
  ).length;
  const manualReviewCount = disputes.filter(
    (d) => d.state === "MANUAL_REVIEW" && d.classification !== "DEFENDABLE",
  ).length;
  const pendingCount = disputes.filter((d) => d.state === "RECEIVED").length;

  const defendablePercent = totalCount > 0 ? ((defendableCount / totalCount) * 100).toFixed(0) : "0";
  const manualReviewPercent = totalCount > 0 ? ((manualReviewCount / totalCount) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-3 pb-16">
      {/* 1. Sleek Forensic Instrument Top Bar (Above-The-Fold Controller) */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-2 border-b border-white/[0.07] pb-2">
        {/* Dossier Selector Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto font-mono text-xs">
          <span className="text-[10px] text-[#5c5a54] uppercase tracking-wider pr-1 shrink-0 font-semibold">
            ACTIVE DOSSIER:
          </span>

          {canonicalIds.map((cId) => {
            const disputeItem = disputes.find((d) => d.dispute_id === cId);
            const isSelected = activeDisputeId === cId;
            const isDefendable =
              disputeItem?.classification === "DEFENDABLE" ||
              disputeItem?.state === "HUMAN_APPROVAL_REQUIRED" ||
              disputeItem?.state === "READY_FOR_SUBMISSION" ||
              disputeItem?.state === "SUBMITTED";
            const isReceived = disputeItem?.state === "RECEIVED";

            return (
              <button
                key={cId}
                onClick={() => onSelectDispute(cId)}
                className={`px-2.5 py-1 rounded-sm flex items-center space-x-1.5 transition-all shrink-0 cursor-pointer text-xs ${
                  isSelected
                    ? "bg-white/[0.1] text-white border-b-2 border-white font-semibold"
                    : "text-[#8a8880] hover:text-white hover:bg-white/[0.03] border-b-2 border-transparent"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isReceived
                      ? "bg-[#5c5a54]"
                      : isDefendable
                      ? "bg-emerald-400"
                      : "bg-amber-400"
                  }`}
                />
                <span className="font-bold">{cId}</span>
                <span className="text-[10px] text-[#5c5a54]">
                  {disputeItem ? `₹${disputeItem.amount.toLocaleString()}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Case Context + Actions */}
        {detail && (
          <div className="flex items-center justify-between sm:justify-end space-x-3 font-mono text-xs">
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-white font-bold">{detail.dispute_id}</span>
              <span className="text-[#5c5a54]">•</span>
              <span className="text-[#f4f3ef] font-semibold">
                ₹{detail.amount.toLocaleString()} {detail.currency}
              </span>
              <span className="text-[#5c5a54] hidden sm:inline">•</span>
              <span className="text-[#8a8880] text-[11px] hidden sm:inline truncate max-w-[140px]">
                Txn: {detail.transaction_id}
              </span>
              <StateBadge state={detail.workflow_state} classification={detail.sufficiency_classification} />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 shrink-0">
              {detail.workflow_state === "RECEIVED" && (
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-sm bg-white text-[#090a0d] hover:bg-[#e2dfd7] font-bold text-xs transition-all cursor-pointer"
                >
                  <Play className="h-3 w-3 fill-[#090a0d]" />
                  <span>PROCESS</span>
                </button>
              )}
              {canApprove && (
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-sm bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>APPROVE</span>
                </button>
              )}
              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-sm bg-emerald-500 hover:bg-emerald-400 text-[#090a0d] font-bold text-xs transition-all cursor-pointer"
                >
                  <Send className="h-3 w-3" />
                  <span>SUBMIT</span>
                </button>
              )}
              {isPdfAvailable && (
                <button
                  onClick={() => setShowPdfModal(true)}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-white text-xs transition-colors cursor-pointer"
                >
                  <FileText className="h-3 w-3 text-[#8a8880]" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 2. Compact Pipeline Execution Sequence (Single Slim Line, Height: ~22px) */}
      <section className="flex items-center justify-between text-[10px] font-mono border-b border-white/[0.05] pb-1.5 text-[#8a8880]">
        <div className="flex items-center space-x-1 overflow-x-auto">
          {PIPELINE_STAGES.map((st, idx) => {
            const isDone = idx < activeStageIdx;
            const isCurrent = idx === activeStageIdx;
            return (
              <React.Fragment key={st.id}>
                {idx > 0 && <span className="text-[#5c5a54] px-1">→</span>}
                <span
                  className={`flex items-center space-x-1 ${
                    isCurrent && isProcessing
                      ? "text-amber-300 font-bold"
                      : isDone
                      ? "text-emerald-400 font-medium"
                      : isCurrent
                      ? "text-white font-bold"
                      : "text-[#5c5a54]"
                  }`}
                >
                  <span>0{idx + 1} {st.label}</span>
                  {isDone && <Check className="h-2.5 w-2.5 text-emerald-400" />}
                  {isCurrent && isProcessing && <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin" />}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        <span className="text-[9px] text-[#5c5a54] hidden md:inline">
          DETERMINISTIC VERIFICATION SEQUENCE
        </span>
      </section>

      {/* Action Error Notice */}
      {actionError && (
        <div className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-between">
          <span>Action failed: {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Simulated Submission Notice */}
      {isSubmitted && (
        <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-mono flex items-center space-x-2">
          <Info className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px]">
            <strong className="text-emerald-300">SIMULATED SUBMISSION: </strong>
            Case state transitioned to SUBMITTED in state machine. No real payment network was contacted.
          </span>
        </div>
      )}

      {isLoadingDetail || !detail ? (
        <div className="py-20 text-center font-mono text-xs text-[#8a8880] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="h-5 w-5 text-white animate-spin" />
          <p>Accessing verified merchant telemetry for case {activeDisputeId}...</p>
        </div>
      ) : (
        <>
          {/* 3. PRIMARY VISUAL ELEMENT: EVIDENCE TOPOLOGY GRAPH (Dominant Above-The-Fold!) */}
          <EvidenceTopology
            summary={detail.verified_evidence_summary}
            signals={detail.verification_results.signals}
            amount={detail.amount}
            currency={detail.currency}
            workflowState={detail.workflow_state}
            classification={detail.sufficiency_classification}
            validationStatus={detail.validation_status}
          />

          {/* 4. Deterministic Router State Banner */}
          <AutomationStateBanner detail={detail} />

          {/* 5. Deep Forensic Investigation Grid (Progressive Telemetry, AI, Validator, Audit) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start pt-1">
            {/* Left 2 Columns: Evidence Inspector, Response Intelligence, Hard Fact Validator */}
            <div className="lg:col-span-2 space-y-4">
              <EvidenceInspector
                summary={detail.verified_evidence_summary}
                results={detail.verification_results}
              />

              <ResponseIntelligence
                draft={detail.validated_draft}
                workflowState={detail.workflow_state}
                validationReason={detail.validation_status?.reason}
                isDefendable={detail.sufficiency_classification === "DEFENDABLE"}
              />

              <DeterministicValidator
                status={detail.validation_status}
                isEvidenceVerified={detail.sufficiency_classification === "DEFENDABLE"}
              />
            </div>

            {/* Right 1 Column: Append-Only Audit Ledger */}
            <div className="space-y-4">
              <AuditLedger timeline={detail.audit_timeline} />
            </div>
          </div>
        </>
      )}

      {/* 6. Ambient Telemetry Status Ticker (Single Slim Line at Bottom) */}
      <section className="pt-3 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-[#8a8880]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>POOL: <strong className="text-white">{totalCount} CASES</strong></span>
          <span className="text-white/20">•</span>
          <span>DEFENDABLE: <strong className="text-emerald-400">{defendableCount} ({defendablePercent}%)</strong></span>
          <span className="text-white/20">•</span>
          <span>ROUTED MANUAL: <strong className="text-amber-400">{manualReviewCount} ({manualReviewPercent}%)</strong></span>
          <span className="text-white/20">•</span>
          <span>PENDING: <strong className="text-white">{pendingCount}</strong></span>
          <span className="text-white/20">•</span>
          <span>SAFETY GATE: <strong className="text-indigo-300">100% STRICT</strong></span>
        </div>

        <button
          onClick={onNavigateToDisputes}
          className="inline-flex items-center space-x-1 text-xs text-[#8a8880] hover:text-white transition-colors cursor-pointer shrink-0"
        >
          <span>All Cases Registry</span>
          <ExternalLink className="h-3 w-3" />
        </button>
      </section>

      {/* PDF Evidence Package Modal */}
      {showPdfModal && detail && (
        <EvidencePackageModal
          disputeId={detail.dispute_id}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  );
};

export const StateBadge: React.FC<{ state: string; classification?: string | null }> = ({
  state,
  classification,
}) => {
  switch (state) {
    case "RECEIVED":
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-white/[0.04] text-[#8a8880] border border-white/[0.08]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5c5a54]" />
          <span>RECEIVED</span>
        </span>
      );
    case "MANUAL_REVIEW":
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span>{classification === "DEFENDABLE" ? "DRAFTING PAUSED" : "AUTOMATION PAUSED"}</span>
        </span>
      );
    case "HUMAN_APPROVAL_REQUIRED":
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          <span>APPROVAL REQUIRED</span>
        </span>
      );
    case "READY_FOR_SUBMISSION":
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-sky-500/10 text-sky-300 border border-sky-500/20 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          <span>READY TO SUBMIT</span>
        </span>
      );
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>SUBMITTED (SIMULATED)</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-white/[0.04] text-[#8a8880] border border-white/[0.08]">
          <span>{state}</span>
        </span>
      );
  }
};
