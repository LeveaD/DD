import React from "react";
import {
  CheckCircle2,
  PauseCircle,
  Info,
} from "lucide-react";
import type { DisputeDetailDto } from "../../types/api";

interface AutomationStateBannerProps {
  detail: DisputeDetailDto;
}

export const AutomationStateBanner: React.FC<AutomationStateBannerProps> = ({ detail }) => {
  const isReceived = detail.workflow_state === "RECEIVED";
  const isManualReview = detail.workflow_state === "MANUAL_REVIEW";
  const isDefendableClassification = detail.sufficiency_classification === "DEFENDABLE";
  const isMissingApiKey = detail.validation_status?.reason === "MISSING_API_KEY";

  if (isReceived) {
    return (
      <div className="p-3 rounded-sm bg-white/[0.02] border border-white/[0.08] flex items-center justify-between text-xs font-mono">
        <div className="flex items-center space-x-2.5">
          <Info className="h-4 w-4 text-[#8a8880]" />
          <span className="text-[#8a8880]">
            Case ingested. Deterministic verification required before AI drafting.
          </span>
        </div>
        <span className="text-[#5c5a54] text-[10px] px-2 py-0.5 rounded-sm bg-white/[0.04] border border-white/[0.06]">
          STATUS: RECEIVED
        </span>
      </div>
    );
  }

  // If manual review because of LLM config, but telemetry was defendable:
  if (isManualReview && isDefendableClassification && isMissingApiKey) {
    return (
      <div className="p-3.5 rounded-sm bg-[#13100a] border border-amber-500/20 space-y-2 font-mono">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2.5">
            <PauseCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  EVIDENCE VERIFIED (DEFENDABLE) — AI DRAFTING PAUSED
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Client Unconfigured
                </span>
              </div>
              <p className="text-xs text-[#8a8880] mt-0.5 font-sans">
                Deterministic evidence verification passed 100% of criteria. Response drafting was paused because GROQ_API_KEY is unconfigured in the backend environment.
              </p>
            </div>
          </div>
        </div>
        <div className="pt-2 border-t border-amber-500/10 flex flex-wrap gap-2 text-[10px]">
          {detail.verification_results.supporting_signals.map((sig, idx) => (
            <span
              key={idx}
              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>{sig}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // True manual review due to telemetry failure
  if (isManualReview) {
    const reasonText =
      detail.verification_results.manual_review_reasons[0] ||
      (detail.verification_results.signals?.temporal_sequence_valid === false
        ? "Temporal contradiction: usage precedes purchase"
        : detail.verification_results.signals?.identity_match === false
        ? "Account identity mismatch: user ID discrepancy"
        : detail.verification_results.signals?.ip_consistency === false
        ? "Incomplete telemetry: missing session IP log"
        : "Evidence fails strict sufficiency criteria");

    const contradictionText =
      detail.verification_results.missing_or_contradicted_signals[0] ||
      (detail.verification_results.signals?.temporal_sequence_valid === false
        ? "temporal_sequence_valid"
        : detail.verification_results.signals?.identity_match === false
        ? "identity_match"
        : detail.verification_results.signals?.ip_consistency === false
        ? "ip_consistency"
        : "None");

    return (
      <div className="p-3.5 rounded-sm bg-[#13100a] border border-amber-500/20 space-y-2 font-mono">
        <div className="flex items-start space-x-2.5">
          <PauseCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                AUTOMATION PAUSED — ROUTED TO MANUAL REVIEW
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Fail-Closed Policy
              </span>
            </div>
            <p className="text-xs text-[#8a8880] mt-0.5 font-sans">
              The deterministic router intentionally abstained from automated response generation. In accordance with safety policies, ungrounded or contradicted claims are not dispatched.
            </p>
          </div>
        </div>
        <div className="pt-2 border-t border-amber-500/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div>
            <span className="text-[#5c5a54] block">AVAILABLE TELEMETRY</span>
            <span className="text-white font-medium">{detail.verified_evidence_summary.found ? "Merchant Snapshot" : "Pending Ingest"}</span>
          </div>
          <div>
            <span className="text-amber-400/80 block">ABSTENTION FACTOR</span>
            <span className="text-amber-200 font-medium truncate block">{reasonText}</span>
          </div>
          <div>
            <span className="text-[#5c5a54] block">CONTRADICTION CHECK</span>
            <span className="text-white font-medium">{contradictionText}</span>
          </div>
          <div>
            <span className="text-amber-400/80 block">AI DRAFTING POSTURE</span>
            <span className="text-amber-300 font-medium">Intentionally Skipped</span>
          </div>
        </div>
      </div>
    );
  }

  // Defendable workflow states (HUMAN_APPROVAL_REQUIRED, READY_FOR_SUBMISSION, SUBMITTED, or RESPONSE_VALIDATED)
  return (
    <div className="p-3.5 rounded-sm bg-[#0a120e] border border-emerald-500/20 space-y-2 font-mono">
      <div className="flex items-start space-x-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
              AUTOMATION ELIGIBLE — SUFFICIENT TELEMETRY EVIDENCE
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Rule Matrix ADR-012
            </span>
          </div>
          <p className="text-xs text-[#8a8880] mt-0.5 font-sans">
            All mandatory merchant signals have been verified without contradictions. Bounded response drafting is enabled.
          </p>
        </div>
      </div>
      <div className="pt-2 border-t border-emerald-500/10 flex flex-wrap gap-2 text-[10px]">
        {detail.verification_results.supporting_signals.map((sig, idx) => (
          <span
            key={idx}
            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
            <span>{sig}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
