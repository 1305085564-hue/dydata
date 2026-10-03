"use client";

import React from "react";
import { EmptyState } from "@/components/ui/empty-state";

export interface PoolEmptyStateProps {
  hasRealActiveFilters: boolean;
  onClearAllFilters: () => void;
}

export function PoolEmptyState({
  hasRealActiveFilters,
  onClearAllFilters,
}: PoolEmptyStateProps) {
  return (
        hasRealActiveFilters ? (
          <EmptyState
            title="未找到符合条件的选题"
            description="当前筛选组合下暂无匹配的干货选题，可尝试清空或放宽筛选条件"
            action={{
              label: "清空当前筛选",
              onClick: onClearAllFilters,
            }}
          />
        ) : (
          <EmptyState
            title="干货选题库暂无内容"
            description="内部达到 3 万播放的干货视频将自动入库，也可以批量导入或手动录入"
          />
        )
  );
}
