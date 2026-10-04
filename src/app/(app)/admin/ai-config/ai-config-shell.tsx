"use client";

import { useMemo, useState } from "react";
import { useAiConfig } from "./hooks/use-ai-config";
import { BusinessFunctionsPanel } from "./components/business-functions-panel";
import { ComputePoolPanel } from "./components/compute-pool-panel";
import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";

export function AIConfigShell() {
  const { bundle, isLoading, testAllKeys } = useAiConfig();
  const [testingAll, setTestingAll] = useState(false);

  const stats = useMemo(() => {
    if (!bundle) return { online: 0, total: 0, allRunning: true };
    const total = bundle.keys.length;
    const online = bundle.keys.filter((k) => k.is_enabled && k.consecutive_failures === 0).length;
    const allRunning = bundle.featureControls.every((c) => c.isEnabled || c.lifecycleState === "archived");
    return {
      online,
      total,
      allRunning,
    };
  }, [bundle]);

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      await testAllKeys();
    } finally {
      setTestingAll(false);
    }
  };

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
      {/* 顶部总览与体检条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#E2E2DF] bg-white px-4 py-2.5 shadow-input">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-[#6FAA7D]" />
            <span className="text-[13px] font-medium text-[#141413]">
              全站算力健康状态
            </span>
          </div>
          <span className="text-[#E2E2DF]">·</span>
          <p className="text-[12px] text-[#78716C]">
            {stats.online}/{stats.total} 密钥健康在线 ·{" "}
            {stats.allRunning ? "所有业务功能正常运行中" : "部分业务已手动暂停"}
          </p>
        </div>

        <Button
          size="s"
          variant="outline"
          disabled={testingAll}
          onClick={handleTestAll}
          className="h-7 gap-1 border-[#E2E2DF] text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 shrink-0"
        >
          {testingAll ? (
            <Loader2 className="size-3 animate-spin text-[#D97757]" />
          ) : (
            <Zap className="size-3 text-[#D97757] fill-[#D97757]" />
          )}
          {testingAll ? "全池体检中…" : "全池体检"}
        </Button>
      </div>

      {/* 业务功能调度 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="font-serif text-[18px] font-medium text-[#141413] tracking-tight">
              业务功能调度
            </h2>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              业务优先，开箱即用。管理员选定模型系列，底层算力池按顺位从容调度。
            </p>
          </div>
        </div>

        <BusinessFunctionsPanel />
      </section>

      {/* 算力储备与渠道底座 */}
      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="font-serif text-[18px] font-medium text-[#141413] tracking-tight">
              算力储备与渠道底座
            </h2>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              多渠道密钥储备池，提供健康监测、优先级调度与跨服务商智能容灾。
            </p>
          </div>
        </div>

        <ComputePoolPanel />
      </section>

      {/* 完卷微符装帧 */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-2 text-[12px] text-[#A8A29E] select-none">
        <span className="text-[#D97757] font-serif">✦</span>
        <span>算力底座静候调度 · 智能容灾与高可用</span>
        <span className="text-[#D97757] font-serif">✦</span>
      </div>
    </div>
  );
}
