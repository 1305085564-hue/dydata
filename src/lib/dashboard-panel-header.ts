import type { SubmissionDayStatus, SubmitPanelMode } from "@/lib/dashboard-submission-state";
import type { FormProgress } from "@/lib/video-submit/domain/submit-gaps";
import { getExemptionStateForDate, type ExemptionGrantLike, type ExemptionProfileLike } from "@/lib/豁免";

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
 * 口径对齐管理端发布管理的"未确认"（`get_fulfillment_range`，口径见 docs/reference/链路设计与决策/数据上传链路.md「履约」）：
 * 公司要求每天都发作品，周末和节假日不豁免，所以按自然日算，不看工作日历；
 * 从入职日（joinedDate）起算；今天不算漏（作品第二天才上传）；
 * 有提交、已批准免交/请假、待审批、管理员人工标记过（请假/豁免/确认已发）的日子不算漏；
 * 管理员认定缺勤仍算漏；长期免交由 `getExemptionStateForDate` 逐日判定。
 */
export function summarizeMonthFulfillment({
  today,
  submittedDates,
  exemptDates,
  manualMarkedDates = [],
  joinedDate = null,
  exemptionProfile,
  exemptionGrants = [],
}: {
  today: string;
  submittedDates: readonly string[];
  exemptDates: readonly string[];
  /** 管理员在发布管理人工标记过的日子（请假/豁免/确认已发），不含缺勤。 */
  manualMarkedDates?: readonly string[];
  /** 入职日（上海日期）；缺失时不设下限。 */
  joinedDate?: string | null;
  exemptionProfile?: ExemptionProfileLike | null;
  exemptionGrants?: ExemptionGrantLike[];
}): { submittedCount: number; missedCount: number } {
  const monthPrefix = today.slice(0, 7);
  const submitted = new Set(submittedDates.filter((date) => date.startsWith(monthPrefix)));
  const excluded = new Set(
    [...exemptDates, ...manualMarkedDates].filter((date) => date.startsWith(monthPrefix)),
  );

  let submittedCount = 0;
  let missedCount = 0;
  for (const date of enumerateMonthDatesUntil(monthPrefix, today)) {
    if (submitted.has(date)) {
      submittedCount += 1;
      continue;
    }
    if (date >= today || (joinedDate && date < joinedDate) || excluded.has(date)) continue;
    const exemptionState = exemptionProfile
      ? getExemptionStateForDate(exemptionProfile, date, exemptionGrants)
      : null;
    if (!exemptionState?.isExempt) missedCount += 1;
  }
  return { submittedCount, missedCount };
}
