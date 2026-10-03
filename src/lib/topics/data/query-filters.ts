// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFilterBuilder = { lt: (col: string, val: number) => any; gte: (col: string, val: number) => any; lte: (col: string, val: number) => any; gt: (col: string, val: number) => any };

/** 视频时长区间过滤（真实秒数，无时长数据不归入任何区间）。 */
export function applyDurationRangeFilter<T extends AnyFilterBuilder>(query: T, durationRange: "under_2m" | "2_5m" | "over_5m"): T {
  if (durationRange === "under_2m") return query.lt("duration_seconds", 120);
  if (durationRange === "2_5m") return query.gte("duration_seconds", 120).lte("duration_seconds", 300);
  return query.gt("duration_seconds", 300);
}
