import type { ProcessedContentRow } from "@/lib/content/data/content-list";

/**
 * 数据复盘页头答案（2026-11-19 重写，取代诗性导语 content-editorial-epigraph）。
 *
 * 一页一问：「这一天发的作品，哪几条值得点开看？」标题直接写答案——
 * 哪天、几篇、几篇优良。异常篇数只在工具栏「只看异常」一处说（效率美学 §1.5）。
 */

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
  for (const row of rows) {
    if (row.quality?.overallGrade === "优") excellent += 1;
    else if (row.quality?.overallGrade === "良") good += 1;
  }
  return { excellent, good };
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
  /** 只有整批作品都在手上时才统计优良；分页只拿到一页时传 null，避免拿一页冒充全部 */
  grades: { excellent: number; good: number } | null;
}

export function buildContentHeadline(input: ContentHeadlineInput): string {
  if (input.view === "trash") {
    return input.matchedCount > 0 ? `归档 · ${input.matchedCount} 篇` : "归档里没有作品";
  }

  const isRange = Boolean(input.rangeStart && input.rangeEnd && input.rangeStart !== input.rangeEnd);
  const dateLabel = isRange
    ? `${formatShortDate(input.rangeStart ?? "")} – ${formatShortDate(input.rangeEnd ?? "")}`
    : input.currentDate ? formatDateLabel(input.currentDate) : "全部作品";

  if (input.matchedCount === 0) {
    return input.hasActiveFilters ? `${dateLabel} · 没有符合筛选的作品` : `${dateLabel} · 没有作品`;
  }

  const showHitRatio = !isRange
    && input.hasActiveFilters
    && input.dayTotal !== null
    && input.dayTotal !== input.matchedCount;
  const countText = showHitRatio
    ? `命中 ${input.matchedCount} / ${input.dayTotal} 篇`
    : `${input.matchedCount} 篇`;
  const gradeText = input.grades ? `，优 ${input.grades.excellent} · 良 ${input.grades.good}` : "";
  return `${dateLabel} · ${countText}${gradeText}`;
}
