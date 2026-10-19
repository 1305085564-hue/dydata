import { shiftDateOnly } from "@/lib/loaders/shared";

function formatShanghaiDateTimeLocal(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
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
  const trimmed = value.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/i.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(trimmed);
  if (!match) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const utcMs = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+08:00`);
  return Number.isNaN(utcMs) ? null : new Date(utcMs).toISOString();
}

export function formatShanghaiDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
