import type { ContentListFilterValue } from "@/lib/content/domain/content-list-filters";

/**
 * 数据复盘工具栏第一排：全部 · 优 · 良 · 普 · 未评级 · 异常。
 * 每段既是答案（这天几篇优、几篇异常）也是筛选（点一下只看这些），互斥单选。
 * 底层仍是原来的两个筛选字段：qualityGrade 与 onlyAnomaly，口径不变。
 */
export type ContentSegmentKey = "all" | "excellent" | "good" | "fair" | "unrated" | "anomaly";

export type ContentSegmentCounts = Record<ContentSegmentKey, number>;

export const CONTENT_SEGMENTS: ReadonlyArray<{ key: ContentSegmentKey; label: string; tip?: string }> = [
  { key: "all", label: "全部" },
  { key: "excellent", label: "优" },
  { key: "good", label: "良" },
  { key: "fair", label: "普" },
  { key: "unrated", label: "未评级", tip: "播放或留存数据还不全，暂时评不了级" },
  { key: "anomaly", label: "异常", tip: "删稿、限流或数据异常的作品" },
];

export function activeSegmentOf(filters: Pick<ContentListFilterValue, "onlyAnomaly" | "qualityGrade">): ContentSegmentKey {
  if (filters.onlyAnomaly) return "anomaly";
  switch (filters.qualityGrade) {
    case "excellent":
    case "good":
    case "fair":
    case "unrated":
      return filters.qualityGrade;
    default:
      return "all";
  }
}

export function segmentFilterPatch(key: ContentSegmentKey): Pick<ContentListFilterValue, "onlyAnomaly" | "qualityGrade"> {
  if (key === "anomaly") return { onlyAnomaly: true, qualityGrade: "all" };
  if (key === "all") return { onlyAnomaly: false, qualityGrade: "all" };
  return { onlyAnomaly: false, qualityGrade: key };
}

/**
 * 分段计数的「底」：除分段本身以外的全部条件。底不变时，切到「优」之后其余各段仍显示
 * 在「全部」下数出来的数；底一变（换日期、换负责人、搜索）就要回到「全部」重新数。
 */
export function segmentBaseKey(filters: ContentListFilterValue, view: string): string {
  const { onlyAnomaly: _anomaly, qualityGrade: _grade, ...rest } = filters;
  void _anomaly;
  void _grade;
  return JSON.stringify([view, rest]);
}

/** 段上是否显示数字：只显示可信的数——计数底一致才显示；「全部」的数在页头 */
export function segmentCountText(
  key: ContentSegmentKey,
  counts: ContentSegmentCounts | null,
): string | null {
  if (!counts || key === "all") return null;
  return String(counts[key]);
}
