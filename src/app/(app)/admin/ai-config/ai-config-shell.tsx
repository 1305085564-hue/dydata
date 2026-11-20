"use client";

import { useCallback, useState } from "react";
import { useAiConfig } from "./hooks/use-ai-config";
import { BusinessFunctionsPanel } from "./components/business-functions-panel";
import { ComputePoolPanel, type ModelFocusRequest } from "./components/compute-pool-panel";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { usePublishPageHeadline } from "@/components/editorial/page-headline";
import { buildAiConfigHeadline } from "./ai-config-headline";

export function AIConfigShell() {
  const { bundle, isLoading, error, loadData } = useAiConfig();
  usePublishPageHeadline("ai-config", buildAiConfigHeadline(bundle?.availability?.businessSummary));

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
    // 占位块按真实结构排：区块标题 → 功能表 → 区块标题 → 工具栏 → 模型列表，数据到了不整页跳
    return (
      <div className="w-full space-y-5" aria-busy="true">
        <div className="space-y-3">
          <div className="h-7 w-40 rounded-md bg-[#F1F1F0] animate-pulse" />
          <div className="h-72 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-7 w-48 rounded-md bg-[#F1F1F0] animate-pulse" />
          <div className="h-12 rounded-md bg-[#F7F7F6] animate-pulse" />
          <div className="h-64 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-normal font-serif text-[20px] text-[#141413] tracking-tight">
            功能用哪个模型
          </h2>
          <Button
            variant="ghost"
            size="icon"
            title="刷新配置"
            aria-label="刷新配置"
            onClick={() => void loadData()}
            className="size-7 text-[#78716C] hover:text-[#141413]"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        <BusinessFunctionsPanel onRepairModel={handleRepairModel} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-normal font-serif text-[20px] text-[#141413] tracking-tight">
            模型从哪些渠道来
          </h2>
        </div>

        <ComputePoolPanel focusRequest={focusRequest} />
      </section>
    </div>
  );
}
