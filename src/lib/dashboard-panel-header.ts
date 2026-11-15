import type { SubmissionDayStatus, SubmitPanelMode } from "@/lib/dashboard-submission-state";

/**
 * 工作台页头的派生逻辑独立成文件：dashboard-submission-state.ts 已过 500 行棘轮线，
 * 新逻辑不再往里塞（见 scripts/maintainability-gate.mjs 的基线规则）。
 */

export type PanelHeaderTone = "pending" | "done" | "exempt" | "edit";

export interface PanelHeaderStatus {
  text: string;
  tone: PanelHeaderTone;
}

/**
 * 页头那句状态（工作台唯一主声部）。
 * 纯派生：不改状态机，只把既有 primaryMode / activeDateStatus 翻成一句大白话。
 */
export function resolvePanelHeaderStatus({
  activeBizDate,
  today,
  primaryMode,
  dayStatus,
}: {
  activeBizDate: string;
  today: string;
  primaryMode: SubmitPanelMode;
  dayStatus: Pick<SubmissionDayStatus, "state">;
}): PanelHeaderStatus {
  const isToday = activeBizDate === today;

  if (primaryMode === "editToday") {
    return { text: `修改 · ${activeBizDate}`, tone: "edit" };
  }
  if (primaryMode === "backfill") {
    return { text: `补交 · ${activeBizDate}`, tone: "edit" };
  }

  switch (dayStatus.state) {
    case "submitted":
      return { text: isToday ? "今天已交" : `${activeBizDate} 已交`, tone: "done" };
    case "waive":
      return { text: isToday ? "今天免交" : `${activeBizDate} 免交`, tone: "exempt" };
    case "leave":
      return { text: isToday ? "今天请假" : `${activeBizDate} 请假`, tone: "exempt" };
    case "future":
      return { text: "还没到这一天", tone: "exempt" };
    case "missing":
      return { text: `${activeBizDate} 漏交`, tone: "pending" };
    case "activityError":
      return { text: "记录没加载出来", tone: "pending" };
    default:
      return { text: isToday ? "今天还没交" : `${activeBizDate} 还没交`, tone: "pending" };
  }
}

function enumerateMonthDatesUntil(monthPrefix: string, until: string) {
  const dates: string[] = [];
  const [year, month] = monthPrefix.split("-").map((part) => Number(part));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    if (date > until) break;
    dates.push(date);
  }
  return dates;
}

/**
 * 本月履约摘要：本月已交 x 天，漏 y 天。
 * 口径（自然日）：只有「有提交记录」算已交；今天以前、无提交、且不是免交/请假/待审批/缺勤的日期算漏交；
 * 今天不算漏。免交与请假两头都不计，和月历格子同一套判定。
 */
export function summarizeMonthFulfillment({
  today,
  submittedDates,
  exemptDates,
  absentDates,
}: {
  today: string;
  submittedDates: readonly string[];
  exemptDates: readonly string[];
  absentDates: readonly string[];
}): { submittedCount: number; missedCount: number } {
  const monthPrefix = today.slice(0, 7);
  const submitted = new Set(submittedDates.filter((date) => date.startsWith(monthPrefix)));
  const excluded = new Set(
    [...exemptDates, ...absentDates].filter((date) => date.startsWith(monthPrefix)),
  );

  let submittedCount = 0;
  let missedCount = 0;
  for (const date of enumerateMonthDatesUntil(monthPrefix, today)) {
    if (submitted.has(date)) {
      submittedCount += 1;
      continue;
    }
    if (date < today && !excluded.has(date)) missedCount += 1;
  }
  return { submittedCount, missedCount };
}

type ExemptionNoticeDateSource = {
  start_date?: string | null;
  end_date?: string | null;
  daily_results?: ReadonlyArray<{ date: string }> | undefined;
};

/**
 * 过期的请假/豁免审批通知不再打扰人：涉及日期全部早于今天，就当没有这条通知。
 * 唯一收口点——表单与面板都不再各自判断，避免同一条规则两处实现。
 */
export function isExemptionNoticeExpired(
  notice: ExemptionNoticeDateSource | null,
  today: string,
): boolean {
  if (!notice) return false;
  const dailyDates = (notice.daily_results ?? [])
    .map((item) => item.date)
    .filter((date): date is string => Boolean(date));
  const dates = dailyDates.length > 0
    ? dailyDates
    : [notice.start_date, notice.end_date ?? notice.start_date].filter(
        (date): date is string => Boolean(date),
      );
  if (dates.length === 0) return false;
  return dates.every((date) => date < today);
}

export function dropExpiredExemptionNotice<T extends ExemptionNoticeDateSource>(
  notice: T | null,
  today: string,
): T | null {
  return isExemptionNoticeExpired(notice, today) ? null : notice;
}
