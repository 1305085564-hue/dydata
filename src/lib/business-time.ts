/**
 * 全站唯一业务时间（北京时间 Asia/Shanghai / UTC+08:00）与发布日期口径模块。
 *
 * 约束：
 * - 业务自然日、发布时间解析、日界线换算统一从本模块引入；
 * - 其余源码文件不得手写 "+08:00" 或 "Asia/Shanghai"（由 maintainability-gate 门禁守护）。
 */

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
export const SHANGHAI_UTC_OFFSET = "+08:00";

export interface ShanghaiDateOnlyParts {
  year: number;
  month: number;
  day: number;
}

export interface ShanghaiDateTimeParts extends ShanghaiDateOnlyParts {
  hour: number;
  minute: number;
  second?: number;
}

export type PublishedDateFields = {
  published_at?: string | null;
  report_date?: string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day
  );
}

/** 将 Date 格式化为北京时间自然日 YYYY-MM-DD。 */
export function formatShanghaiDateOnly(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 取 Date 在北京时间的年月数字。 */
export function getShanghaiYearMonth(date: Date = new Date()): { year: number; month: number } {
  const dateOnly = formatShanghaiDateOnly(date);
  return {
    year: Number(dateOnly.slice(0, 4)),
    month: Number(dateOnly.slice(5, 7)),
  };
}

/**
 * 以业务日（北京时间）为基准做日历平移：先取当天的上海日期，
 * 再在 UTC 上做纯日历加减，避免用 toISOString()（UTC 切片）在 UTC+8 凌晨少一天。
 */
export function shiftDateOnly(date: Date, days: number): string {
  const reference = formatShanghaiDateOnly(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reference);
  if (!match) return reference;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  // gate:utc-date-ok 纯日历运算：已从北京时间 YYYY-MM-DD 构造 UTC 零点，加减整天后再切回日期
  return value.toISOString().slice(0, 10);
}

/** 严格解析 YYYY-MM-DD 业务日期，不受宿主机时区影响。 */
export function parseShanghaiDateOnly(date: string): ShanghaiDateOnlyParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`无效业务日期：${date}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`无效业务日期：${date}`);
  }

  return { year, month, day };
}

/** 将年月日数字格式化为 YYYY-MM-DD。 */
export function formatShanghaiDateOnlyParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** 指定年月在日历中的天数（month 为 1-12）。 */
export function getShanghaiDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 指定日期的星期几（0=周日 .. 6=周六）。 */
export function getShanghaiWeekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 对 YYYY-MM-DD 业务日期加减整天。 */
export function addShanghaiDateOnly(date: string, days: number): string {
  const parts = parseShanghaiDateOnly(date);
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  value.setUTCDate(value.getUTCDate() + days);
  return formatShanghaiDateOnlyParts(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

/** 计算两个 YYYY-MM-DD 业务日期相差的天数（endDate - startDate）。 */
export function diffShanghaiDays(startDate: string, endDate: string): number {
  const start = parseShanghaiDateOnly(startDate);
  const end = parseShanghaiDateOnly(endDate);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / 86_400_000);
}

/**
 * 展开闭区间 [startDate, endDate] 内的所有业务日期 YYYY-MM-DD。
 * endDate 为空时仅返回 [startDate]；startDate > endDate 返回空数组。
 * 可选 maxDays 用于兜底限制存量整单展开长度。
 */
export function expandShanghaiDateRange(
  startDate: string,
  endDate: string | null = startDate,
  options?: { maxDays?: number },
): string[] {
  const resolvedEnd = endDate ?? startDate;
  if (resolvedEnd < startDate) return [];

  const start = parseShanghaiDateOnly(startDate);
  const end = parseShanghaiDateOnly(resolvedEnd);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const boundaryMs = Date.UTC(end.year, end.month - 1, end.day);
  const maxDays = options?.maxDays;

  const dates: string[] = [];
  while (cursor.getTime() <= boundaryMs && (maxDays === undefined || dates.length < maxDays)) {
    dates.push(
      formatShanghaiDateOnlyParts(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        cursor.getUTCDate(),
      ),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** 拼出带北京时间偏移的时刻串，例如 2026-03-05T20:42:00+08:00。 */
export function formatShanghaiOffsetDateTime(dateStr: string, timeStr: string = "00:00:00"): string {
  return `${dateStr}T${timeStr}${SHANGHAI_UTC_OFFSET}`;
}

/** 北京时间当日零点（带 +08:00 偏移字符串）。 */
export function shanghaiDayStartOffset(dateStr: string): string {
  return formatShanghaiOffsetDateTime(dateStr, "00:00:00");
}

/** 北京时间当日零点对应的 UTC ISO 字符串。 */
export function shanghaiDayStartIso(dateStr: string): string {
  return new Date(shanghaiDayStartOffset(dateStr)).toISOString();
}

/** 北京时间当日零点对应的毫秒时间戳。 */
export function shanghaiDayStartTimestamp(dateStr: string): number {
  return new Date(shanghaiDayStartOffset(dateStr)).getTime();
}

/** 北京时间自然日闭区间 [startDate, endDate] 转为 UTC 半开区间 [startUtc, endUtc)。 */
export function shanghaiDateRangeToUtc(startDate: string, endDate: string): {
  startUtc: string;
  endUtc: string;
} {
  const startUtc = shanghaiDayStartIso(startDate);
  const endDateObj = new Date(shanghaiDayStartOffset(endDate));
  endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
  return { startUtc, endUtc: endDateObj.toISOString() };
}

/** 单个北京时间自然日的 UTC 半开窗口 [start, end)；无效日期返回 null。 */
export function shanghaiDayWindowUtc(dateStr: string): { start: string; end: string } | null {
  const start = new Date(shanghaiDayStartOffset(dateStr));
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** 校验年月日时分秒后按北京时间转为 UTC ISO 字符串；非法日期时间返回 null。 */
export function buildValidatedShanghaiDateTimeIso(parts: ShanghaiDateTimeParts): string | null {
  const { year, month, day, hour, minute, second = 0 } = parts;
  if (
    !isValidCalendarDate(year, month, day)
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
  ) {
    return null;
  }
  const isoLocal = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${SHANGHAI_UTC_OFFSET}`;
  const parsed = new Date(isoLocal);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** 将 Date 格式化为北京时间 datetime-local 字符串 YYYY-MM-DDTHH:mm。 */
export function formatShanghaiDateTimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** 将时间值格式化为中文可读的北京时间展示字符串。 */
export function formatShanghaiDateTimeZh(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { timeZone: SHANGHAI_TIME_ZONE });
}

/**
 * 统一发布时间 / 业务时间解析器（全站唯一出处）：
 * - 带明确时区（Z / ±HH:MM / ±HHMM / GMT / UTC）的，按自带时区解析；
 * - 没带时区的（支持标准 ISO 及常见斜杠/点号/中文年月日格式），一律按北京时间（+08:00）解析；
 * - 日历不合法或无法解析的，返回 null，绝不退回宿主机时区猜测。
 */
export function parseBusinessDateTime(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 1. 显式 ISO 时区偏移（Z / +08:00 / +0800）
  const isoCandidate = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, "$1T$2");
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoCandidate)) {
    const datePrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoCandidate);
    if (
      datePrefix
      && !isValidCalendarDate(Number(datePrefix[1]), Number(datePrefix[2]), Number(datePrefix[3]))
    ) {
      return null;
    }
    const parsed = new Date(isoCandidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // 2. 显式 GMT / UTC（例如 HTTP / RFC 2822 日期串）
  if (/\b(?:GMT|UTC)\b/i.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // 3. 无时区字符串：只接受明确的日期或日期+时间格式，一律按北京时间解释
  const localMatch =
    /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})日?(?:(?:\s*[T\s]\s*)(\d{1,2})\s*[:：]\s*(\d{1,2})(?:\s*[:：]\s*(\d{1,2})(?:\.(\d{1,3}))?)?)?$/.exec(
      trimmed,
    );
  if (!localMatch) return null;

  const year = Number(localMatch[1]);
  const month = Number(localMatch[2]);
  const day = Number(localMatch[3]);
  const hour = localMatch[4] === undefined ? 0 : Number(localMatch[4]);
  const minute = localMatch[5] === undefined ? 0 : Number(localMatch[5]);
  const second = localMatch[6] === undefined ? 0 : Number(localMatch[6]);
  const msPart = localMatch[7] === undefined ? "" : `.${localMatch[7].padEnd(3, "0")}`;

  if (
    !isValidCalendarDate(year, month, day)
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
  ) {
    return null;
  }

  const shanghaiIso = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${msPart}${SHANGHAI_UTC_OFFSET}`;
  const parsed = new Date(shanghaiIso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 统一发布时间解析并转为 UTC ISO 字符串；无效返回 null。 */
export function parseBusinessDateTimeIso(value: unknown): string | null {
  const parsed = parseBusinessDateTime(value);
  return parsed ? parsed.toISOString() : null;
}

/** 导出等服务端范围查询：发布日优先，无发布日的历史记录才按 report_date 回退。 */
export function buildPublishedDateRangeFilter(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const start = from ?? "1900-01-01";
  const end = to ?? "9999-12-31";
  const { startUtc, endUtc } = shanghaiDateRangeToUtc(start, end);
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
    const timestamp = shanghaiDayStartTimestamp(row.report_date);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function getPublishedDateLabel(row: PublishedDateFields): string {
  return getPublishedDateForStats(row) ?? "发布日期未知";
}
