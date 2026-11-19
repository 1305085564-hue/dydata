import type { SortField } from "@/lib/content/domain/content-list";

/**
 * 数据复盘桌面表的列定义：表头和表体都从这一份生成，列顺序只在这里写一次。
 * （此前表头、表体各写一遍，2026-11-17 出过第 14–16 列错位。）
 *
 * 顺序 = 判断顺序（效率美学 §1.4）：
 *   作品 → 评级（结论）→ 播放 / 互动率 / 留存达成（评级由这三项决定）→ 涨粉
 *   → 互动明细（完整视图）→ 留存明细 → 发布时间
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
  | "completion_rate"
  | "published_at";

export type ContentColumnTip =
  | { kind: "standard"; metric: "bounceRate2s" | "completionRate5s" | "avgPlayDuration" | "avgPlayRatio" | "completionRate" }
  | { kind: "interaction" }
  | { kind: "retention" }
  | { kind: "grade" };

export interface ContentColumn {
  key: ContentColumnKey;
  label: string;
  /** 列宽（px），配合 table-fixed */
  width: number;
  sortField?: SortField;
  /** 只在「完整」视图出现 */
  fullOnly?: boolean;
  /** 新一组的第一列：左侧多留白，用留白分组，不画竖线 */
  groupStart?: boolean;
  /** 列头悬停说明 */
  tip?: ContentColumnTip;
  align: "left" | "right";
}

export const CONTENT_COLUMNS: readonly ContentColumn[] = [
  { key: "title", label: "作品 · 负责人", width: 380, align: "left" },
  { key: "overall_grade", label: "评级", width: 56, sortField: "overall_grade", tip: { kind: "grade" }, align: "left" },
  { key: "play_count", label: "播放量", width: 76, sortField: "play_count", align: "right" },
  { key: "interaction_rate", label: "互动率", width: 72, sortField: "interaction_rate", tip: { kind: "interaction" }, align: "right" },
  { key: "retention_achievement", label: "留存达成", width: 80, sortField: "retention_achievement", tip: { kind: "retention" }, align: "right" },
  { key: "follower_gain", label: "涨粉", width: 60, sortField: "follower_gain", align: "right" },
  { key: "likes", label: "点赞", width: 68, sortField: "likes", fullOnly: true, groupStart: true, align: "right" },
  { key: "comments", label: "评论", width: 52, sortField: "comments", fullOnly: true, align: "right" },
  { key: "shares", label: "分享", width: 52, sortField: "shares", fullOnly: true, align: "right" },
  { key: "favorites", label: "收藏", width: 52, sortField: "favorites", fullOnly: true, align: "right" },
  { key: "bounce_rate_2s", label: "2s跳出", width: 78, sortField: "bounce_rate_2s", groupStart: true, tip: { kind: "standard", metric: "bounceRate2s" }, align: "right" },
  { key: "completion_rate_5s", label: "5s完播", width: 72, sortField: "completion_rate_5s", tip: { kind: "standard", metric: "completionRate5s" }, align: "right" },
  { key: "avg_play_duration", label: "均播", width: 62, sortField: "avg_play_duration", tip: { kind: "standard", metric: "avgPlayDuration" }, align: "right" },
  { key: "avg_play_ratio", label: "播放占比", width: 78, sortField: "avg_play_ratio", tip: { kind: "standard", metric: "avgPlayRatio" }, align: "right" },
  { key: "completion_rate", label: "完播", width: 62, sortField: "completion_rate", tip: { kind: "standard", metric: "completionRate" }, align: "right" },
  { key: "published_at", label: "发布时间", width: 72, sortField: "published_at", groupStart: true, align: "right" },
];

export function visibleContentColumns(isSpacious: boolean): ContentColumn[] {
  return CONTENT_COLUMNS.filter((column) => !(isSpacious && column.fullOnly));
}

/** 当前排序列整列浅底，和协作管理岗位表同一配方 */
export const SORTED_COL_BG = "bg-[#F7F7F6]/70";
