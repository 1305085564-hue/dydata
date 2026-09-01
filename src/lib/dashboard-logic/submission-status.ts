/**
 * 提交状态判断逻辑 - 从 Antigravity 提取
 * 根据日期、提交记录、豁免记录判断状态
 */

import { formatShanghaiDateOnlyParts, getShanghaiDaysInMonth } from "./use-exemption-calendar";

export type SubmissionStatus =
  | "submitted" // 已提交
  | "waived" // 已豁免
  | "on_leave" // 请假
  | "pending" // 审批中
  | "unsubmitted" // 未交（今日）
  | "missing" // 漏交（历史）
  | "future"; // 未到

export interface SubmissionStatusResult {
  status: SubmissionStatus;
  label: string;
  description: string;
  tone: "submitted" | "pending" | "editing" | "future";
  isCompleted: boolean;
  canBackfill: boolean;
}

export interface DateStatusOptions {
  date: string;
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
}

/**
 * 获取指定日期的提交状态
 */
export function getDateStatus(options: DateStatusOptions): SubmissionStatusResult {
  const { date, today, submittedDates, waiveDates = [], leaveDates = [], pendingDates = [] } = options;

  // 已提交
  if (submittedDates.includes(date)) {
    return {
      status: "submitted",
      label: "已交",
      description: "当天已提交数据。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
    };
  }

  // 请假
  if (leaveDates.includes(date)) {
    return {
      status: "on_leave",
      label: "请假",
      description: "当天已请假，视作已完成，无需再提交。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
    };
  }

  // 豁免
  if (waiveDates.includes(date)) {
    return {
      status: "waived",
      label: "免交",
      description: "当天已按免交处理，视作已完成，无需再提交。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
    };
  }

  if (pendingDates.includes(date)) {
    return {
      status: "pending",
      label: "审批中",
      description: "该日期已有待审批申请，审批完成前不能重复申请。",
      tone: "pending",
      isCompleted: false,
      canBackfill: false,
    };
  }

  // 未来日期
  if (date > today) {
    return {
      status: "future",
      label: "未到",
      description: "该日期还没到，无需提交。",
      tone: "future",
      isCompleted: false,
      canBackfill: false,
    };
  }

  // 今日未交
  if (date === today) {
    return {
      status: "unsubmitted",
      label: "未交",
      description: "当天还没有提交数据。",
      tone: "pending",
      isCompleted: false,
      canBackfill: true,
    };
  }

  // 历史漏交
  return {
    status: "missing",
    label: "漏交",
    description: "该日期没有提交数据，也没有免交或请假记录。",
    tone: "pending",
    isCompleted: false,
    canBackfill: true,
  };
}

/**
 * 批量获取日期状态（用于日历渲染）
 */
export function getBatchDateStatus(
  dates: string[],
  options: Omit<DateStatusOptions, "date">
): Record<string, SubmissionStatusResult> {
  const result: Record<string, SubmissionStatusResult> = {};

  dates.forEach((date) => {
    result[date] = getDateStatus({ date, ...options });
  });

  return result;
}

/**
 * 生成月份的所有日期
 */
export function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = getShanghaiDaysInMonth(year, month + 1);

  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(formatShanghaiDateOnlyParts(year, month + 1, day));
  }

  return dates;
}

/**
 * 统计本月提交情况
 */
export function getMonthStatistics(
  year: number,
  month: number,
  options: Omit<DateStatusOptions, "date">
) {
  const dates = getMonthDates(year, month);
  const statuses = getBatchDateStatus(dates, options);

  const stats = {
    total: dates.length,
    submitted: 0,
    waived: 0,
    onLeave: 0,
    missing: 0,
    unsubmitted: 0,
    future: 0,
    pending: 0,
    completed: 0, // 已完成（已交 + 请假 + 豁免）
  };

  dates.forEach((date) => {
    const status = statuses[date];
    const key = status.status === "on_leave" ? "onLeave" : status.status;
    stats[key]++;
    if (status.isCompleted) {
      stats.completed++;
    }
  });

  return stats;
}
