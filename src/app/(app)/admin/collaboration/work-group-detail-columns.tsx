"use client";

import type { RetentionMetrics } from "@/lib/collaboration/content-quality-contract";
import type { CollaborationDetailMode } from "@/lib/table-view-mode";
import { cn } from "@/lib/utils";
import { OneTip } from "./one-tip";

/**
 * 小队表「完整 / 简洁」明细共用部分：
 * 互动明细 = 互动率拆成赞、评、分享、藏四项（与互动率同口径：先加总再相除，四项相加等于互动率）；
 * 留存明细 = 五项留存原始值，按作品算术平均（与留存达成同一批作品）。
 * 小队表与文案、达人表共用，保证几处列、口径一致。
 */

/** 明细里允许点击排序的列（这两列原本就在默认表头里，保持可排序）。 */
export type DetailSortField = "likeRate" | "favoriteRate";

export const INTERACTION_DETAIL_COLUMNS: ReadonlyArray<{
  key: "likeRate" | "commentRate" | "shareRate" | "favoriteRate";
  label: string;
  sortField?: DetailSortField;
}> = [
  { key: "likeRate", label: "点赞率", sortField: "likeRate" },
  { key: "commentRate", label: "评论率" },
  { key: "shareRate", label: "分享率" },
  { key: "favoriteRate", label: "收藏率", sortField: "favoriteRate" },
];

export const RETENTION_DETAIL_COLUMNS: ReadonlyArray<{
  key: keyof RetentionMetrics;
  label: string;
  unit: "%" | "s";
}> = [
  { key: "bounceRate2s", label: "2秒跳出率", unit: "%" },
  { key: "completionRate5s", label: "5秒完播率", unit: "%" },
  { key: "avgPlayDuration", label: "均播时长", unit: "s" },
  { key: "avgPlayRatio", label: "播放占比", unit: "%" },
  { key: "completionRate", label: "整体完播率", unit: "%" },
];

/** 比率：保留 1 位小数，无数据（播放为 0）显示 —；与数据复盘抽屉同源。 */
export function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export const COLLABORATION_DETAIL_TOGGLE_TIP_FULL =
  "完整：展示互动四项与留存五项明细；简洁：仅保留核心绩效指标";

export const COLLABORATION_DETAIL_TOGGLE_TIP_INTERACTION_ONLY =
  "完整：展示点赞、评论、分享、收藏明细；简洁：仅保留核心绩效指标";

/** 完整 / 简洁切换：默认完整展开，切换后浏览器记住选择。 */
export function DetailToggle({
  expanded,
  onToggle,
  onModeChange,
  tip = COLLABORATION_DETAIL_TOGGLE_TIP_FULL,
  className,
}: {
  expanded: boolean;
  onToggle?: () => void;
  onModeChange?: (mode: CollaborationDetailMode) => void;
  tip?: string;
  className?: string;
}) {
  const selectMode = (next: CollaborationDetailMode) => {
    if (onModeChange) {
      onModeChange(next);
      return;
    }
    if ((next === "full") !== expanded) {
      onToggle?.();
    }
  };

  return (
    <OneTip tip={tip} side="bottom" align="end">
      <div
        role="group"
        aria-label="指标明细视图"
        data-detail-mode={expanded ? "full" : "concise"}
        className={cn("inline-flex items-center gap-1", className)}
      >
        <button
          type="button"
          aria-pressed={expanded}
          onClick={() => selectMode("full")}
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-md px-2.5 text-[14px] transition-colors duration-150 cursor-pointer whitespace-nowrap",
            expanded
              ? "bg-[#F1F1F0] text-[#141413]"
              : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
          )}
        >
          完整
        </button>
        <button
          type="button"
          aria-pressed={!expanded}
          onClick={() => selectMode("concise")}
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-md px-2.5 text-[14px] transition-colors duration-150 cursor-pointer whitespace-nowrap",
            !expanded
              ? "bg-[#F1F1F0] text-[#141413]"
              : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
          )}
        >
          简洁
        </button>
      </div>
    </OneTip>
  );
}
