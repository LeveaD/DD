import React, { useEffect, useState } from "react";
import { X, Download, FileText, Loader2, AlertTriangle } from "lucide-react";
import { api } from "../../services/api";

interface EvidencePackageModalProps {
  disputeId: string;
  onClose: () => void;
}

export const EvidencePackageModal: React.FC<EvidencePackageModalProps> = ({
  disputeId,
  onClose,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);
        const blob = await api.getEvidencePackagePdf(disputeId);
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      } catch (err: unknown) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [disputeId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-5xl h-[88vh] bg-[#0c0e12] border border-white/[0.12] rounded-sm flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-[#101216]">
          <div className="flex items-center space-x-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/[0.04] border border-white/[0.08] text-white">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-white flex items-center space-x-2">
                <span>EVIDENCE PACKAGE ARTIFACT — {disputeId}</span>
                <span className="text-[10px] text-emerald-400 font-normal border border-emerald-500/20 px-1.5 py-0.2 rounded-sm bg-emerald-500/10">
                  PDFKit Compiled
                </span>
              </div>
              <p className="text-[10px] font-mono text-[#8a8880]">
                Verifiable documentary evidence compiled for merchant acquiring bank
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                download={`evidence_package_${disputeId}.pdf`}
                className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-mono text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] rounded-sm transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download PDF</span>
              </a>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-sm text-[#8a8880] hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-[#090a0d] p-3 flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center space-y-3 text-[#8a8880] font-mono text-xs">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
              <p>Compiling verified evidence package from merchant repository...</p>
            </div>
          ) : error ? (
            <div className="max-w-md p-6 rounded-sm bg-amber-500/10 border border-amber-500/20 text-center space-y-3 font-mono">
              <AlertTriangle className="h-6 w-6 text-amber-400 mx-auto" />
              <p className="text-xs font-bold text-amber-300 uppercase">Package Not Compiled</p>
              <p className="text-[11px] text-amber-200/80">{error}</p>
              <p className="text-[10px] text-[#8a8880] italic">
                Evidence compilation requires the dispute to reach validated status (RESPONSE_VALIDATED, HUMAN_APPROVAL_REQUIRED, READY_FOR_SUBMISSION, or SUBMITTED).
              </p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded-sm border border-white/[0.06]"
              title={`Evidence Package PDF ${disputeId}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
