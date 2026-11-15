import type { SubmissionDayStatus, SubmitPanelMode } from "@/lib/dashboard-submission-state";
import type { FormProgress } from "@/lib/video-submit/domain/submit-gaps";
import { isChinaWorkingDay } from "@/lib/工作日";

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
 * 纯派生：不改状态机，只把既有 primaryMode / activeDateStatus 翻成一句大白话；
 * 今天还没交、表单已挂载时，再按表单进度（`resolveFormProgress`，源自缺项汇总）往前走。
 */
export function resolvePanelHeaderStatus({
  activeBizDate,
  today,
  primaryMode,
  dayStatus,
  formProgress = null,
}: {
  activeBizDate: string;
  today: string;
  primaryMode: SubmitPanelMode;
  dayStatus: Pick<SubmissionDayStatus, "state">;
  formProgress?: FormProgress | null;
}): PanelHeaderStatus {
  const isToday = activeBizDate === today;

  if (isToday && primaryMode === "create" && dayStatus.state === "unsubmitted") {
    if (formProgress === "ready") return { text: "可以交了", tone: "pending" };
    if (formProgress === "onlyContent") return { text: "还差一步：粘贴文案", tone: "pending" };
    if (formProgress === "ocrFailed") return { text: "这次没认出来，数字请手填", tone: "pending" };
  }

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

function isWorkingDateKey(dateKey: string) {
  return isChinaWorkingDay(new Date(`${dateKey}T12:00:00+08:00`));
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 页头副行的日期：「11 月 13 日 周五」。只做日历换算，不涉及时区。 */
export function formatHeaderDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) return dateKey;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${month} 月 ${day} 日 ${WEEKDAY_LABELS[weekday]}`;
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
 * 已交：本月到今天为止有提交记录的日子（周末交了也算）。
 * 漏交：今天以前的中国工作日（`isChinaWorkingDay`，含调休），没有提交，且不是免交/请假/待审批/缺勤。
 * 与撤掉前的履约条同一口径：休息日免履约，不算漏。
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
    if (date < today && !excluded.has(date) && isWorkingDateKey(date)) missedCount += 1;
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
