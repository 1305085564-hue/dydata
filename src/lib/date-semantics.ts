import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

export type PublishedDateFields = {
  published_at?: string | null;
  report_date?: string | null;
};

/** 导出等服务端范围查询：发布日优先，无发布日的历史记录才按 report_date 回退。 */
export function buildPublishedDateRangeFilter(from: string | null, to: string | null) {
  if (!from && !to) return null;
  const start = from ?? "1900-01-01";
  const end = to ?? "9999-12-31";
  const startUtc = new Date(`${start}T00:00:00+08:00`).toISOString();
  const endDate = new Date(`${end}T00:00:00+08:00`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endUtc = endDate.toISOString();
  return `and(published_at.is.null,report_date.gte.${start},report_date.lte.${end}),and(published_at.gte.${startUtc},published_at.lt.${endUtc})`;
}

/**
 * 用户可见作品的日期：优先真实发布日；历史数据缺少发布日时回退日报归属日。
 * 上传时间不参与作品日期计算，避免补交作品被显示成上传日的新作品。
 */
export function getPublishedDateForStats(row: PublishedDateFields): string | null {
  if (row.published_at) {
    const date = new Date(row.published_at);
    if (!Number.isNaN(date.getTime())) return formatShanghaiDateOnly(date);
  }
  return row.report_date || null;
}

/** 兼容现有展示调用；发布日取值规则统一由 getPublishedDateForStats 维护。 */
export const getPublishedDateKey = getPublishedDateForStats;

export function getPublishedTimestamp(row: PublishedDateFields): number {
  if (row.published_at) {
    const timestamp = new Date(row.published_at).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  if (row.report_date) {
    const timestamp = new Date(`${row.report_date}T00:00:00+08:00`).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function getPublishedDateLabel(row: PublishedDateFields): string {
  return getPublishedDateForStats(row) ?? "发布日期未知";
}
