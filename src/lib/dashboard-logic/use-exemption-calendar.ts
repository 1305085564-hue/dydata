/**
 * 豁免日历多选逻辑 Hook - 从 Antigravity 提取
 * 管理日历中的日期选择、快捷操作
 */

import { useState, useCallback, useEffect, useMemo } from "react";

export type ExemptionType = "waive" | "leave";

export interface ExemptionCalendarState {
  selectedDates: string[];
  exemptionType: ExemptionType;
  reason: string;
}

export interface ExemptionCalendarOptions {
  today: string;
  submittedDates: string[];
  additionalSubmittedDates?: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
  initialDates?: string[];
}

export interface ShanghaiDateOnlyParts {
  year: number;
  month: number;
  day: number;
}

/** Parse a YYYY-MM-DD business date without letting the host timezone alter it. */
export function parseShanghaiDateOnly(date: string): ShanghaiDateOnlyParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`无效业务日期：${date}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));

  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw new Error(`无效业务日期：${date}`);
  }

  return { year, month, day };
}

export function formatShanghaiDateOnlyParts(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getShanghaiDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getShanghaiWeekday(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addShanghaiDateOnly(date: string, days: number) {
  const parts = parseShanghaiDateOnly(date);
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  value.setUTCDate(value.getUTCDate() + days);
  return formatShanghaiDateOnlyParts(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

export function mergeSubmittedDates(...dateLists: Array<readonly string[] | undefined>) {
  return Array.from(
    new Set(dateLists.flatMap((dates) => (dates ?? []).filter(Boolean))),
  ).sort();
}

export function isDateAvailable(
  date: string,
  options: {
    today: string;
    submittedDates: string[];
    additionalSubmittedDates?: string[];
    waiveDates?: string[];
    leaveDates?: string[];
    pendingDates?: string[];
  },
) {
  if (date > options.today) return false;
  const submittedDates = new Set(
    mergeSubmittedDates(options.submittedDates, options.additionalSubmittedDates),
  );
  const blockedDates = new Set([
    ...submittedDates,
    ...(options.waiveDates ?? []),
    ...(options.leaveDates ?? []),
    ...(options.pendingDates ?? []),
  ]);
  return !blockedDates.has(date);
}

export function getAvailableExemptionDates(options: {
  today: string;
  submittedDates: string[];
  additionalSubmittedDates?: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
  daysInPast?: number;
}) {
  const submittedDates = new Set(
    mergeSubmittedDates(options.submittedDates, options.additionalSubmittedDates),
  );
  const blockedDates = new Set([
    ...submittedDates,
    ...(options.waiveDates ?? []),
    ...(options.leaveDates ?? []),
    ...(options.pendingDates ?? []),
  ]);

  const daysCount = options.daysInPast ?? 60;
  const dates: string[] = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const dateStr = addShanghaiDateOnly(options.today, -i);
    if (!blockedDates.has(dateStr)) {
      dates.push(dateStr);
    }
  }

  return dates;
}

/**
 * 豁免日历核心逻辑
 */
export function useExemptionCalendar(options: ExemptionCalendarOptions) {
  const {
    today,
    submittedDates,
    additionalSubmittedDates = [],
    waiveDates = [],
    leaveDates = [],
    pendingDates = [],
    initialDates = [],
  } = options;

  const mergedSubmittedDates = useMemo(
    () => mergeSubmittedDates(submittedDates, additionalSubmittedDates),
    [submittedDates, additionalSubmittedDates],
  );

  const blockedDateSet = useMemo(
    () =>
      new Set([
        ...mergedSubmittedDates,
        ...waiveDates,
        ...leaveDates,
        ...pendingDates,
      ]),
    [mergedSubmittedDates, waiveDates, leaveDates, pendingDates],
  );

  const isAvailable = useCallback(
    (date: string) => {
      if (date > today) return false;
      return !blockedDateSet.has(date);
    },
    [today, blockedDateSet],
  );

  const availableDates = useMemo(
    () =>
      getAvailableExemptionDates({
        today,
        submittedDates: mergedSubmittedDates,
        waiveDates,
        leaveDates,
        pendingDates,
      }),
    [today, mergedSubmittedDates, waiveDates, leaveDates, pendingDates],
  );

  const [selectedDates, setSelectedDates] = useState<string[]>(() =>
    initialDates.filter((date) => isAvailable(date)),
  );
  const [exemptionType, setExemptionType] = useState<ExemptionType>("leave");
  const [reason, setReason] = useState("");
  const validSelectedDates = useMemo(() => {
    return selectedDates.filter((date) => isAvailable(date));
  }, [selectedDates, isAvailable]);

  // 异步活动数据到达后，清除已经变成不可申请的本地选择。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 活动数据异步到达后必须回写失效选择。
    setSelectedDates((current) => {
      const next = current.filter((date) => isAvailable(date));
      return next.length === current.length ? current : next;
    });
  }, [isAvailable]);

  // 切换日期选择
  const toggleDate = useCallback(
    (date: string) => {
      setSelectedDates((prev) => {
        if (prev.includes(date)) return prev.filter((d) => d !== date);
        if (!isAvailable(date)) return prev;
        return [...prev, date].sort();
      });
    },
    [isAvailable],
  );

  // 快捷操作：一键全选近 7 天（支持跨月）
  const selectRecentSevenDays = useCallback(() => {
    const recentDates: string[] = [];

    for (let i = 0; i < 7; i++) {
      const dateStr = addShanghaiDateOnly(today, -i);

      if (isAvailable(dateStr)) {
        recentDates.push(dateStr);
      }
    }

    setSelectedDates(recentDates);
  }, [today, isAvailable]);

  // 清空选择
  const clearSelection = useCallback(() => {
    setSelectedDates([]);
  }, []);

  // 验证
  const isValid = useMemo(() => {
    return validSelectedDates.length > 0 && reason.trim().length > 0;
  }, [validSelectedDates, reason]);

  // 重置状态
  const reset = useCallback(() => {
    setSelectedDates(initialDates.filter((date) => isAvailable(date)));
    setExemptionType("leave");
    setReason("");
  }, [initialDates, isAvailable]);

  return {
    selectedDates: validSelectedDates,
    exemptionType,
    reason,
    availableDates,
    isAvailable,
    isValid,
    toggleDate,
    setExemptionType,
    setReason,
    selectRecentSevenDays,
    clearSelection,
    reset,
  };
}

