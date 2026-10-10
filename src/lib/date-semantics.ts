import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

export type PublishedDateFields = {
  published_at?: string | null;
  report_date?: string | null;
};

/**
 * 用户可见作品的日期：优先真实发布日；历史数据缺少发布日时回退日报归属日。
 * 上传时间不参与作品日期计算，避免补交作品被显示成上传日的新作品。
 */
export function getPublishedDateKey(row: PublishedDateFields): string | null {
  if (row.published_at) {
    const date = new Date(row.published_at);
    if (!Number.isNaN(date.getTime())) return formatShanghaiDateOnly(date);
  }
  return row.report_date || null;
}

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
  return getPublishedDateKey(row) ?? "发布日期未知";
}
