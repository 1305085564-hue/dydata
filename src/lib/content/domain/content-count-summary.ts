import {
  CUSTOM_PLAY_BUCKET_KEY,
  resolveEffectiveDates,
  type ContentListFilterValue,
} from "./content-list-filters";

export interface ContentCountDisplay {
  filtered: boolean;
  matchedCount: number;
  totalCount: number;
  text: string;
}

/** 会在数据库 scoped_videos 层收窄日期目录的筛选条件（负责人 / 账号 / 关键词）。 */
export function hasScopedContentFilters(
  filters: Pick<ContentListFilterValue, "userId" | "accountId" | "keyword">,
): boolean {
  return Boolean(filters.userId || filters.accountId || filters.keyword.trim());
}

/** 在日期窗口内收窄作品列表的非日期筛选（评级 / 异常 / 播放量 / 选题库 / 只看命中高亮）。 */
export function hasSecondaryContentFilters(
  filters: Pick<
    ContentListFilterValue,
    | "playBucket"
    | "playMin"
    | "playMax"
    | "qualityGrade"
    | "onlyAnomaly"
    | "topicStatus"
    | "highlightRules"
    | "highlightOnly"
  >,
): boolean {
  const hasPlayFilter = Boolean(
    filters.playBucket
      && (filters.playBucket !== CUSTOM_PLAY_BUCKET_KEY
        || Boolean(filters.playMin)
        || Boolean(filters.playMax)),
  );
  const hasHighlightFilter =
    filters.highlightOnly === true && Object.keys(filters.highlightRules ?? {}).length > 0;
  return (
    hasPlayFilter
    || filters.qualityGrade !== "all"
    || filters.onlyAnomaly === true
    || filters.topicStatus !== "all"
    || hasHighlightFilter
  );
}

/** 是否存在任意非日期收窄筛选：切换日期区间本身不算筛选，只有额外收窄条件才算。 */
export function hasNarrowingContentFilters(filters: ContentListFilterValue): boolean {
  return hasScopedContentFilters(filters) || hasSecondaryContentFilters(filters);
}

/** 解析当前查询对应的日期窗口（支持默认单日回落到最新有作品日）。 */
export function resolveActiveDateWindow(
  filters: Pick<ContentListFilterValue, "timeRange" | "startDate" | "endDate">,
  availableDates: string[] = [],
): { startDate: string; endDate: string; isRange: boolean } {
  const { effectiveStartDate, effectiveEndDate } = resolveEffectiveDates(filters);
  if (effectiveStartDate || effectiveEndDate) {
    const isRange = Boolean(effectiveStartDate && effectiveEndDate && effectiveStartDate !== effectiveEndDate);
    return {
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      isRange,
    };
  }
  const latestDate = availableDates[0] ?? "";
  return {
    startDate: latestDate,
    endDate: latestDate,
    isRange: false,
  };
}

/** 按当前日期窗口汇总每日未筛选条数（仅当 availableCounts 未受 scoped 筛选收窄时准确）。 */
export function sumAvailableCountsForWindow(
  availableCounts: Array<{ d: string; c: number }> | undefined,
  window: { startDate: string; endDate: string },
): number | null {
  if (!availableCounts || availableCounts.length === 0) return null;
  const { startDate, endDate } = window;
  if (!startDate && !endDate) {
    return availableCounts[0]?.c ?? 0;
  }
  let total = 0;
  for (const item of availableCounts) {
    if (startDate && item.d < startDate) continue;
    if (endDate && item.d > endDate) continue;
    total += item.c;
  }
  return total;
}

/** 统一底栏计数展示口径：未筛选显示「共 Y 条」，筛选后显示「命中 X / 共 Y 条」（X ≤ Y）。 */
export function resolveContentCountDisplay({
  matchedCount,
  unfilteredTotal,
  hasNarrowingFilters,
}: {
  matchedCount: number;
  unfilteredTotal: number | null | undefined;
  hasNarrowingFilters: boolean;
}): ContentCountDisplay {
  const safeMatched = Math.max(0, matchedCount);
  if (hasNarrowingFilters && typeof unfilteredTotal === "number" && Number.isFinite(unfilteredTotal)) {
    const safeTotal = Math.max(safeMatched, Math.round(unfilteredTotal));
    return {
      filtered: true,
      matchedCount: safeMatched,
      totalCount: safeTotal,
      text: `命中 ${safeMatched} / 共 ${safeTotal} 条`,
    };
  }
  return {
    filtered: false,
    matchedCount: safeMatched,
    totalCount: safeMatched,
    text: `共 ${safeMatched} 条`,
  };
}
