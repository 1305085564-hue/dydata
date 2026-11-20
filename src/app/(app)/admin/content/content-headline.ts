import type { ProcessedContentRow } from "@/lib/content/data/content-list";

/**
 * 数据复盘页头答案（2026-11-19 重写，取代诗性导语 content-editorial-epigraph）。
 *
 * 一页一问：「这一天发的作品，哪几条值得点开看？」
 * 标题 = 日期（本身就是日期选择器）+ 篇数；优 / 良 / 普 / 异常各几篇由下面一排分段说，
 * 分段既是答案也是筛选，同一个数只说一处（效率美学 §1.5）。
 */

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 页头里跟在日期后的答案文字：「 · 23 篇」「 · 命中 5 / 23 篇」「 · 没有作品」 */
export function buildContentHeadlineSuffix(input: Omit<ContentHeadlineInput, "currentDate" | "rangeStart" | "rangeEnd"> & { isRange: boolean }): string {
  if (input.matchedCount === 0) return input.hasActiveFilters ? " · 没有符合筛选的作品" : " · 没有作品";
  const showHitRatio = !input.isRange
    && input.hasActiveFilters
    && input.dayTotal !== null
    && input.dayTotal !== input.matchedCount;
  return showHitRatio ? ` · 命中 ${input.matchedCount} / ${input.dayTotal} 篇` : ` · ${input.matchedCount} 篇`;
}

/** 11月18日 周二 */
export function formatDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_LABELS[date.getDay()]}`;
}

/** 11月18日 */
export function formatShortDate(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatCompactCount(val: number): string {
  if (val >= 100_000_000) return `${(val / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (val >= 10_000) return `${(val / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
  return String(Math.round(val));
}

export function countGrades(rows: ProcessedContentRow[]) {
  let excellent = 0;
  let good = 0;
  let fair = 0;
  let unrated = 0;
  for (const row of rows) {
    const grade = row.quality?.overallGrade;
    if (grade === "优") excellent += 1;
    else if (grade === "良") good += 1;
    else if (grade === "普") fair += 1;
    else unrated += 1;
  }
  return { excellent, good, fair, unrated };
}

export interface ContentHeadlineInput {
  view: "all" | "trash";
  /** 单日锚点（YYYY-MM-DD）；区间模式忽略 */
  currentDate: string;
  rangeStart?: string;
  rangeEnd?: string;
  /** 当前查询命中的总篇数（服务端口径，含筛选） */
  matchedCount: number;
  /** 单日不含筛选的当天总篇数；未知时为 null */
  dayTotal: number | null;
  hasActiveFilters: boolean;
}

export function buildContentHeadline(input: ContentHeadlineInput): string {
  if (input.view === "trash") {
    return input.matchedCount > 0 ? `归档 · ${input.matchedCount} 篇` : "归档里没有作品";
  }

  const isRange = Boolean(input.rangeStart && input.rangeEnd && input.rangeStart !== input.rangeEnd);
  const dateLabel = isRange
    ? `${formatShortDate(input.rangeStart ?? "")} – ${formatShortDate(input.rangeEnd ?? "")}`
    : input.currentDate ? formatDateLabel(input.currentDate) : "全部作品";

  return `${dateLabel}${buildContentHeadlineSuffix({ ...input, isRange })}`;
}
