import { useEffect, useState, useCallback } from "react";
import { HeaderNav } from "./components/layout/HeaderNav";
import { OperationsView } from "./components/operations/OperationsView";
import { DisputesExplorer } from "./components/disputes/DisputesExplorer";
import { BenchmarkEvaluation } from "./components/evaluation/BenchmarkEvaluation";
import type { DisputeListItemDto, DisputeDetailDto } from "./types/api";
import { api } from "./services/api";

export function App() {
  const [activeView, setActiveView] = useState<"operations" | "disputes" | "evaluation">("operations");
  const [selectedDisputeId, setSelectedDisputeId] = useState<string>("D-1001");
  const [disputes, setDisputes] = useState<DisputeListItemDto[]>([]);
  const [disputeDetail, setDisputeDetail] = useState<DisputeDetailDto | null>(null);
  const [isLoadingDisputes, setIsLoadingDisputes] = useState<boolean>(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  // Load dispute detail
  const loadDetail = useCallback(async (id: string) => {
    try {
      setIsLoadingDetail(true);
      const detail = await api.getDisputeDetail(id);
      setDisputeDetail(detail);
    } catch (err) {
      console.error(`Failed to load detail for ${id}:`, err);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  // Load disputes list from backend
  const loadDisputes = useCallback(async () => {
    try {
      setIsLoadingDisputes(true);
      const list = await api.getDisputes();
      setDisputes(list);
      setIsBackendHealthy(true);
    } catch (err) {
      console.error("Failed to load disputes:", err);
      setIsBackendHealthy(false);
    } finally {
      setIsLoadingDisputes(false);
    }
  }, []);

  // On initial mount, load disputes list & default active case D-1001
  useEffect(() => {
    loadDisputes();
    loadDetail("D-1001");
  }, [loadDisputes, loadDetail]);

  const handleSelectDispute = (id: string) => {
    setSelectedDisputeId(id);
    loadDetail(id);
    setActiveView("operations");
  };

  const handleBackToOverview = () => {
    setActiveView("operations");
  };

  const handleViewChange = (view: "operations" | "disputes" | "evaluation") => {
    setActiveView(view);
    if (view === "operations" && (!disputeDetail || selectedDisputeId !== disputeDetail.dispute_id)) {
      loadDetail(selectedDisputeId || "D-1001");
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0d] text-[#f4f3ef] flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200">
      {/* Edge-Aligned Architectural Navigation */}
      <HeaderNav
        activeView={activeView}
        onViewChange={handleViewChange}
        onSelectDispute={handleSelectDispute}
        selectedDisputeId={selectedDisputeId}
        onBackToOverview={handleBackToOverview}
        isBackendHealthy={isBackendHealthy}
      />

      {/* Primary Investigation Canvas */}
      <main className="flex-1 w-full max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {activeView === "operations" ? (
          <OperationsView
            disputes={disputes}
            activeDisputeId={selectedDisputeId}
            activeDisputeDetail={disputeDetail}
            isLoadingDetail={isLoadingDetail}
            onSelectDispute={handleSelectDispute}
            onRefreshDetail={() => {
              if (selectedDisputeId) loadDetail(selectedDisputeId);
              loadDisputes();
            }}
            onNavigateToDisputes={() => setActiveView("disputes")}
          />
        ) : activeView === "disputes" ? (
          <DisputesExplorer
            disputes={disputes}
            isLoading={isLoadingDisputes}
            onSelectDispute={handleSelectDispute}
          />
        ) : (
          <BenchmarkEvaluation />
        )}
      </main>
    </div>
  );
}

export default App;
