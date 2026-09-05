import React, { useState, useMemo } from "react";
import { Search, ArrowRight } from "lucide-react";
import type { DisputeListItemDto } from "../../types/api";
import { StateBadge } from "../operations/OperationsView";

interface DisputesExplorerProps {
  disputes: DisputeListItemDto[];
  isLoading: boolean;
  onSelectDispute: (id: string) => void;
}

export const DisputesExplorer: React.FC<DisputesExplorerProps> = ({
  disputes,
  isLoading,
  onSelectDispute,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "ALL" | "DEFENDABLE" | "MANUAL_REVIEW" | "SUBMITTED"
  >("ALL");

  const filteredDisputes = useMemo(() => {
    return disputes.filter((dispute) => {
      const matchesSearch =
        dispute.dispute_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dispute.transaction_id.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (activeFilter === "DEFENDABLE") {
        return (
          dispute.classification === "DEFENDABLE" ||
          dispute.state === "HUMAN_APPROVAL_REQUIRED" ||
          dispute.state === "READY_FOR_SUBMISSION"
        );
      }
      if (activeFilter === "MANUAL_REVIEW") {
        return dispute.state === "MANUAL_REVIEW";
      }
      if (activeFilter === "SUBMITTED") {
        return dispute.state === "SUBMITTED";
      }

      return true;
    });
  }, [disputes, searchTerm, activeFilter]);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <section className="border-b border-white/[0.07] pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-[#8a8880] uppercase">
              Synthetic Ingestion Registry
            </div>
            <h1 className="text-3xl font-serif font-normal text-white mt-1">
              Dispute Investigation Registry
            </h1>
            <p className="text-xs text-[#8a8880] mt-1 font-sans">
              Search, filter, and inspect canonical merchant chargeback cases and verified telemetry snapshots.
            </p>
          </div>

          <div className="text-xs font-mono text-[#8a8880]">
            <span className="text-white font-semibold">{filteredDisputes.length}</span> of {disputes.length} cases displayed
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-96 font-mono text-xs">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#5c5a54]" />
          <input
            type="text"
            placeholder="Search by Dispute ID or Transaction ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#101216] border border-white/[0.08] focus:border-white/30 rounded-sm pl-9 pr-4 py-2 text-xs text-white placeholder-[#5c5a54] outline-none transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 font-mono text-xs w-full md:w-auto overflow-x-auto border-b md:border-b-0 border-white/[0.06] pb-2 md:pb-0">
          {[
            { id: "ALL", label: "All Cases" },
            { id: "DEFENDABLE", label: "Defendable" },
            { id: "MANUAL_REVIEW", label: "Automation Paused" },
            { id: "SUBMITTED", label: "Submitted" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as typeof activeFilter)}
              className={`px-3 py-1.5 rounded-sm transition-all shrink-0 ${
                activeFilter === tab.id
                  ? "bg-white/[0.08] text-white font-semibold border-b-2 border-white"
                  : "text-[#8a8880] hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Disputes Registry List */}
      <section className="border-t border-white/[0.07]">
        {isLoading ? (
          <div className="py-16 text-center font-mono text-xs text-[#8a8880] animate-pulse">
            Querying backend dispute database...
          </div>
        ) : filteredDisputes.length === 0 ? (
          <div className="py-16 text-center font-mono text-xs text-[#8a8880]">
            No dispute cases match the active filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {filteredDisputes.map((dispute) => (
              <div
                key={dispute.id}
                onClick={() => onSelectDispute(dispute.id)}
                className="py-4 px-2 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
              >
                {/* Left: Case ID + Transaction ID */}
                <div className="flex items-center space-x-6 min-w-0">
                  <span className="font-mono text-sm font-bold text-white group-hover:text-amber-300 transition-colors w-24">
                    {dispute.dispute_id}
                  </span>

                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-mono text-[#8a8880] truncate">
                      Transaction: <span className="text-[#f4f3ef] font-medium">{dispute.transaction_id}</span>
                    </p>
                    <p className="text-[11px] font-mono text-[#5c5a54]">
                      Reason Code: {dispute.reason_code} • Chargeback Date: {dispute.chargeback_date.split("T")[0]}
                    </p>
                  </div>
                </div>

                {/* Right: Amount + State + Action */}
                <div className="flex items-center space-x-6 justify-between md:justify-end">
                  <div className="text-right font-mono">
                    <span className="text-sm font-semibold text-white">
                      ₹{dispute.amount.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[#8a8880] ml-1">{dispute.currency}</span>
                  </div>

                  <StateBadge state={dispute.state} />

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDispute(dispute.id);
                    }}
                    className="text-xs font-mono text-[#8a8880] group-hover:text-white inline-flex items-center space-x-1.5 transition-colors pl-2"
                  >
                    <span>Investigate</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
