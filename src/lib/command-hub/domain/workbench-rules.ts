import {
  isReviewExemptionAction,
  isReviewFulfillmentAppealAction,
  sortActionItems,
  type ActionCenterSummary,
  type ActionItem,
} from "@/lib/action-center/types";
import type { ExemptionRequest, GroupedApprovalItem } from "@/lib/exemption-approvals";
import type { ApprovalQueueItem } from "@/lib/command-hub/types";
import { VIDEO_SUBMIT_EXPIRED_TRIGGER_LABEL } from "@/lib/video-submit-deadline";

// ---------- 标题：一页一问「还有几件等我拍板？」----------

export function getWorkbenchHeadline(input: {
  isAdmin: boolean;
  view: "queue" | "history";
  approvalCount: number;
  todoCount: number;
  loading: boolean;
}): string {
  const { isAdmin, view, approvalCount, todoCount, loading } = input;
  if (view === "history") return "已处理记录";
  if (!isAdmin) {
    if (loading && todoCount === 0) return "正在同步待办…";
    return todoCount > 0 ? `还有 ${todoCount} 件待办` : "没有待办了";
  }
  if (loading && approvalCount === 0 && todoCount === 0) return "正在同步…";
  if (approvalCount > 0) return `还有 ${approvalCount} 件等你批`;
  if (todoCount > 0) return `申请都批完了，还有 ${todoCount} 件待处理`;
  return "都处理完了";
}

// ---------- 队列：涉及日期越近越靠前，同日先来先审 ----------

function earliestPendingDate(group: GroupedApprovalItem): string {
  const pending = group.dailyItems.filter((d) => d.status === "pending").map((d) => d.dateStr).sort();
  if (pending[0]) return pending[0];
  const starts = group.items.map((item) => item.start_date).filter(Boolean).sort();
  return starts[0] ?? group.created_at.slice(0, 10);
}

export function getQueueItemDate(item: ApprovalQueueItem): string {
  if (item.kind === "exemption") return earliestPendingDate(item.group);
  return (item.appeal.business_date || item.appeal.start_date || item.appeal.created_at).slice(0, 10);
}

function getQueueItemCreatedAt(item: ApprovalQueueItem): string {
  return item.kind === "exemption" ? item.group.created_at : item.appeal.created_at;
}

export function getAppealId(appeal: ExemptionRequest): string {
  return appeal.id || appeal.appeal_id || "";
}

export function buildApprovalQueue(
  groups: GroupedApprovalItem[],
  appeals: ExemptionRequest[],
): ApprovalQueueItem[] {
  const items: ApprovalQueueItem[] = [
    ...groups.map((group) => ({ kind: "exemption" as const, id: group.groupKey, group })),
    ...appeals.map((appeal) => ({ kind: "appeal" as const, id: getAppealId(appeal), appeal })),
  ];
  return items.sort((a, b) => {
    const byDate = getQueueItemDate(a).localeCompare(getQueueItemDate(b));
    if (byDate !== 0) return byDate;
    return getQueueItemCreatedAt(a).localeCompare(getQueueItemCreatedAt(b));
  });
}

export function splitApprovalItems(pendingApprovals: ExemptionRequest[]) {
  return {
    exemptionItems: pendingApprovals.filter((item) => item.source !== "fulfillment_appeal"),
    appealItems: pendingApprovals.filter((item) => item.source === "fulfillment_appeal"),
  };
}

// ---------- 判断依据：机器已算好的，直接摆出来 ----------

export function getMonthContext(group: GroupedApprovalItem): string | null {
  const stats = group.applicant_month_stats;
  if (!stats) return null;
  if (group.nature === "leave") {
    return stats.approved_leave_days > 0 ? `本月已批假 ${stats.approved_leave_days} 天` : "本月还没请过假";
  }
  return stats.approved_waived_days > 0 ? `本月已免交 ${stats.approved_waived_days} 天` : "本月还没免交过";
}

export function isPostSubmitAppeal(appeal: Pick<ExemptionRequest, "review_mode">): boolean {
  return appeal.review_mode === "post_submit";
}

export function formatPostSubmitInterval(appeal: Pick<ExemptionRequest, "elapsed_hours" | "published_at" | "uploaded_at" | "business_date">): string | null {
  if (typeof appeal.elapsed_hours === "number" && Number.isFinite(appeal.elapsed_hours)) {
    const hours = Math.max(0, Math.round(appeal.elapsed_hours));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const restHours = hours % 24;
      return restHours > 0 ? `发布距上传约 ${days} 天 ${restHours} 小时（${hours}h）` : `发布距上传约 ${days} 天（${hours}h）`;
    }
    return `发布距上传约 ${hours} 小时`;
  }
  if (appeal.published_at && appeal.uploaded_at) {
    const pub = appeal.published_at.slice(0, 10);
    const up = appeal.uploaded_at.slice(0, 10);
    return `发布 ${pub} → 上传 ${up}`;
  }
  return null;
}

export function getAppealTriggerText(appeal: ExemptionRequest): string | null {
  if (appeal.appeal_trigger_reason === "manual_published_at") {
    return appeal.ocr_published_at_text
      ? `触发原因：手工改了发布时间（识别原值 ${appeal.ocr_published_at_text}）`
      : "触发原因：手工填写了发布时间";
  }
  if (appeal.appeal_trigger_reason === "expired") return VIDEO_SUBMIT_EXPIRED_TRIGGER_LABEL;
  return null;
}

export function getAppealExecutionLabel(resumePending: boolean | null): string | null {
  if (resumePending === null) return null;
  return resumePending ? "已批准·等成员补传" : "数据已提交";
}

// ---------- 待办：审批队列里已有的补交提醒不再重复出现 ----------

export function getAppealTodoId(todo: ActionItem): string | null {
  return isReviewFulfillmentAppealAction(todo.action) ? todo.action.appealId : null;
}

export function getTodoIsCompletable(todo: ActionItem): boolean {
  return todo.source !== "exemption" && !getAppealTodoId(todo);
}

export function getTodoActionText(todo: ActionItem): string | null {
  if (getAppealTodoId(todo)) return "去审批";
  if (todo.actionUrl) return todo.actionLabel || "去处理";
  return null;
}

export function getTodoItems(
  summary: ActionCenterSummary | null,
  completedIds: readonly string[],
  queuedAppealIds: readonly string[] = [],
): ActionItem[] {
  const queued = new Set(queuedAppealIds);
  const completed = new Set(completedIds);
  const items = (summary?.topItems ?? []).filter((item) => {
    if (isReviewExemptionAction(item.action)) return false;
    if (completed.has(item.id)) return false;
    const appealId = getAppealTodoId(item);
    return !(appealId && queued.has(appealId));
  });
  return sortActionItems(items);
}

// ---------- 杂项 ----------

export function getRelativeTime(iso: string, now: number): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = now - ts;
  if (diff < 3_600_000) return "刚刚";
  const hr = Math.floor(diff / 3_600_000);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
  });
}

export function getApproveAllDescription(items: readonly ApprovalQueueItem[]): string {
  const exemptions = items.filter((item) => item.kind === "exemption").length;
  const postReviews = items.filter((item) => item.kind === "appeal" && isPostSubmitAppeal(item.appeal)).length;
  const preAppeals = items.length - exemptions - postReviews;
  const parts = [
    exemptions > 0 ? `请假/免交 ${exemptions} 件` : "",
    preAppeals > 0 ? `补交 ${preAppeals} 件` : "",
    postReviews > 0 ? `事后核查 ${postReviews} 件` : "",
  ].filter(Boolean);
  return `将同意全部 ${items.length} 件（${parts.join("，")}）。部分已审的申请只同意剩余日期。5 秒内可撤回。`;
}

export function sameSortedIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}
