import {
  formatShanghaiDateTimeLocal,
  formatShanghaiDateTimeZh,
  parseBusinessDateTimeIso,
  shiftDateOnly,
} from "@/lib/business-time";

export function getDefaultPublishedAtValue(now: Date = new Date()) {
  return `${shiftDateOnly(now, -1)}T19:00`;
}

export function getDefaultPublishedAtForBizDate(
  bizDate: string,
  today: string,
  now: Date = new Date(),
) {
  if (bizDate === today) return getDefaultPublishedAtValue(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bizDate);
  if (!match) return getDefaultPublishedAtValue(now);

  // 直接用 bizDate 作为默认发布日期，不减 1 天
  // 修复：用户选哪天，默认发布时间就是哪天，避免与后端 published_at 优先归档逻辑冲突
  return `${bizDate}T19:00`;
}

export function normalizePublishedAtInputValue(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim().replace(" ", "T");
  if (!trimmed) return "";
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return trimmed.slice(0, 16);
    return formatShanghaiDateTimeLocal(date);
  }
  return trimmed.slice(0, 16);
}

export function normalizePublishedAtForStorage(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  return parseBusinessDateTimeIso(value);
}

export function formatShanghaiDateTime(value: string | null | undefined) {
  return formatShanghaiDateTimeZh(value);
}
