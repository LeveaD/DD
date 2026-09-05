import React from "react";
import { History, ArrowRight } from "lucide-react";
import type { AuditTimelineItem } from "../../types/api";

interface AuditLedgerProps {
  timeline: AuditTimelineItem[];
}

export const AuditLedger: React.FC<AuditLedgerProps> = ({ timeline }) => {
  return (
    <div className="surface-subtle p-6 rounded-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-[#8a8880] uppercase flex items-center space-x-1.5">
            <History className="h-3 w-3" />
            <span>APPEND-ONLY AUDIT</span>
          </div>
          <h3 className="text-base font-serif font-normal text-[#f4f3ef]">
            Audit Events Ledger
          </h3>
        </div>
        <span className="text-[10px] font-mono text-[#5c5a54]">
          APPEND-ONLY • AUDIT EVENTS
        </span>
      </div>

      {timeline.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-[#8a8880]">
          No audit entries recorded for this case yet.
        </div>
      ) : (
        <div className="relative pl-4 space-y-5 before:absolute before:left-1 before:top-2 before:bottom-2 before:w-px before:bg-white/[0.1] font-mono text-xs">
          {timeline.map((item, idx) => {
            const isRejection =
              item.event_type.includes("FAILED") ||
              item.event_type.includes("MANUAL_REVIEW");
            const isApproval = item.event_type.includes("APPROVED");
            const isSubmission = item.event_type.includes("SUBMITTED");

            return (
              <div key={item.log_id || idx} className="relative group pl-3">
                {/* Visual bullet */}
                <div
                  className={`absolute -left-[19px] top-1.5 h-2 w-2 rounded-full border ${
                    isRejection
                      ? "bg-amber-400 border-amber-500"
                      : isApproval
                      ? "bg-indigo-400 border-indigo-500"
                      : isSubmission
                      ? "bg-emerald-400 border-emerald-500"
                      : "bg-[#8a8880] border-white/40"
                  }`}
                />

                <div className="space-y-1">
                  {/* Event & Timestamp */}
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="font-bold text-white tracking-wide uppercase">
                      {item.event_type}
                    </span>
                    <span className="text-[10px] text-[#5c5a54]">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Previous State -> Next State */}
                  <div className="flex items-center space-x-2 text-[10px] text-[#8a8880]">
                    <span>{item.previous_state}</span>
                    <ArrowRight className="h-3 w-3 text-[#5c5a54]" />
                    <span className="text-[#f4f3ef] font-semibold">{item.next_state}</span>
                  </div>

                  {/* Failure reason if any */}
                  {item.failure_reason && (
                    <div className="p-2 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] leading-relaxed mt-1.5">
                      <span className="font-bold">Failure rationale: </span>
                      {item.failure_reason}
                    </div>
                  )}

                  {isRejection && (
                    <p className="text-[9px] text-[#5c5a54] italic pt-1">
                      Traceability note: Non-compliant draft was retained in append-only audit history for investigative integrity, but excluded from merchant evidence bundle.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
