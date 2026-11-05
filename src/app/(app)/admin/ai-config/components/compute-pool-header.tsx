"use client";

import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, AlertCircle, ShieldAlert } from "lucide-react";
import { LastCheckSummaryCard, type CheckResultItem } from "./channel-model-test-list";
import { cn } from "@/lib/utils";

export interface ComputePoolHeaderProps {
  summary: {
    normal: number;
    fallback: number;
    outage: number;
    needsAttentionChannels: number;
  };
  onCheckAll: () => Promise<void>;
  onOpenAddKey: () => void;
  isChecking: boolean;
  checkResult: {
    total: number;
    successCount: number;
    failureCount: number;
    results: CheckResultItem[];
  } | null;
  onClearCheckResult?: () => void;
}

export function ComputePoolHeader({
  summary,
  onCheckAll,
  onOpenAddKey,
  isChecking,
  checkResult,
  onClearCheckResult,
}: ComputePoolHeaderProps) {
  const hasOutage = summary.outage > 0;
  const hasNeedsAttention = summary.needsAttentionChannels > 0;

  return (
    <div className="space-y-4">
      {/* 顶部单行摘要与操作条 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E2E2DF] bg-white p-4 shadow-card">
        {/* S3: 顶部摘要一行字 */}
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-[#4B6B4E]">
            {summary.normal} 个功能正常
          </span>
          <span className="text-[#78716C]">·</span>
          <span className={summary.fallback > 0 ? "text-[#8A6A2F]" : "text-[#78716C]"}>
            {summary.fallback} 个在顶班
          </span>
          <span className="text-[#78716C]">·</span>
          <span
            className={cn(
              hasOutage ? "text-status-danger font-normal inline-flex items-center gap-1" : "text-[#78716C]"
            )}
          >
            {hasOutage && <AlertCircle className="size-3.5" />}
            {summary.outage} 个停摆
          </span>
          <span className="text-[#78716C]">·</span>
          <span
            className={cn(
              hasNeedsAttention ? "text-status-danger font-normal inline-flex items-center gap-1" : "text-[#78716C]"
            )}
          >
            {hasNeedsAttention && <ShieldAlert className="size-3.5" />}
            {summary.needsAttentionChannels} 条渠道要你处理
          </span>
        </div>

        {/* 顶部操作按钮 */}
        <div className="flex items-center gap-3">
          {/* S1: 检查一遍 */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#78716C] hidden sm:inline">
              只查正在用的模型
            </span>
            <Button
              variant="outline"
              size="s"
              onClick={onCheckAll}
              disabled={isChecking}
              className="h-8 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              <RefreshCw className={cn("size-3.5", isChecking && "animate-spin")} />
              <span>{isChecking ? "检查中…" : "检查一遍"}</span>
            </Button>
          </div>

          {/* 接入新渠道 */}
          <Button
            size="s"
            onClick={onOpenAddKey}
            className="h-8 gap-1 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
          >
            <Plus className="size-3.5" />
            <span>接入新渠道</span>
          </Button>
        </div>
      </div>

      {/* S2: 最近一次检查结果卡片 */}
      {checkResult && (
        <LastCheckSummaryCard
          checkResult={checkResult}
          onDismiss={onClearCheckResult}
        />
      )}
    </div>
  );
}
