"use client";

import { useState } from "react";
import { useAiConfig } from "./hooks/use-ai-config";
import { useAvailabilityReport } from "./hooks/use-availability";
import { BusinessFunctionsPanel } from "./components/business-functions-panel";
import { ComputePoolPanel } from "./components/compute-pool-panel";
import { KeyTestResultsBar, type KeyTestResultItem } from "./components/shelf-models-dialog";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, RefreshCw } from "lucide-react";

export function AIConfigShell() {
  const { bundle, isLoading, error, loadData, lastLoadedAt, testAllKeys } = useAiConfig();
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<{ total: number; results: KeyTestResultItem[] } | null>(null);
  const [fallbackNonce, setFallbackNonce] = useState(0);
  const [noChannelNonce, setNoChannelNonce] = useState(0);
  const report = useAvailabilityReport(bundle);

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      const result = await testAllKeys();
      if (result.results?.length) {
        setTestResults({ total: result.total ?? result.results.length, results: result.results });
      }
    } finally {
      setTestingAll(false);
    }
  };

  if (error && !bundle) {
    return <div className="rounded-xl border border-[#C0685C]/30 bg-white p-6 space-y-3">
      <h2 className="text-[15px] font-medium text-[#141413]">配置加载失败</h2>
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

  // 状态点：无可用渠道最重（异常红），其次业务回落（待处理琥珀），全绿才亮绿
  const dotColor = report
    ? report.noChannelModelFamilyCount > 0
      ? "bg-[#C0685C]"
      : report.affectedBusinessCount > 0
        ? "bg-[#B98A54]"
        : "bg-[#6FAA7D]"
    : "bg-[#6FAA7D]";

  return (
    <div className="w-full space-y-5">
      {/* 顶部总览与体检条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#E2E2DF] bg-white px-4 py-2.5 shadow-input">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className={`size-2 rounded-full ${dotColor}`} />
            <span className="text-[13px] font-medium text-[#141413]">
              全站算力健康状态
            </span>
          </div>
          <span className="text-[#E2E2DF]">·</span>
          {report && (
            <p className="text-[12px] text-[#78716C]">
              健康 {report.healthyKeyCount}/{report.enabledKeyCount} · 可调度{" "}
              {report.schedulableKeyCount}/{report.enabledKeyCount}
              {lastLoadedAt && <span className="ml-2 text-[#A8A29E]">最后核对 {new Date(lastLoadedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>}
              {report.affectedBusinessCount > 0 && (
                <button type="button" onClick={() => setFallbackNonce((value) => value + 1)} className="text-[#B98A54] hover:underline cursor-pointer">
                  {" "}· {report.affectedBusinessCount} 个业务正在使用回退
                </button>
              )}
              {report.noChannelModelFamilyCount > 0 && (
                <button type="button" onClick={() => setNoChannelNonce((value) => value + 1)} className="text-[#C0685C] hover:underline cursor-pointer">
                  {" "}· {report.noChannelModelFamilyCount} 个模型无可用渠道
                </button>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" title="刷新配置" aria-label="刷新配置" onClick={() => void loadData()} className="size-7 text-[#78716C]">
          <RefreshCw className="size-3.5" />
        </Button>
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
      </div>

      {testResults && <KeyTestResultsBar testResults={testResults} onClose={() => setTestResults(null)} />}

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

        <BusinessFunctionsPanel fallbackNonce={fallbackNonce} />
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

        <ComputePoolPanel noChannelNonce={noChannelNonce} />
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
