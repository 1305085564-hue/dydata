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
    <div className="w-full space-y-8">
      {/* 顶部总览与体检条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[#E2E2DF] bg-white p-4.5 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-[#10B981]" />
            <span className="text-[14px] font-medium text-[#141413]">
              全站算力健康状态
            </span>
          </div>
          <p className="text-[13px] text-[#78716C]">
            {stats.online}/{stats.total} 密钥健康在线 ·{" "}
            {stats.allRunning ? "所有业务功能正常运行中" : "部分业务已手动暂停"}
          </p>
        </div>

        <Button
          size="s"
          variant="outline"
          disabled={testingAll}
          onClick={handleTestAll}
          className="h-8.5 gap-1.5 border-[#E2E2DF] text-[13px] text-[#1F1E1D] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 shrink-0"
        >
          {testingAll ? (
            <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
          ) : (
            <Zap className="size-3.5 text-[#D97757] fill-[#D97757]" />
          )}
          {testingAll ? "全池体检中…" : "⚡ 全池体检"}
        </Button>
      </div>

      {/* 第一层：业务功能调度台 */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-[18px] font-medium text-[#141413] tracking-tight">
              第一层：业务功能调度台
            </h2>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              业务优先，开箱即用。管理员只需选定模型系列，底层算力池自动按顺位调度。
            </p>
          </div>
        </div>

        <BusinessFunctionsPanel />
      </section>

      {/* 第二层：算力池与健康资产 */}
      <section className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-[18px] font-medium text-[#141413] tracking-tight">
              第二层：算力池与健康资产
            </h2>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              资产托底，按模型聚合的多渠道密钥池，提供连通检测、优先级调度与安全容灾。
            </p>
          </div>
        </div>

        <ComputePoolPanel />
      </section>
    </div>
  );
}
