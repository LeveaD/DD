import React from "react";
import { Cpu, Lock } from "lucide-react";
import type { ValidatedDraftDto } from "../../types/api";

interface ResponseIntelligenceProps {
  draft: ValidatedDraftDto | null;
  workflowState: string;
  validationReason?: string;
  isDefendable?: boolean;
}

export const ResponseIntelligence: React.FC<ResponseIntelligenceProps> = ({
  draft,
  workflowState,
  validationReason,
  isDefendable,
}) => {
  const isDrafted = Boolean(draft);

  return (
    <div className="surface-subtle p-4 sm:p-5 rounded-sm space-y-3 border-l-2 border-l-indigo-400/70">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase flex items-center space-x-1.5">
            <Cpu className="h-3 w-3" />
            <span>RESPONSE INTELLIGENCE // BOUNDED GENERATION</span>
          </div>
          <h3 className="text-sm sm:text-base font-serif font-normal text-[#f4f3ef]">
            AI Defense Narrative Compilation
          </h3>
        </div>

        <div className="flex items-center space-x-2 text-[10px] font-mono">
          <span className="text-[#8a8880]">MODEL:</span>
          <span className="text-white px-2 py-0.5 rounded-sm bg-white/[0.04] border border-white/[0.08]">
            {draft?.model_version || "openai/gpt-oss-20b"}
          </span>
          <span className="text-[#5c5a54]">TEMP: {draft?.temperature ?? 0.0}</span>
        </div>
      </div>

      {isDrafted ? (
        <div className="space-y-2.5 font-mono">
          {/* Strict Separation Callout */}
          <div className="flex items-center justify-between text-[10px] text-[#8a8880]">
            <span className="text-indigo-300 font-semibold tracking-wide">
              SYNTHETIC DEFENSE NARRATIVE (BOUNDED GROQ OUTPUT)
            </span>
            <span className="text-[#5c5a54]">
              {draft?.validated_at ? `Validated: ${new Date(draft.validated_at).toLocaleTimeString()}` : "Validated"}
            </span>
          </div>

          {/* Draft Narrative Block */}
          <div className="p-3.5 rounded-sm bg-[#0d0f14] border border-white/[0.08] text-xs leading-relaxed text-[#e2dfd7] font-sans relative">
            <p className="whitespace-pre-line selection:bg-indigo-500/20">
              {draft?.narrative}
            </p>
          </div>

          {/* Subordination & Safety Bound Notice */}
          <div className="flex items-start space-x-2 text-[10px] text-[#8a8880] bg-white/[0.015] p-2 rounded-sm border border-white/[0.04]">
            <Lock className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" />
            <p className="font-sans leading-normal">
              <span className="font-mono text-white text-[9px] uppercase font-bold">Boundary Lock: </span>
              The generative model was supplied strictly verified evidence fields from the immutable store. The model cannot mutate evidence, alter dispute states, or create ungrounded claims.
            </p>
          </div>
        </div>
      ) : (
        <div className="py-5 text-center space-y-1 font-mono text-xs">
          <div className="text-[#8a8880]">
            {workflowState === "RECEIVED"
              ? "No response draft compiled yet. Execute 'Process Dispute' to run evidence verification."
              : validationReason === "MISSING_API_KEY" && isDefendable
              ? "Draft generation paused: GROQ_API_KEY is not configured in backend environment. Source evidence is 100% defendable."
              : workflowState === "MANUAL_REVIEW"
              ? "Draft generation withheld: Telemetry failed sufficiency criteria or contained contradictions."
              : "No draft available for this case."}
          </div>
          <p className="text-[10px] text-[#5c5a54]">
            AI drafting runs strictly subordinate to deterministic verification pass.
          </p>
        </div>
      )}
    </div>
  );
};
