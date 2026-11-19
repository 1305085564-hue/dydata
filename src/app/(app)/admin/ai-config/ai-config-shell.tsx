"use client";

import { useCallback, useState } from "react";
import { useAiConfig } from "./hooks/use-ai-config";
import { BusinessFunctionsPanel } from "./components/business-functions-panel";
import { ComputePoolPanel, type ModelFocusRequest } from "./components/compute-pool-panel";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DutyBoard } from "./components/duty-board";
import { useCallStats } from "./hooks/use-call-stats";
import { usePublishPageHeadline } from "@/components/editorial/page-headline";
import { buildAiConfigHeadline } from "./ai-config-headline";

export function AIConfigShell() {
  const { bundle, isLoading, error, loadData } = useAiConfig();
  const callStats = useCallStats();
  usePublishPageHeadline(
    "ai-config",
    buildAiConfigHeadline(bundle?.availability?.businessSummary, callStats.status === "ready" ? callStats.stats : null),
  );
  const [maintenanceExpanded, setMaintenanceExpanded] = useState(false);
  const refreshStats = callStats.refresh;
  const handleRefresh = useCallback(() => {
    void loadData();
    void refreshStats();
  }, [loadData, refreshStats]);

  // 功能表「去修 →」交给下方模型列表：滚到那个模型、展开、选中。seq 让同一个模型能被反复点到。
  const [focusRequest, setFocusRequest] = useState<ModelFocusRequest | null>(null);
  const handleRepairModel = useCallback((modelId: string) => {
    setFocusRequest((prev) => ({ modelId, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  if (error && !bundle) {
    return (
      <div className="rounded-xl border border-status-danger/30 bg-white p-6 space-y-3">
        <h2 className="font-normal text-[14px] text-[#141413]">配置加载失败</h2>
        <p className="text-[14px] text-[#78716C]">{error}</p>
        <Button size="s" variant="outline" onClick={() => void loadData()} className="h-7 text-[12px]">
          重试
        </Button>
      </div>
    );
  }

  if (isLoading || !bundle) {
    // 占位块按真实结构排：值班表 → 失败流水 → 功能表 → 渠道维护一行，数据到了不整页跳
    return (
      <div className="w-full space-y-4" aria-busy="true">
        <div className="h-80 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        <div className="h-40 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        <div className="space-y-2">
          <div className="h-5 w-32 rounded-md bg-[#F1F1F0] animate-pulse" />
          <div className="h-72 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        </div>
        <div className="h-11 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
      </div>
    );
  }

  const maintenanceOpen = maintenanceExpanded || focusRequest !== null;
  const inUseFamilies = bundle.availability?.modelFamilies.filter((f) => f.isShelved) ?? [];
  const inUseChannelCount = inUseFamilies.reduce(
    (sum, f) => sum + f.channels.filter((c) => c.identity !== "disabled").length,
    0,
  );

  // 从上到下 = 出事时的决策顺序：哪里在出错 → 失败了什么 → 要不要换模型 → 维护渠道
  return (
    <div className="w-full space-y-4">
      <DutyBoard callStats={callStats} onRefresh={handleRefresh} />

      <section className="space-y-2">
        <h2 className="px-1 text-[14px] text-[#141413]">功能用哪个模型</h2>
        <BusinessFunctionsPanel
          onRepairModel={handleRepairModel}
          featureStats={callStats.status === "ready" ? callStats.stats.features : null}
        />
      </section>

      <section className="space-y-2">
        <button
          type="button"
          onClick={() => {
            if (maintenanceOpen) setFocusRequest(null);
            setMaintenanceExpanded(!maintenanceOpen);
          }}
          aria-expanded={maintenanceOpen}
          className="flex w-full items-center gap-2 rounded-xl border border-[#E2E2DF] bg-white px-4 py-2.5 text-left hover:bg-[#F7F7F6]"
        >
          {maintenanceOpen ? (
            <ChevronDown className="size-3.5 text-[#78716C]" />
          ) : (
            <ChevronRight className="size-3.5 text-[#78716C]" />
          )}
          <span className="text-[14px] text-[#141413]">渠道维护</span>
          <span className="text-[12px] text-[#78716C]">
            {inUseFamilies.length} 个模型在用 · {inUseChannelCount} 条渠道 · 找渠道、接入新渠道、排顺位在这里
          </span>
        </button>
        {maintenanceOpen && <ComputePoolPanel focusRequest={focusRequest} />}
      </section>
    </div>
  );
}
