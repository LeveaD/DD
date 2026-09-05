import React, { useState } from "react";
import {
  ShieldCheck,
  ChevronDown,
  AlertTriangle,
  FileCheck2,
  FileX2,
  UserX,
  ArrowLeft,
  Cpu,
} from "lucide-react";

interface HeaderNavProps {
  activeView: "operations" | "disputes" | "evaluation";
  onViewChange: (view: "operations" | "disputes" | "evaluation") => void;
  onSelectDispute: (disputeId: string) => void;
  selectedDisputeId: string | null;
  onBackToOverview: () => void;
  isBackendHealthy: boolean | null;
}

const DEMO_CASES = [
  {
    id: "D-1001",
    label: "Defendable Dossier",
    detail: "Strong Telemetry • ₹4,999",
    status: "AUTOMATION ELIGIBLE",
    icon: FileCheck2,
    color: "text-emerald-400",
  },
  {
    id: "D-1002",
    label: "Missing IP Log",
    detail: "Incomplete Telemetry • ₹2,499",
    status: "AUTOMATION PAUSED",
    icon: FileX2,
    color: "text-amber-400",
  },
  {
    id: "D-1003",
    label: "Temporal Contradiction",
    detail: "Contradictory Timestamps • ₹14,999",
    status: "AUTOMATION PAUSED",
    icon: AlertTriangle,
    color: "text-rose-400",
  },
  {
    id: "D-1004",
    label: "Identity Mismatch",
    detail: "Account ID Discrepancy • ₹7,500",
    status: "AUTOMATION PAUSED",
    icon: UserX,
    color: "text-rose-400",
  },
];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeView,
  onViewChange,
  onSelectDispute,
  selectedDisputeId,
  onBackToOverview,
  isBackendHealthy,
}) => {
  const [isDemoDropdownOpen, setIsDemoDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#090a0d]/95 backdrop-blur-md border-b border-white/[0.07]">
      <div className="mx-auto max-w-[1520px] px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Left: Brand Identity & Active Case Breadcrumb */}
        <div className="flex items-center space-x-6 min-w-0">
          <button
            onClick={() => {
              if (selectedDisputeId) {
                onBackToOverview();
              } else {
                onViewChange("operations");
              }
            }}
            className="flex items-center space-x-2.5 group text-left shrink-0 focus:outline-none"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/[0.04] border border-white/[0.1] text-white group-hover:border-white/[0.25] transition-colors">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">
                DisputeDefend
              </span>
              <span className="text-[9px] font-mono text-[#8a8880] tracking-tight">
                Forensic Risk Engine
              </span>
            </div>
          </button>

          {/* If in individual case investigation, show breadcrumb */}
          {selectedDisputeId && (
            <div className="hidden sm:flex items-center space-x-2.5 text-xs font-mono pl-4 border-l border-white/[0.07]">
              <button
                onClick={onBackToOverview}
                className="inline-flex items-center space-x-1.5 text-[#8a8880] hover:text-[#f4f3ef] transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Overview</span>
              </button>
              <span className="text-white/20">/</span>
              <span className="text-white font-semibold tracking-wider">
                DOSSIER {selectedDisputeId}
              </span>
            </div>
          )}
        </div>

        {/* Center: Minimalist Architectural Navigation */}
        <nav className="flex items-center space-x-1 sm:space-x-2 font-mono text-xs">
          <button
            onClick={() => onViewChange("operations")}
            className={`px-3 py-1.5 rounded-sm transition-all flex items-center space-x-1.5 ${
              activeView === "operations" && !selectedDisputeId
                ? "text-white bg-white/[0.08] font-semibold border-b-2 border-white/80"
                : "text-[#8a8880] hover:text-[#f4f3ef] hover:bg-white/[0.03]"
            }`}
          >
            <span className="text-[10px] text-white/40">01</span>
            <span>OPERATIONS</span>
          </button>

          <button
            onClick={() => onViewChange("disputes")}
            className={`px-3 py-1.5 rounded-sm transition-all flex items-center space-x-1.5 ${
              activeView === "disputes" && !selectedDisputeId
                ? "text-white bg-white/[0.08] font-semibold border-b-2 border-white/80"
                : "text-[#8a8880] hover:text-[#f4f3ef] hover:bg-white/[0.03]"
            }`}
          >
            <span className="text-[10px] text-white/40">02</span>
            <span>DISPUTES</span>
          </button>

          <button
            onClick={() => onViewChange("evaluation")}
            className={`px-3 py-1.5 rounded-sm transition-all flex items-center space-x-1.5 ${
              activeView === "evaluation"
                ? "text-white bg-white/[0.08] font-semibold border-b-2 border-white/80"
                : "text-[#8a8880] hover:text-[#f4f3ef] hover:bg-white/[0.03]"
            }`}
          >
            <span className="text-[10px] text-white/40">03</span>
            <span>BENCHMARK</span>
          </button>
        </nav>

        {/* Right: Canonical Cases Quick Jump & Engine Status */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          {/* Quick Demo Cases Trigger */}
          <div className="relative">
            <button
              onClick={() => setIsDemoDropdownOpen(!isDemoDropdownOpen)}
              className="inline-flex items-center space-x-1.5 rounded-sm bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.18] px-2.5 py-1 text-[11px] text-[#f4f3ef] transition-colors"
            >
              <span className="text-[#8a8880]">Case:</span>
              <span className="font-semibold text-white">
                {selectedDisputeId || "Select Scenario"}
              </span>
              <ChevronDown className="h-3 w-3 text-[#8a8880]" />
            </button>

            {isDemoDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-sm bg-[#101216] border border-white/[0.12] shadow-2xl p-1 z-50 animate-fadeIn"
                onMouseLeave={() => setIsDemoDropdownOpen(false)}
              >
                <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase text-[#8a8880] border-b border-white/[0.06] mb-1 flex items-center justify-between">
                  <span>Canonical Synthetic Cases</span>
                  <span className="text-white/40">M-8 Seed 42</span>
                </div>
                {DEMO_CASES.map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelectDispute(c.id);
                        setIsDemoDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded-sm flex items-start space-x-2.5 hover:bg-white/[0.04] transition-colors ${
                        selectedDisputeId === c.id ? "bg-white/[0.06]" : ""
                      }`}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">{c.id}</span>
                          <span className="text-[9px] text-[#8a8880]">{c.status}</span>
                        </div>
                        <p className="text-[11px] text-[#8a8880] truncate mt-0.5">{c.detail}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model Spec */}
          <div className="hidden xl:flex items-center space-x-1.5 text-[11px] text-[#8a8880] px-2 py-0.5 border border-white/[0.05] rounded-sm bg-white/[0.015]">
            <Cpu className="h-3 w-3 text-indigo-400" />
            <span className="text-[#5c5a54]">LLM:</span>
            <span className="text-white font-mono">GROQ // GPT-OSS-20B</span>
          </div>

          {/* Engine Health Status Indicator */}
          <div className="flex items-center space-x-2 text-[11px] px-2 py-0.5 rounded-sm border border-white/[0.05] bg-white/[0.015]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isBackendHealthy === true
                  ? "bg-emerald-400 animate-pulse-subtle"
                  : isBackendHealthy === false
                  ? "bg-rose-500"
                  : "bg-amber-400"
              }`}
            />
            <span className="text-[#8a8880] hidden sm:inline font-mono">
              {isBackendHealthy === true
                ? "ENGINE ONLINE"
                : isBackendHealthy === false
                ? "OFFLINE"
                : "CONNECTING"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
