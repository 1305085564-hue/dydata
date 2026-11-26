import type { SortField } from "@/lib/content/domain/content-list";

/**
 * 数据复盘桌面表的列定义：表头和表体都从这一份生成，列顺序只在这里写一次。
 * （此前表头、表体各写一遍，2026-11-17 出过第 14–16 列错位。）
 *
 * 顺序 = 判断顺序（效率美学 §1.4）：
 *   作品（两行：标题 / 负责人 · 发布时间）→ 评级（结论）
 *   → 播放 / 互动率 / 留存达成（评级由这三项决定）→ 涨粉 → 互动明细（完整视图）→ 留存明细
 * 发布时间并进作品格第二行，作品列头即「按发布时间排序」。
 */
export type ContentColumnKey =
  | "title"
  | "overall_grade"
  | "play_count"
  | "interaction_rate"
  | "retention_achievement"
  | "follower_gain"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "avg_play_duration"
  | "avg_play_ratio"
  | "completion_rate";

export type ContentColumnTip =
  | { kind: "standard"; metric: "bounceRate2s" | "completionRate5s" | "avgPlayDuration" | "avgPlayRatio" | "completionRate" }
  | { kind: "interaction" }
  | { kind: "retention" }
  | { kind: "grade" };

export interface ContentColumn {
  key: ContentColumnKey;
  label: string;
  /** 完整视图列宽（px），配合 table-fixed */
  width: number;
  sortField?: SortField;
  /** 只在「完整」视图出现 */
  fullOnly?: boolean;
  /** 新一组的第一列：左侧多留白，用留白分组，不画竖线 */
  groupStart?: boolean;
  /** 排序按钮念出来的名字（默认同 label），作品列按发布时间排 */
  sortLabel?: string;
  /** 列头悬停说明 */
  tip?: ContentColumnTip;
  align: "left" | "right";
}

export const CONTENT_COLUMNS: readonly ContentColumn[] = [
  { key: "title", label: "作品", width: 360, sortField: "published_at", sortLabel: "发布时间", align: "left" },
  { key: "overall_grade", label: "评级", width: 54, sortField: "overall_grade", tip: { kind: "grade" }, align: "left" },
  { key: "play_count", label: "播放量", width: 72, sortField: "play_count", align: "right" },
  { key: "interaction_rate", label: "互动率", width: 70, sortField: "interaction_rate", tip: { kind: "interaction" }, align: "right" },
  { key: "retention_achievement", label: "留存达成", width: 80, sortField: "retention_achievement", tip: { kind: "retention" }, align: "right" },
  { key: "follower_gain", label: "涨粉", width: 58, sortField: "follower_gain", align: "right" },
  { key: "likes", label: "点赞", width: 64, sortField: "likes", fullOnly: true, groupStart: true, align: "right" },
  { key: "comments", label: "评论", width: 58, sortField: "comments", fullOnly: true, align: "right" },
  { key: "shares", label: "分享", width: 58, sortField: "shares", fullOnly: true, align: "right" },
  { key: "favorites", label: "收藏", width: 58, sortField: "favorites", fullOnly: true, align: "right" },
  { key: "bounce_rate_2s", label: "2s跳出", width: 80, sortField: "bounce_rate_2s", groupStart: true, tip: { kind: "standard", metric: "bounceRate2s" }, align: "right" },
  { key: "completion_rate_5s", label: "5s完播", width: 74, sortField: "completion_rate_5s", tip: { kind: "standard", metric: "completionRate5s" }, align: "right" },
  { key: "avg_play_duration", label: "均播", width: 58, sortField: "avg_play_duration", tip: { kind: "standard", metric: "avgPlayDuration" }, align: "right" },
  { key: "avg_play_ratio", label: "播放占比", width: 80, sortField: "avg_play_ratio", tip: { kind: "standard", metric: "avgPlayRatio" }, align: "right" },
  { key: "completion_rate", label: "完播", width: 68, sortField: "completion_rate", tip: { kind: "standard", metric: "completionRate" }, align: "right" },
];

/** 简洁视图沿用原版列宽（合计 1096px，配合 w-full 铺满标准内容轨道）。 */
const SPACIOUS_COLUMN_WIDTHS: Partial<Record<ContentColumnKey, number>> = {
  title: 400,
  overall_grade: 56,
  play_count: 76,
  interaction_rate: 72,
  retention_achievement: 80,
  follower_gain: 60,
  bounce_rate_2s: 78,
  completion_rate_5s: 72,
  avg_play_duration: 62,
  avg_play_ratio: 78,
  completion_rate: 62,
};

export function visibleContentColumns(isSpacious: boolean): ContentColumn[] {
  return CONTENT_COLUMNS.filter((column) => !(isSpacious && column.fullOnly));
}

export function contentColumnWidth(column: ContentColumn, isSpacious: boolean): number {
  if (isSpacious) {
    return SPACIOUS_COLUMN_WIDTHS[column.key] ?? column.width;
  }
  return column.width;
}

/**
 * 表头与表体共用的横向内边距：
 * - 简洁视图（spacious）：还原原版宽松内边距（title 为 px-3，其余列 groupStart ? "pl-4 pr-2" : "px-2"）
 * - 完整视图（full）：适中紧凑档（title 为 pl-4 pr-2，组边界 pl-3 pr-1.5，其余 px-1.5，末列 pr-4）
 */
export function contentColumnPadClass(
  column: ContentColumn,
  isSpacious: boolean,
  isLast = false,
): string {
  if (isSpacious) {
    if (column.key === "title") return "px-3";
    return column.groupStart ? "pl-4 pr-2" : "px-2";
  }
  if (column.key === "title") return "pl-4 pr-2";
  if (column.groupStart && isLast) return "pl-3 pr-4";
  if (column.groupStart) return "pl-3 pr-1.5";
  if (isLast) return "pl-1.5 pr-4";
  return "px-1.5";
}

/** 当前排序列整列浅底，和协作管理岗位表同一配方；冻结列需不透明底防止横向滚动透字 */
export const SORTED_COL_BG = "bg-[#F7F7F6]/70";
export const SORTED_STICKY_COL_BG = "bg-[#F7F7F6]";
