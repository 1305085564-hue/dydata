"use client";

import { Fragment, type ReactNode } from "react";
import { TableCell, TableHead } from "@/components/ui/table";
import {
  formatRetentionValue,
  type ContentQualitySummary,
  type RetentionMetrics,
} from "@/lib/collaboration/content-quality-contract";
import type { WorkGroupPerformanceMetrics } from "./types";

/**
 * 小队表「展开明细」共用部分：
 * 互动明细 = 互动率拆成赞、评、转、藏四项（与互动率同口径：先加总再相除，四项相加等于互动率）；
 * 留存明细 = 五项留存原始值，按作品算术平均（与留存达成同一批作品）。
 * 列表与详情共用，保证两处列、口径一致。
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

const DETAIL_WIDTH = "w-[84px]";

function formatDetailRate(value: number | null | undefined) {
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
        className="rounded-md px-2.5 py-1 text-[13px] font-normal text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {expanded ? "收起明细" : "展开明细（互动四项 · 留存五项）"}
      </button>
    </div>
  );
}

/** 互动明细表头：renderHead 由父表提供，可排序列走父表的排序按钮，其余用普通表头。 */
export function InteractionDetailHeads({
  renderHead,
}: {
  renderHead: (field: DetailSortField | null, label: string, width: string) => ReactNode;
}) {
  return (
    <>
      {INTERACTION_DETAIL_COLUMNS.map((column) => (
        <Fragment key={column.key}>
          {renderHead(column.sortField ?? null, column.label, DETAIL_WIDTH)}
        </Fragment>
      ))}
    </>
  );
}

export function InteractionDetailCells({
  metrics,
  strong = false,
}: {
  metrics: Pick<WorkGroupPerformanceMetrics, "likeRate" | "commentRate" | "shareRate" | "favoriteRate">;
  strong?: boolean;
}) {
  return (
    <>
      {INTERACTION_DETAIL_COLUMNS.map((column) => (
        <TableCell
          key={column.key}
          className={`py-2 px-2 text-right tabular-nums text-[#1F1E1D]${strong ? " font-normal" : ""}`}
        >
          {formatDetailRate(metrics[column.key])}
        </TableCell>
      ))}
    </>
  );
}

export function RetentionDetailHeads() {
  return (
    <>
      {RETENTION_DETAIL_COLUMNS.map((column) => (
        <TableHead
          key={column.key}
          className={`py-2 px-2 text-right font-normal text-[#78716C] ${DETAIL_WIDTH}`}
        >
          {column.label}
        </TableHead>
      ))}
    </>
  );
}

export function RetentionDetailCells({
  contentQuality,
  strong = false,
}: {
  contentQuality: ContentQualitySummary | null | undefined;
  strong?: boolean;
}) {
  return (
    <>
      {RETENTION_DETAIL_COLUMNS.map((column) => (
        <TableCell
          key={column.key}
          className={`py-2 px-2 text-right tabular-nums text-[#1F1E1D]${strong ? " font-normal" : ""}`}
        >
          {formatRetentionValue(contentQuality?.retentionAverages?.[column.key], column.unit)}
        </TableCell>
      ))}
    </>
  );
}

export const DETAIL_FOOTNOTE =
  "展开明细：互动四项与互动率同口径（先加总再相除，四项相加等于互动率）；留存五项为播放达到 2,000 且算得出留存的作品的算术平均，与「留存达成」同一批作品，不按播放加权。";
