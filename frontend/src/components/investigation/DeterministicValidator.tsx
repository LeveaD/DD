import React from "react";
import { CheckCircle2, XCircle, AlertOctagon } from "lucide-react";
import type { ValidationStatusDto } from "../../types/api";

interface DeterministicValidatorProps {
  status: ValidationStatusDto | null;
  isEvidenceVerified?: boolean;
}

export const DeterministicValidator: React.FC<DeterministicValidatorProps> = ({
  status,
  isEvidenceVerified = false,
}) => {
  const isPassed = status?.passed === true;
  const isFailed = status?.passed === false;
  const isMissingApiKey = status?.reason === "MISSING_API_KEY";

  return (
    <div className="surface-subtle p-4 sm:p-5 rounded-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-[#8a8880] uppercase">
            Deterministic Post-Draft Audit Gate
          </div>
          <h3 className="text-sm sm:text-base font-serif font-normal text-[#f4f3ef]">
            Hard Fact Verification & Safety Validator
          </h3>
        </div>

        {/* Status Confirmation Badge */}
        <div>
          {isPassed ? (
            <span className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold px-2.5 py-0.5 rounded-sm bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" />
              <span>VALIDATED</span>
            </span>
          ) : isMissingApiKey ? (
            <span className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold px-2.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <span>DRAFTING PAUSED</span>
            </span>
          ) : isFailed ? (
            <span className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold px-2.5 py-0.5 rounded-sm bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <XCircle className="h-3 w-3" />
              <span>VALIDATION FAILED</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1.5 text-xs font-mono text-[#8a8880] px-2 py-0.5 rounded-sm bg-white/[0.02] border border-white/[0.06]">
              <span>AWAITING DRAFT</span>
            </span>
          )}
        </div>
      </div>

      {/* Compact verification rows */}
      <div className="divide-y divide-white/[0.04] text-xs font-mono">
        <ValidatorRow
          label="Transaction ID"
          note="Exact alphanumeric identifier match"
          passed={isPassed || (isMissingApiKey && isEvidenceVerified)}
        />
        <ValidatorRow
          label="Dispute Amount"
          note="Exact transaction value comparison"
          passed={isPassed || (isMissingApiKey && isEvidenceVerified)}
        />
        <ValidatorRow
          label="Currency"
          note="Exact currency denomination (INR)"
          passed={isPassed || (isMissingApiKey && isEvidenceVerified)}
        />
        <ValidatorRow
          label="Transaction Date"
          note="Consistent ISO timestamp sequence"
          passed={isPassed || (isMissingApiKey && isEvidenceVerified)}
        />
        <ValidatorRow
          label="IP Consistency"
          note="Ambient telemetry signal consistency"
          passed={isPassed || (isMissingApiKey && isEvidenceVerified)}
        />
        <ValidatorRow
          label="Semantic Safety"
          note="No unverified intent claims / No legal conclusions"
          passed={isPassed}
        />
      </div>

      {/* Rejection Diagnostics if validation failed */}
      {isFailed && (
        <div className="p-3 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs font-mono space-y-1.5">
          <div className="flex items-center space-x-2 font-bold text-amber-300">
            <AlertOctagon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Audit Exception Notice:</span>
          </div>
          {status?.unsupported_claims && status.unsupported_claims.length > 0 ? (
            <ul className="space-y-0.5 pl-5 list-disc text-[11px] text-amber-200/90">
              {status.unsupported_claims.map((claim, idx) => (
                <li key={idx}>{claim}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-amber-200/90">
              {status?.reason || "Validation failure"}
            </p>
          )}
          <p className="text-[10px] text-[#8a8880] italic pt-1 border-t border-amber-500/15">
            Audit rule: Non-compliant draft excluded from evidence package; retained in append-only audit trail for investigation record.
          </p>
        </div>
      )}
    </div>
  );
};

const ValidatorRow: React.FC<{ label: string; note: string; passed: boolean }> = ({
  label,
  note,
  passed,
}) => {
  return (
    <div className="py-1.5 flex items-center justify-between">
      <div className="flex items-baseline space-x-3">
        <span className="text-white font-medium w-36 sm:w-44">{label}</span>
        <span className="text-[10px] text-[#5c5a54] hidden sm:inline">{note}</span>
      </div>

      {passed ? (
        <span className="inline-flex items-center space-x-1 text-emerald-400 font-bold">
          <span className="text-[11px]">✓</span>
          <span className="text-[10px] hidden sm:inline">PASS</span>
        </span>
      ) : (
        <span className="text-[#5c5a54] text-[11px]">
          —
        </span>
      )}
    </div>
  );
};
