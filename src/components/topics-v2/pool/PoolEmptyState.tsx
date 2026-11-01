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
            description="这组筛选里暂时没有合适的选题，放宽一点条件，或许就遇见了。"
            action={{
              label: "清空当前筛选",
              onClick: onClearAllFilters,
            }}
          />
        ) : (
          <EmptyState
            title="干货选题库还没有内容"
            description="团队内播放过 3 万的干货作品会自动收进来，也可以批量导入或亲手添一条。"
          />
        )
  );
}
