/**
 * 豁免日历多选逻辑 Hook - 从 Antigravity 提取
 * 管理日历中的日期选择、快捷操作
 */

import { useState, useCallback, useMemo } from "react";

export type ExemptionType = "waive" | "leave";

export interface ExemptionCalendarState {
  selectedDates: string[];
  exemptionType: ExemptionType;
  reason: string;
}

export interface ExemptionCalendarOptions {
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  initialDates?: string[];
}

/**
 * 豁免日历核心逻辑
 */
export function useExemptionCalendar(options: ExemptionCalendarOptions) {
  const { today, submittedDates, waiveDates = [], leaveDates = [], initialDates = [] } = options;

  const [selectedDates, setSelectedDates] = useState<string[]>(initialDates);
  const [exemptionType, setExemptionType] = useState<ExemptionType>("leave");
  const [reason, setReason] = useState("");

  // 可选日期：本月内、未提交、未豁免、未请假的日期
  const availableDates = useMemo(() => {
    const dates: string[] = [];
    const todayDate = new Date(today);
    const year = todayDate.getFullYear();
    const month = todayDate.getMonth();

    for (let day = 1; day <= todayDate.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split("T")[0];

      // 排除已提交、已豁免、已请假的日期
      if (
        !submittedDates.includes(dateStr) &&
        !waiveDates.includes(dateStr) &&
        !leaveDates.includes(dateStr)
      ) {
        dates.push(dateStr);
      }
    }

    return dates;
  }, [today, submittedDates, waiveDates, leaveDates]);

  // 切换日期选择
  const toggleDate = useCallback((date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  }, []);

  // 快捷操作：一键全选近 7 天
  const selectRecentSevenDays = useCallback(() => {
    const todayDate = new Date(today);
    const recentDates: string[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(todayDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      if (availableDates.includes(dateStr)) {
        recentDates.push(dateStr);
      }
    }

    setSelectedDates(recentDates);
  }, [today, availableDates]);

  // 清空选择
  const clearSelection = useCallback(() => {
    setSelectedDates([]);
  }, []);

  // 验证
  const isValid = useMemo(() => {
    return selectedDates.length > 0 && reason.trim().length > 0;
  }, [selectedDates, reason]);

  // 重置状态
  const reset = useCallback(() => {
    setSelectedDates(initialDates);
    setExemptionType("leave");
    setReason("");
  }, [initialDates]);

  return {
    selectedDates,
    exemptionType,
    reason,
    availableDates,
    isValid,
    toggleDate,
    setExemptionType,
    setReason,
    selectRecentSevenDays,
    clearSelection,
    reset,
  };
}
