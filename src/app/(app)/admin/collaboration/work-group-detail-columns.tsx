"use client";

import type { RetentionMetrics } from "@/lib/collaboration/content-quality-contract";

/**
 * 小队表「展开明细」共用部分：
 * 互动明细 = 互动率拆成赞、评、转、藏四项（与互动率同口径：先加总再相除，四项相加等于互动率）；
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
  { key: "shareRate", label: "转发率" },
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

/** 展开/收起开关：默认合并展示，点开后互动与留存都拆成细项。 */
export function DetailToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        aria-pressed={expanded}
        onClick={onToggle}
        className="rounded-md px-2 py-1 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors duration-150 cursor-pointer"
      >
        {expanded ? "收起明细" : "展开明细（互动四项 · 留存五项）"}
      </button>
    </div>
  );
}
