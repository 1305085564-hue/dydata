"use client";

import { useState } from "react";
import { useAiConfig } from "./hooks/use-ai-config";
import { BusinessFunctionsPanel } from "./components/business-functions-panel";
import { ComputePoolPanel } from "./components/compute-pool-panel";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function AIConfigShell() {
  const { bundle, isLoading, error, loadData } = useAiConfig();
  const [fallbackNonce] = useState(0);

  if (error && !bundle) {
    return <div className="rounded-xl border border-[#C0685C]/30 bg-white p-6 space-y-3">
      <h2 className="text-[14px] font-medium text-[#141413]">配置加载失败</h2>
      <p className="text-[13px] text-[#78716C]">{error}</p>
      <Button size="s" variant="outline" onClick={() => void loadData()} className="h-7 text-[12px]">重试</Button>
    </div>;
  }
  if (isLoading || !bundle) {
    return (
      <div className="space-y-6 py-6">
        <div className="h-14 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        <div className="h-64 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
        <div className="h-64 rounded-xl bg-[#FCFCFB] border border-[#E2E2DF] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="icon" title="刷新配置" aria-label="刷新配置" onClick={() => void loadData()} className="size-7 text-[#78716C] hover:text-[#141413]">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* 业务功能调度 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-serif text-[18px] font-medium text-[#141413] tracking-tight">
            业务功能调度
          </h2>
        </div>

        <BusinessFunctionsPanel fallbackNonce={fallbackNonce} />
      </section>

      {/* 算力储备与渠道底座 */}
      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-serif text-[18px] font-medium text-[#141413] tracking-tight">
            算力储备与渠道底座
          </h2>
        </div>

        <ComputePoolPanel />
      </section>

      {/* 完卷微符装帧 */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-2 text-[12px] text-[#A8A29E] select-none">
        <span aria-hidden="true" className="text-[#D97757] font-serif">✦</span>
        <span>算力底座静候调度 · 智能容灾与高可用</span>
        <span aria-hidden="true" className="text-[#D97757] font-serif">✦</span>
      </div>
    </div>
  );
}
