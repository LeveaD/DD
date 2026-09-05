import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  User,
  CreditCard,
  Globe,
  FileCheck,
  Activity,
} from "lucide-react";
import type { VerifiedEvidenceSummary, VerificationResults } from "../../types/api";

interface EvidenceInspectorProps {
  summary: VerifiedEvidenceSummary;
  results: VerificationResults;
}

export const EvidenceInspector: React.FC<EvidenceInspectorProps> = ({ summary, results }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="surface-subtle p-6 rounded-sm space-y-4">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-[#8a8880] uppercase">
            Ground-Truth Merchant Records
          </div>
          <h3 className="text-base font-serif font-normal text-[#f4f3ef]">
            Verified Evidence Telemetry
          </h3>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-mono text-[#8a8880] hover:text-white inline-flex items-center space-x-1 transition-colors"
        >
          <span>{isExpanded ? "Collapse Details" : "Inspect All 5 Records"}</span>
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Primary Telemetry Rows */}
      <div className="divide-y divide-white/[0.05] text-xs font-mono">
        {/* Row 1: Root Transaction */}
        <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-[#8a8880] flex items-center space-x-2">
            <CreditCard className="h-3.5 w-3.5 text-[#5c5a54]" />
            <span>PAYMENT METHOD</span>
          </span>
          <span className="text-white font-medium">
            {summary.payment_method?.toUpperCase() || "CARD"} ending in **** {summary.card_last4 || "4242"}
          </span>
        </div>

        {/* Row 2: Account Identity */}
        <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-[#8a8880] flex items-center space-x-2">
            <User className="h-3.5 w-3.5 text-[#5c5a54]" />
            <span>CUSTOMER IDENTITY</span>
          </span>
          <span className="text-white font-medium">
            {summary.user_name || "Merchant User Record"} ({summary.user_email || "Email verified"})
          </span>
        </div>

        {/* Row 3: TOS Acceptance */}
        <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-[#8a8880] flex items-center space-x-2">
            <FileCheck className="h-3.5 w-3.5 text-[#5c5a54]" />
            <span>TERMS OF SERVICE LOG</span>
          </span>
          <span className="text-white font-medium">
            Version {summary.tos_version || "2.1"} • {summary.tos_accepted_at ? `Accepted ${summary.tos_accepted_at.split("T")[0]}` : "Checkout clickwrap logged"}
          </span>
        </div>

        {/* Row 4: Digital Usage */}
        <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-[#8a8880] flex items-center space-x-2">
            <Activity className="h-3.5 w-3.5 text-[#5c5a54]" />
            <span>DIGITAL CONSUMPTION</span>
          </span>
          <span className="text-white font-medium">
            {summary.consumption_resource || "Product Access Record"} • {summary.consumption_timestamp ? summary.consumption_timestamp.split("T")[0] : "Verified"}
          </span>
        </div>

        {/* Row 5: IP Telemetry */}
        <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-[#8a8880] flex items-center space-x-2">
            <Globe className="h-3.5 w-3.5 text-[#5c5a54]" />
            <span>IP TELEMETRY SIGNAL</span>
          </span>
          <span className="text-sky-300 font-medium flex items-center space-x-1.5">
            <span>{summary.transaction_ip || "No IP logged"}</span>
            <span className="text-[10px] text-[#8a8880] font-normal">(Supporting consistency signal only)</span>
          </span>
        </div>
      </div>

      {/* Progressive Disclosure: Deep Forensic Telemetry */}
      {isExpanded && (
        <div className="pt-3 border-t border-white/[0.06] space-y-3 font-mono text-[11px] text-[#8a8880] bg-white/[0.015] p-3 rounded-sm">
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Telemetry Signature Record</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#5c5a54] block text-[10px]">INTERNAL USER ID</span>
              <span className="text-white">{summary.user_id || "usr_101_synthetic"}</span>
            </div>
            <div>
              <span className="text-[#5c5a54] block text-[10px]">TRANSACTION TIMESTAMP</span>
              <span className="text-white">{summary.transaction_timestamp || "2026-03-01T10:15:00Z"}</span>
            </div>
            <div>
              <span className="text-[#5c5a54] block text-[10px]">TOS CLICKWRAP RECORD</span>
              <span className="text-white">{summary.tos_accepted_at || "2026-03-01T10:14:50Z"}</span>
            </div>
            <div>
              <span className="text-[#5c5a54] block text-[10px]">RESOURCE ACCESS TIMESTAMP</span>
              <span className="text-white">{summary.consumption_timestamp || "2026-03-01T11:00:00Z"}</span>
            </div>
          </div>

          {results.supporting_signals.length > 0 && (
            <div className="pt-2 border-t border-white/[0.04]">
              <span className="text-[#5c5a54] block text-[10px] uppercase">CONFIRMED SIGNALS</span>
              <span className="text-emerald-400 text-xs">{results.supporting_signals.join(" • ")}</span>
            </div>
          )}

          {results.manual_review_reasons.length > 0 && (
            <div className="pt-2 border-t border-white/[0.04]">
              <span className="text-amber-400/80 block text-[10px] uppercase">ROUTING ABSTENTION FACTORS</span>
              <span className="text-amber-300 text-xs">{results.manual_review_reasons.join(" • ")}</span>
            </div>
          )}

          <p className="text-[10px] text-[#5c5a54] italic pt-1 border-t border-white/[0.04]">
            Forensic note: In adherence with network rules, IP telemetry does not constitute proof of identity and is treated strictly as an ambient consistency signal.
          </p>
        </div>
      )}
    </div>
  );
};
