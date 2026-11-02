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
            description="当前筛选下没有合适的选题，可尝试放宽筛选条件。"
            action={{
              label: "清空当前筛选",
              onClick: onClearAllFilters,
            }}
          />
        ) : (
          <EmptyState
            title="选题库中暂无内容"
            description="团队内播放过 3 万的干货作品会自动收录，也可以批量导入或手动添加。"
          />
        )
  );
}
