"use client";

import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComputePoolActionsProps {
  onCheckAll: () => Promise<void>;
  onOpenAddKey: () => void;
  isChecking: boolean;
}

/**
 * 模型区工具栏右侧的两个动作。渠道要不要处理由左侧「要处理 N」筛选说，这里不再单独占一行；
 * 「接入新渠道」不是天天做的事，用描边按钮，不和出问题的行抢焦点（《效率美学》§2.2）。
 */
export function ComputePoolActions({ onCheckAll, onOpenAddKey, isChecking }: ComputePoolActionsProps) {
  return (
    <div data-slot="ai-pool-actions" className="flex items-center gap-2">
      <Button
        variant="outline"
        size="s"
        onClick={onCheckAll}
        disabled={isChecking}
        title="只查正在用的模型"
        className="h-8 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
      >
        <RefreshCw className={cn("size-3.5", isChecking && "animate-spin")} />
        <span>{isChecking ? "检查中…" : "检查一遍"}</span>
      </Button>
      <Button
        variant="outline"
        size="s"
        onClick={onOpenAddKey}
        className="h-8 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
      >
        <Plus className="size-3.5" />
        <span>接入新渠道</span>
      </Button>
    </div>
  );
}
