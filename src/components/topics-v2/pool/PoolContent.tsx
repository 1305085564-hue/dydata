"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";
import { PoolGrid } from "./PoolGrid";
import { PoolTable } from "./PoolTable";
import { PoolEmptyState } from "./PoolEmptyState";

export type PoolContentProps = Pick<
  TopicPoolExplorerProps,
  | "items"
  | "loading"
  | "error"
  | "onRetry"
  | "onGoToFeishu"
  | "onSelectTopic"
> & {
  displayMode: "grid" | "table";
  hasRealActiveFilters: boolean;
  onClearAllFilters: () => void;
};

export function PoolContent({
  items,
  loading,
  error,
  onRetry,
  onGoToFeishu,
  onSelectTopic,
  displayMode,
  hasRealActiveFilters,
  onClearAllFilters,
}: PoolContentProps) {
  return (
    <>
      {/* 刷新中且已有旧结果：不整块换成转圈，改为顶部一条细进度 + 旧内容压暗（stale-while-revalidate） */}
      {loading && items.length > 0 && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-[#F1F1F0]" role="progressbar" aria-label="选题库刷新中">
          <div className="h-full w-1/3 bg-current text-[#D97757] animate-pulse" />
        </div>
      )}

      {/* 主展示区 */}
      {loading && items.length === 0 ? (
        <div className="py-20 text-center">
          <RefreshCw className="w-5 h-5 text-[#78716C] animate-spin mx-auto mb-2" />
          <p className="text-[12px] text-[#78716C] font-normal">选题库加载中...</p>
        </div>
      ) : error ? (
        <Alert variant="error" className="p-4 sm:p-5">
          <div className="space-y-1">
            <AlertTitle>
              选题库数据加载失败
            </AlertTitle>
            <AlertDescription className="text-[12px] text-[#78716C] font-normal">
              {error}
            </AlertDescription>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-3 h-7 rounded-md bg-white border border-[#E2E2DF] text-[12px] font-normal text-[#1F1E1D] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 transition-all cursor-pointer shrink-0 shadow-input"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新加载</span>
          </button>
        </Alert>
      ) : items.length === 0 ? (
        <PoolEmptyState
          hasRealActiveFilters={hasRealActiveFilters}
          onClearAllFilters={onClearAllFilters}
        />
      ) : displayMode === "grid" ? (
        <PoolGrid
          items={items}
          loading={loading}
          onGoToFeishu={onGoToFeishu}
          onSelectTopic={onSelectTopic}
        />
      ) : (
        <PoolTable
          items={items}
          loading={loading}
          onGoToFeishu={onGoToFeishu}
          onSelectTopic={onSelectTopic}
        />
      )}
    </>
  );
}
