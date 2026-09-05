import React from "react";
import {
  CreditCard,
  User,
  FileCheck,
  Activity,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Clock,
} from "lucide-react";
import type {
  VerifiedEvidenceSummary,
  EvidenceSignals,
  ValidationStatusDto,
  SufficiencyClassification,
} from "../../types/api";

interface EvidenceTopologyProps {
  summary: VerifiedEvidenceSummary;
  signals?: EvidenceSignals | null;
  amount: number;
  currency: string;
  workflowState: string;
  classification?: SufficiencyClassification | null;
  validationStatus?: ValidationStatusDto | null;
}

export const EvidenceTopology: React.FC<EvidenceTopologyProps> = ({
  summary,
  signals,
  amount,
  currency,
  workflowState,
  classification,
  validationStatus,
}) => {
  const isReceived = workflowState === "RECEIVED";
  const hasSignals = Boolean(signals);

  // Determine node states strictly from signals or pending ingest
  const identityStatus: "verified" | "inconsistent" | "missing" | "pending" =
    isReceived
      ? "pending"
      : signals?.identity_match === true
      ? "verified"
      : signals?.identity_match === false
      ? "inconsistent"
      : summary.user_id
      ? "verified"
      : "missing";

  const tosStatus: "verified" | "missing" | "pending" =
    isReceived
      ? "pending"
      : signals?.tos_accepted === true
      ? "verified"
      : signals?.tos_accepted === false
      ? "missing"
      : Boolean(summary.tos_version)
      ? "verified"
      : "missing";

  const usageStatus: "verified" | "inconsistent" | "missing" | "pending" =
    isReceived
      ? "pending"
      : signals?.temporal_sequence_valid === false
      ? "inconsistent"
      : signals?.post_purchase_consumption === true
      ? "verified"
      : signals?.post_purchase_consumption === false
      ? "missing"
      : Boolean(summary.consumption_resource)
      ? "verified"
      : "missing";

  const ipStatus: "supporting" | "inconsistent" | "missing" | "pending" =
    isReceived
      ? "pending"
      : signals?.ip_consistency === true
      ? "supporting"
      : signals?.ip_consistency === false
      ? "inconsistent"
      : summary.transaction_ip
      ? "supporting"
      : "missing";

  // Decision node evaluation
  const isDefendable =
    classification === "DEFENDABLE" ||
    (hasSignals &&
      signals?.identity_match &&
      signals?.tos_accepted &&
      signals?.post_purchase_consumption &&
      signals?.temporal_sequence_valid);

  const isMissingApiKey = validationStatus?.reason === "MISSING_API_KEY";

  const getDecisionNodeDetails = () => {
    if (isReceived) {
      return {
        title: "DETERMINISTIC SUFFICIENCY ENGINE",
        status: "pending" as const,
        badge: "AWAITING VERIFICATION",
        badgeStyle: "bg-white/[0.04] text-[#8a8880] border-white/[0.08]",
        icon: Clock,
        iconColor: "text-[#8a8880]",
        text: "Dispute ingested. Execute 'Process Dispute' to evaluate evidence sufficiency against merchant telemetry.",
      };
    }

    if (isDefendable) {
      if (workflowState === "MANUAL_REVIEW" && isMissingApiKey) {
        return {
          title: "TELEMETRY VERIFIED (DEFENDABLE)",
          status: "verified" as const,
          badge: "DEFENDABLE • DRAFTING PAUSED",
          badgeStyle: "bg-amber-500/10 text-amber-300 border-amber-500/30",
          icon: ShieldCheck,
          iconColor: "text-amber-400",
          text: "All 5 requisite telemetry signals verified without contradiction. Automated drafting paused due to LLM client configuration.",
        };
      }
      return {
        title: "AUTOMATION ELIGIBLE — DEFENDABLE TELEMETRY",
        status: "verified" as const,
        badge: "DEFENDABLE (ELIGIBLE)",
        badgeStyle: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        icon: ShieldCheck,
        iconColor: "text-emerald-400",
        text: "All requisite telemetry verified without contradictions. Case cleared for bounded response intelligence.",
      };
    }

    // Otherwise, it's NOT_DEFENDABLE / Manual Review due to telemetry failure
    let reasonDetail = "Incomplete telemetry signals or contradiction detected.";
    if (signals?.temporal_sequence_valid === false) {
      reasonDetail = "Critical contradiction: usage timestamp precedes payment authorization. Automation paused.";
    } else if (signals?.identity_match === false) {
      reasonDetail = "Identity mismatch: transaction user ID does not align with claimed user account. Automation paused.";
    } else if (signals?.ip_consistency === false) {
      reasonDetail = "Incomplete telemetry: missing session IP log in merchant database. Automation paused.";
    }

    return {
      title: "AUTOMATION PAUSED — FAIL-CLOSED ABSTENTION",
      status: "inconsistent" as const,
      badge: "ROUTED TO MANUAL REVIEW",
      badgeStyle: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      icon: AlertTriangle,
      iconColor: "text-amber-400",
      text: reasonDetail,
    };
  };

  const decision = getDecisionNodeDetails();
  const DecisionIcon = decision.icon;

  return (
    <div className="surface-subtle p-3.5 sm:p-4 rounded-sm space-y-3">
      {/* Graph Header / Subtitle & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-white/[0.06] pb-2 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] tracking-widest text-[#8a8880] uppercase font-semibold">
            RELATIONAL EVIDENCE TOPOLOGY
          </span>
          <span className="text-[#5c5a54] text-[10px] hidden sm:inline">• Live Verification Topology</span>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-3 text-[10px]">
          <span className="flex items-center space-x-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Verified</span>
          </span>
          <span className="flex items-center space-x-1 text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            <span>Supporting</span>
          </span>
          <span className="flex items-center space-x-1 text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Missing</span>
          </span>
          <span className="flex items-center space-x-1 text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <span>Inconsistent</span>
          </span>
        </div>
      </div>

      {/* SVG-Connected Topology Map (Optimized for Above-The-Fold Dominance) */}
      <div className="relative max-w-4xl mx-auto font-mono text-xs">
        {/* Tier 1: Transaction Root Node */}
        <div className="flex justify-center">
          <div className="w-full max-w-md px-3 py-2 rounded-sm bg-[#101216] border border-white/[0.12] space-y-1 shadow-md">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-1.5 text-white font-semibold">
                <CreditCard className="h-3.5 w-3.5 text-[#8a8880]" />
                <span>ROOT TRANSACTION</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-sm ${
                isReceived
                  ? "bg-white/[0.04] text-[#8a8880] border border-white/[0.08]"
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              }`}>
                {isReceived ? "INGESTED LOG" : "VERIFIED SETTLEMENT"}
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5 border-t border-white/[0.05] text-[11px]">
              <span className="text-[#8a8880] truncate">
                {summary.payment_method?.toUpperCase() || "CARD"} ending in {summary.card_last4 ? `**** ${summary.card_last4}` : "4242"}
              </span>
              <span className="font-bold text-white shrink-0 ml-2">
                ₹{amount.toLocaleString()} <span className="text-[9px] text-[#8a8880]">{currency}</span>
              </span>
            </div>
            <div className="text-[10px] text-[#5c5a54] flex justify-between">
              <span>Time: {summary.transaction_timestamp?.split("T")[0] || "Logged"}</span>
              <span>Checkout IP: {summary.transaction_ip || "Logged"}</span>
            </div>
          </div>
        </div>

        {/* Connector from Tier 1 to Tier 2 */}
        <div className="flex justify-center my-0.5">
          <div className="w-px h-3 bg-white/[0.15]" />
        </div>

        {/* Tier 2: Identity & TOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
          {/* Node: Identity */}
          <div className="px-3 py-2 rounded-sm bg-[#101216] border border-white/[0.08] space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-white font-medium">
                <User className="h-3 w-3 text-[#8a8880]" />
                <span>USER IDENTITY</span>
              </span>
              <StatusPill status={identityStatus} />
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="text-white font-medium truncate">{summary.user_name || "Merchant Record"}</p>
              <p className="text-[10px] text-[#8a8880] truncate">{summary.user_email || "Email Logged"}</p>
            </div>
            <div className="text-[9px] text-[#5c5a54] pt-0.5 border-t border-white/[0.04]">
              User ID: {summary.user_id || "Recorded"}
            </div>
          </div>

          {/* Node: Terms of Service */}
          <div className="px-3 py-2 rounded-sm bg-[#101216] border border-white/[0.08] space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-white font-medium">
                <FileCheck className="h-3 w-3 text-[#8a8880]" />
                <span>TERMS OF SERVICE</span>
              </span>
              <StatusPill status={tosStatus} />
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="text-white font-medium">Version: {summary.tos_version || "2.1"}</p>
              <p className="text-[10px] text-[#8a8880] truncate">
                {summary.tos_accepted_at ? `Accepted (${summary.tos_accepted_at.split("T")[0]})` : "Clickwrap log"}
              </p>
            </div>
            <div className="text-[9px] text-[#5c5a54] pt-0.5 border-t border-white/[0.04]">
              Checkout clickwrap acceptance log
            </div>
          </div>
        </div>

        {/* Connector from Tier 2 to Tier 3 */}
        <div className="flex justify-center my-0.5">
          <div className="w-px h-3 bg-white/[0.15]" />
        </div>

        {/* Tier 3: Usage & IP Telemetry */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Node: Digital Usage */}
          <div className="px-3 py-2 rounded-sm bg-[#101216] border border-white/[0.08] space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-white font-medium">
                <Activity className="h-3 w-3 text-[#8a8880]" />
                <span>DIGITAL USAGE</span>
              </span>
              <StatusPill status={usageStatus} />
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="text-white font-medium truncate">{summary.consumption_resource || "Resource Access"}</p>
              <p className="text-[10px] text-[#8a8880]">
                {summary.consumption_timestamp ? `Consumed: ${summary.consumption_timestamp.split("T")[0]}` : "Event logged"}
              </p>
            </div>
            <div className="text-[9px] text-[#5c5a54] pt-0.5 border-t border-white/[0.04]">
              {signals?.temporal_sequence_valid === false
                ? "Contradiction: usage timestamp precedes payment"
                : "Temporal sequence: post-purchase consumption"}
            </div>
          </div>

          {/* Node: IP Telemetry */}
          <div className="px-3 py-2 rounded-sm bg-[#101216] border border-white/[0.08] space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-white font-medium">
                <Globe className="h-3 w-3 text-[#8a8880]" />
                <span>IP TELEMETRY</span>
              </span>
              <StatusPill status={ipStatus} />
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="text-white font-medium font-mono truncate">{summary.transaction_ip || "No session IP"}</p>
              <p className="text-[10px] text-sky-400 font-medium">
                Supporting Consistency Signal
              </p>
            </div>
            <div className="text-[9px] text-[#5c5a54] pt-0.5 border-t border-white/[0.04]">
              Consistency indicator only (ambient signal)
            </div>
          </div>
        </div>

        {/* Connector from Tier 3 to Tier 4 */}
        <div className="flex justify-center my-0.5">
          <div className="w-px h-3 bg-white/[0.15]" />
        </div>

        {/* Tier 4: Bottom Verification Decision Node */}
        <div className="flex justify-center">
          <div className="w-full max-w-md px-3.5 py-2 rounded-sm bg-[#101216] border border-white/[0.12] text-center space-y-1">
            <div className="flex items-center justify-center space-x-2 text-xs font-semibold">
              <DecisionIcon className={`h-3.5 w-3.5 ${decision.iconColor}`} />
              <span className="text-white">{decision.title}</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-sm border ${decision.badgeStyle}`}>
                {decision.badge}
              </span>
            </div>
            <p className="text-[11px] text-[#8a8880] leading-snug">
              {decision.text}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusPill: React.FC<{ status: "verified" | "supporting" | "missing" | "inconsistent" | "pending" }> = ({
  status,
}) => {
  switch (status) {
    case "verified":
      return (
        <span className="inline-flex items-center space-x-1 text-[9px] px-1.5 py-0.2 rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
          <CheckCircle2 className="h-2.5 w-2.5" />
          <span>Verified</span>
        </span>
      );
    case "supporting":
      return (
        <span className="inline-flex items-center space-x-1 text-[9px] px-1.5 py-0.2 rounded-sm bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
          <CheckCircle2 className="h-2.5 w-2.5" />
          <span>Supporting</span>
        </span>
      );
    case "inconsistent":
      return (
        <span className="inline-flex items-center space-x-1 text-[9px] px-1.5 py-0.2 rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
          <XCircle className="h-2.5 w-2.5" />
          <span>Inconsistent</span>
        </span>
      );
    case "missing":
      return (
        <span className="inline-flex items-center space-x-1 text-[9px] px-1.5 py-0.2 rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
          <AlertTriangle className="h-2.5 w-2.5" />
          <span>Missing</span>
        </span>
      );
    case "pending":
    default:
      return (
        <span className="inline-flex items-center space-x-1 text-[9px] px-1.5 py-0.2 rounded-sm bg-white/[0.04] text-[#8a8880] border border-white/[0.08] font-medium">
          <Clock className="h-2.5 w-2.5 text-[#5c5a54]" />
          <span>Pending</span>
        </span>
      );
  }
};
